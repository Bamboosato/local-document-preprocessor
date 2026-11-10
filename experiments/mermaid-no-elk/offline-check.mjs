import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('./dist/',import.meta.url));
let brokenUpdate=false,successfulUpdate=false;
const server=createServer(async(req,res)=>{try{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/sw.js'&&brokenUpdate){res.setHeader('Content-Type','text/javascript');res.setHeader('Cache-Control','no-store');res.end("self.addEventListener('install',e=>e.waitUntil(caches.open('tiny-poc-failed-v2').then(c=>c.addAll(['/missing-update-asset']))));");return;}
  if(path==='/sw.js'&&successfulUpdate){res.setHeader('Content-Type','text/javascript');res.setHeader('Cache-Control','no-store');const js=await readFile(root+'sw.js','utf8');res.end(js.replace(/tiny-poc-[a-f0-9]{16}/,'tiny-poc-test-new-generation'));return;}
  if(!/^\/(?:index\.html|tiny\.js|worker\.js|sw\.js|assets\/[\w.-]+\.js|licenses\/(?:index\.html|manifest\.json|source-notices\.txt|generator-license\.txt|(?:fastdom|roughjs)\.patch\.txt|original-\d{3}-\d\.txt))?$/.test(path))throw Error();
  const name=path==='/'?'index.html':path.slice(1);
  res.setHeader('Content-Type',name.endsWith('.html')?'text/html':name.endsWith('.json')?'application/json':name.endsWith('.txt')?'text/plain':'text/javascript');
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'");
  res.end(await readFile(root+name));
}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,channel:process.env.POC_BROWSER_CHANNEL||'chrome'});
try{
  const context=await browser.newContext();const page=await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;});
  await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await page.evaluate(()=>{window.originalController=navigator.serviceWorker.controller;});
  brokenUpdate=true;
  const updateFailed=await page.evaluate(async()=>{
    const registration=await navigator.serviceWorker.getRegistration('/');
    const failed=new Promise(resolve=>{
      const timer=setTimeout(()=>resolve(false),10000);
      registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker.addEventListener('statechange',()=>{if(worker.state==='redundant'){clearTimeout(timer);resolve(true);}});},{once:true});
    });
    await registration.update();return failed;
  });
  const oldControllerKept=await page.evaluate(()=>navigator.serviceWorker.controller===window.originalController);
  brokenUpdate=false;
  successfulUpdate=true;
  const waiting=await page.evaluate(async()=>{
    const registration=await navigator.serviceWorker.getRegistration('/');
    const installed=new Promise(resolve=>{const timer=setTimeout(()=>resolve(false),10000);registration.addEventListener('updatefound',()=>{const w=registration.installing;w.addEventListener('statechange',()=>{if(w.state==='installed'){clearTimeout(timer);resolve(true);}});},{once:true});});
    await registration.update();return installed;
  });
  const oldTabStillControlled=await page.evaluate(()=>navigator.serviceWorker.controller===window.originalController);
  await context.setOffline(true);await page.reload();await page.waitForFunction(()=>!!window.poc);
  const marker='POCINPUT-'+crypto.randomUUID();
  const result=await page.evaluate(async marker=>{await window.poc.render(JSON.stringify({offline:marker}));return !!document.querySelector('#result svg');},marker);
  const evidence=await page.evaluate(async marker=>{const keys=await caches.keys();const records=(await Promise.all(keys.map(async k=>{const c=await caches.open(k);return Promise.all((await c.keys()).map(async r=>({path:new URL(r.url).pathname,containsInput:(await (await c.match(r)).text()).includes(marker)})));}))).flat();return {paths:records.map(r=>r.path).sort(),containsInput:records.some(r=>r.containsInput)};},marker);
  console.log(JSON.stringify({cachedAssets:evidence.paths.length,licenseAssets:evidence.paths.filter(p=>p.startsWith('/licenses/')).length,offlineRendered:result,syntheticDataCached:evidence.containsInput,updateFailed,oldControllerKept}));
  console.log(JSON.stringify({newGenerationWaiting:waiting,oldTabStillControlled}));
  let expectedAssets=4;try{const manifest=JSON.parse(await readFile(root+'licenses/manifest.json','utf8'));expectedAssets+=manifest.items.length+manifest.patches.length+3+(manifest.generatorReference?1:0);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(!result||evidence.containsInput||evidence.paths.length!==expectedAssets*2||!updateFailed||!oldControllerKept||!waiting||!oldTabStillControlled)process.exitCode=1;
  await context.close();
}finally{await browser.close();server.close();}
