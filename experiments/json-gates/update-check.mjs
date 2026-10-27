import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium,playwrightVersion} from './browser-runtime.mjs';
import {readinessCSP} from './readiness-policy.mjs';
import {integrationCSP} from './integration-policy.mjs';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {parseText,generate} from './core.mjs';
const integrated=process.env.UPDATE_PROFILE==='integration';
const prefix=integrated?'json-integration-':'json-readiness-';
const swPath=integrated?'integration-sw.js':'readiness-sw.js';
const root=fileURLToPath(new URL(integrated?'./dist-integration/':'./dist-readiness/',import.meta.url));
const manifest=JSON.parse(await readFile(resolve(root,integrated?'integration-assets.json':'readiness-assets.json'),'utf8'));
const original=await readFile(resolve(root,swPath),'utf8');
let pdfBytes;
if(integrated){const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);pdf.addPage().drawText('Synthetic integration fixture',{font,size:12});pdfBytes=Array.from(await pdf.save());}
async function verifyWASM(page){if(integrated)assert.deepEqual(await page.evaluate(bytes=>integration.pdf(bytes),pdfBytes),{pdfConverted:true,hasOutput:true,verified:true});}
const fixture=generate(parseText('{"value":9007199254740993}'),'','mermaid');
await mkdir(new URL('./evidence/',import.meta.url),{recursive:true});
async function serve(){
  const state={version:'v1',fault:'',faultedRequests:0};
  const server=createServer(async(req,res)=>{
    try{
      const path=new URL(req.url,'http://localhost').pathname;
      res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',integrated?integrationCSP:readinessCSP);
      if(path==='/'+swPath){
        let code=original.replace(prefix+manifest.generation,prefix+manifest.generation+'-'+state.version);
        if(state.fault==='storage')code="caches.open=async()=>{throw new DOMException('fixture','SecurityError');};\n"+code;
        if(state.fault==='quota')code="const originalOpen=caches.open.bind(caches);caches.open=async key=>{const c=await originalOpen(key);return {addAll:async()=>{throw new DOMException('fixture','QuotaExceededError');},match:c.match.bind(c)};};\n"+code;
        code+=`\nself.fixtureVersion='${state.version}';self.addEventListener('message',event=>{if(event.data==='fixture-version')event.ports[0].postMessage('${state.version}');});`;
        res.setHeader('Content-Type','text/javascript');res.end(code);return;
      }
      if(state.version==='v2'&&state.fault==='asset'&&path.includes(integrated?'anydoc_wasm_bg-':'layout-worker-')){state.faultedRequests++;res.writeHead(404).end();return;}
      const target=resolve(root,'.'+decodeURIComponent(path));if(!target.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403).end();return;}
      const bytes=await readFile(target);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.wasm':'application/wasm'})[extname(target)]??'text/plain');res.end(bytes);
    }catch{res.writeHead(404).end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  return {state,url:'http://127.0.0.1:'+server.address().port,close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
async function version(page){return page.evaluate(()=>new Promise(resolve=>{
  if(!navigator.serviceWorker.controller){resolve(null);return;}
  const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();resolve(null);},2000);
  channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(e.data);};navigator.serviceWorker.controller.postMessage('fixture-version',[channel.port2]);
}));}
async function open(context,url){const p=await context.newPage();await p.goto(url+'/readiness.html');await p.waitForFunction(()=>!!window.readiness);await p.evaluate(()=>navigator.serviceWorker.ready);await p.waitForFunction(()=>!!navigator.serviceWorker.controller);return p;}
async function update(page){await page.evaluate(async()=>{
  window.installStates=[];const reg=await navigator.serviceWorker.getRegistration();
  reg.addEventListener('updatefound',()=>{const w=reg.installing;window.installStates.push(w.state);w.addEventListener('statechange',()=>window.installStates.push(w.state));});await reg.update();
});}
for(const name of process.argv.slice(2).length?process.argv.slice(2):['chrome','edge']){
  const launches={chrome:()=>chromium.launch({channel:'chrome'}),edge:()=>chromium.launch({channel:'msedge'}),chromium:()=>chromium.launch()};
  const browser=await launches[name](),checks=[];
  try{
    for(const [suffix,fault]of [['01',''],['02','asset'],['03','quota'],['04','storage']]){
      const id=(integrated?'IU-':'UP-')+suffix;
      const server=await serve(),context=await browser.newContext();context.setDefaultTimeout(20000);let stage='setup';
      try{
        const p=await open(context,server.url);assert.equal(await version(p),'v1');
        await verifyWASM(p);
        await p.evaluate(async result=>{await readiness.diagram.show(result);await caches.open('unrelated-cache');},fixture);await p.waitForFunction(()=>readiness.diagram.state().status==='rendered');
        const second=fault?'':await open(context,server.url);
        server.state.version='v2';server.state.fault=fault;stage='install';await update(p);
        if(fault){
          await p.waitForFunction(()=>window.installStates.includes('redundant'));
          assert.equal(await version(p),'v1');assert.equal(await p.evaluate(()=>readiness.source()),fixture.code);
          const names=await p.evaluate(()=>caches.keys());assert.ok(names.includes(prefix+manifest.generation+'-v1'));assert.ok(!names.includes(prefix+manifest.generation+'-v2'));assert.ok(names.includes('unrelated-cache'));
          await verifyWASM(p);
          if(fault==='asset')assert.ok(server.state.faultedRequests>0);
          checks.push({id,status:'pass',data:{oldGenerationRetained:true,partialRemoved:true,validatedSourceRetained:true,faultInjection:fault,...(integrated?{bothWASMRetained:true}: {})}});
        }else{
          await p.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);stage='waiting';
          assert.equal(await version(p),'v1');assert.equal(await version(second),'v1');assert.equal(await p.evaluate(()=>readiness.source()),fixture.code);
          await p.close();assert.equal(await version(second),'v1');await second.close();stage='activate';
          const activationDeadline=Date.now()+15000;
          while(true){
            let activated=false;
            for(const worker of context.serviceWorkers())if(await worker.evaluate(()=>self.fixtureVersion==='v2'&&!self.registration.waiting&&!self.registration.installing&&self.registration.active?.state==='activated').catch(()=>false))activated=true;
            if(activated)break;if(Date.now()>activationDeadline)throw new Error('activation-deadline');await new Promise(r=>setTimeout(r,50));
          }
          const next=await open(context,server.url);
          const deadline=Date.now()+15000;while(await version(next)!=='v2'){if(Date.now()>deadline)throw new Error('activation-deadline');await new Promise(r=>setTimeout(r,50));}
          const names=await next.evaluate(()=>caches.keys());assert.ok(!names.includes(prefix+manifest.generation+'-v1'));assert.ok(names.includes(prefix+manifest.generation+'-v2'));assert.ok(names.includes('unrelated-cache'));
          assert.equal(await next.evaluate(()=>readiness.source()===undefined),true);stage='offline';await context.setOffline(true);await next.reload();await next.waitForFunction(()=>!!window.readiness);
          await next.evaluate(result=>readiness.diagram.show(result),fixture);await next.waitForFunction(()=>readiness.diagram.state().status==='rendered');await context.setOffline(false);
          await context.setOffline(true);try{await verifyWASM(next);}finally{await context.setOffline(false);}
          checks.push({id,status:'pass',data:{twoTabsRetained:true,activatedAfterTabsClosed:true,oldOwnedCacheRemoved:true,unrelatedRetained:true,inputNotRestored:true,newOfflineWorkers:true,...(integrated?{bothOfflineWASM:true}: {})}});
        }
        console.log(`${name} ${id} PASS`);
      }catch(error){checks.push({id,status:'fail',errorType:error.name,stage});process.exitCode=1;console.log(`${name} ${id} FAIL ${stage} ${error.name}`);}
      finally{await context.close();await server.close();}
    }
  }finally{await writeFile(new URL(`./evidence/${integrated?'integration-update':'update'}-${name}.json`,import.meta.url),JSON.stringify({profile:integrated?'integration':'readiness',engine:name,version:browser.version(),playwrightVersion,checks},null,2));await browser.close();}
}
