import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('./dist/',import.meta.url));
const expectedItems=Number(process.env.POC_EXPECTED_ORIGINALS??68);
if(!Number.isInteger(expectedItems)||expectedItems<68||expectedItems>512)throw Error('invalid expected original count');
const server=createServer(async(req,res)=>{try{
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;
  if(!/^\/(?:index\.html|tiny\.js|worker\.js|sw\.js|assets\/[\w.-]+\.js|licenses\/(?:index\.html|manifest\.json|source-notices\.txt|generator-license\.txt|(?:fastdom|roughjs)\.patch\.txt|original-\d{3}-\d\.txt))?$/.test(pathname))throw Error('unknown');
  const name=pathname==='/'?'index.html':pathname.slice(1);
  res.setHeader('Content-Type',name.endsWith('.html')?'text/html':name.endsWith('.json')?'application/json':name.endsWith('.txt')?'text/plain':'text/javascript');
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'");
  res.end(await readFile(root+name));
}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,channel:process.env.POC_BROWSER_CHANNEL||'chrome'});
try{
  const context=await browser.newContext(),page=await context.newPage();
  const expectedOrigin=`http://127.0.0.1:${server.address().port}`;const external=[];
  page.on('request',r=>{const url=new URL(r.url());if(url.origin!==expectedOrigin)external.push(url.origin);});
  await page.goto(expectedOrigin+'/');
  const visibleLink=await page.locator('a[href="/licenses/index.html"]').isVisible();
  await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;});
  await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.locator('a[href="/licenses/index.html"]').click();
  const result=await page.evaluate(async()=>{
    const response=await fetch('/licenses/manifest.json');const data=await response.json();
    const links=[...document.querySelectorAll('.originals li a')].map(x=>new URL(x.href).pathname);
    const records=[];
    for(const item of data.items){
      const r=await fetch(item.path);const bytes=await r.arrayBuffer();
      const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
      records.push({ok:r.ok&&digest===item.sha256&&links.includes(item.path)});
    }
    const noteResponse=await fetch(data.sourceNotices.path);const noteBytes=await noteResponse.arrayBuffer();
    const noteHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',noteBytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
    const noticeOk=noteResponse.ok&&noteHash===data.sourceNotices.sha256&&!!document.querySelector('a[href="./source-notices.txt"]');
    const patches=[];
    for(const item of data.patches){const response=await fetch(item.path);const bytes=await response.arrayBuffer();const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');patches.push(response.ok&&digest===item.sha256&&!!document.querySelector(`a[href=".${item.path.slice('/licenses'.length)}"]`));}
    const origins=data.items.filter(item=>item.referenceOnly);
    const originCandidatesOk=origins.length===2&&origins.some(x=>x.name==='Jekyll')&&origins.some(x=>x.name==='js-sequence-diagrams')&&document.body.textContent.includes('適用判断は保留');
    const generator=data.generatorReference;const generatorResponse=await fetch(generator.path);const generatorBytes=await generatorResponse.arrayBuffer();const generatorHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',generatorBytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
    const generatorOk=generatorResponse.ok&&generatorHash===generator.sha256&&generator.name==='langium-cli'&&generator.version==='4.4.0'&&!!document.querySelector('a[href="./generator-license.txt"]');
    return {items:data.items.length,links:links.length,allMatch:records.every(x=>x.ok),unique:new Set(links).size===links.length,noticeOk,patchesOk:patches.length===2&&patches.every(Boolean),originCandidatesOk,generatorOk};
  });
  console.log(JSON.stringify({browser:browser.version(),node:process.version,visibleLink,offline:true,...result,external}));
  if(!visibleLink||result.items!==expectedItems||result.links!==expectedItems||!result.allMatch||!result.unique||!result.noticeOk||!result.patchesOk||!result.originCandidatesOk||!result.generatorOk||external.length)process.exitCode=1;
  await context.close();
}finally{await browser.close();server.close();}
