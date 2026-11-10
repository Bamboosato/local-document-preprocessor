import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,readdir,cp,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {startServer} from './poc-server.mjs';
import {writeSw} from './write-sw.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));const exec=promisify(execFile);
const licenseManifest=await readFile(root+'dist/licenses/manifest.json');
for(const [folder,generation] of [['dist-a','A'],['dist-b','B']]){
  await exec(process.execPath,['build.mjs','--out='+folder,'--generation='+generation],{cwd:root,timeout:60000});
  await cp(root+'dist/licenses',root+folder+'/licenses',{recursive:true});
  const html=await readFile(root+folder+'/index.html','utf8');await writeFile(root+folder+'/index.html',html.replace('</body>','<a href="/licenses/index.html">第三者ライセンス原文候補</a></body>'));
  await writeSw(root+folder);
}
const hash=b=>createHash('sha256').update(b).digest('hex');
const workerA=hash(await readFile(root+'dist-a/worker.js')),workerB=hash(await readFile(root+'dist-b/worker.js'));
const htmlA=hash(await readFile(root+'dist-a/index.html')),htmlB=hash(await readFile(root+'dist-b/index.html'));
const entryHash=async directory=>{const files=(await readdir(root+directory+'/assets')).filter(f=>f.endsWith('.js'));assert.equal(files.length,1);return hash(await readFile(root+directory+'/assets/'+files[0]));};
const entryA=await entryHash('dist-a'),entryB=await entryHash('dist-b');
assert.notEqual(workerA,workerB);assert.notEqual(htmlA,htmlB);assert.notEqual(entryA,entryB);
let phase='A';
const server=await startServer(()=>root+(phase==='A'?'dist-a':'dist-b'),pathname=>pathname==='/sw.js'&&phase==='broken'?"self.addEventListener('install',e=>e.waitUntil(caches.open('tiny-test-failed').then(c=>c.addAll(['/missing']))));":undefined);
const browser=await chromium.launch({headless:true,channel:process.env.POC_BROWSER_CHANNEL||'chrome'});
try{
  const context=await browser.newContext();const old=await context.newPage();old.setDefaultTimeout(15000);
  await old.goto(server.origin);await old.waitForFunction(()=>window.poc?.version==='A');
  await old.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;});
  await old.reload();await old.waitForFunction(()=>!!navigator.serviceWorker.controller);await old.evaluate(()=>{window.originalController=navigator.serviceWorker.controller;});
  const updateTo=async expected=>old.evaluate(async expected=>{
    const reg=await navigator.serviceWorker.getRegistration('/');
    const changed=new Promise(resolve=>{const timer=setTimeout(()=>resolve(false),10000);reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker.addEventListener('statechange',()=>{if(worker.state===expected){clearTimeout(timer);resolve(true);}});},{once:true});});
    await reg.update();return changed;
  },expected);
  phase='broken';assert.equal(await updateTo('redundant'),true);
  assert.equal(await old.evaluate(()=>navigator.serviceWorker.controller===window.originalController),true);
  phase='B';assert.equal(await updateTo('installed'),true);
  assert.equal(await old.evaluate(()=>navigator.serviceWorker.controller===window.originalController),true);
  const browserWorkerHash=page=>page.evaluate(async()=>{const bytes=await (await fetch('/worker.js')).arrayBuffer();return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');});
  assert.equal(await browserWorkerHash(old),workerA);assert.equal(await old.evaluate(()=>window.poc.version),'A');
  await old.reload();assert.equal(await old.evaluate(()=>window.poc.version),'A');assert.equal(await browserWorkerHash(old),workerA);
  await old.close();const fresh=await context.newPage();fresh.setDefaultTimeout(15000);
  await fresh.goto(server.origin);await fresh.evaluate(()=>navigator.serviceWorker.ready);await fresh.reload();
  await fresh.waitForFunction(()=>window.poc?.version==='B'&&navigator.serviceWorker.controller);
  assert.equal(await browserWorkerHash(fresh),workerB);
  await context.setOffline(true);await fresh.reload();await fresh.waitForFunction(()=>window.poc?.version==='B');
  const rendered=await fresh.evaluate(async()=>{await window.poc.render('{"generation":"OFFLINE_B"}');return !!document.querySelector('#result svg');});assert.equal(rendered,true);
  assert.equal(await browserWorkerHash(fresh),workerB);
  const offlineManifestHash=await fresh.evaluate(async()=>{const bytes=await (await fetch('/licenses/manifest.json')).arrayBuffer();return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');});assert.equal(offlineManifestHash,hash(licenseManifest));
  const originalHashesMatch=await fresh.evaluate(async()=>{const manifest=await (await fetch('/licenses/manifest.json')).json();for(const item of [...manifest.items,manifest.sourceNotices,manifest.generatorReference,...manifest.patches]){const response=await fetch(item.path);const bytes=await response.arrayBuffer();const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');if(!response.ok||digest!==item.sha256)return false;}return true;});assert.equal(originalHashesMatch,true);
  console.log(JSON.stringify({browser:browser.version(),differentHtmlCodeAndWorkerBytes:true,failedUpdateRetainedA:true,BWaitedWithAClient:true,oldReloadUsedA:true,afterOldCloseActivatedB:true,offlineBRendered:true,offlineLicenseManifestAndOriginalsMatch:true,workerHashes:{A:workerA,B:workerB},htmlHashes:{A:htmlA,B:htmlB},entryHashes:{A:entryA,B:entryB}}));
  await context.close();
}finally{await browser.close();await server.close();}
