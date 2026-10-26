import {chromium,playwrightVersion} from './browser-runtime.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir(new URL('./evidence/',import.meta.url),{recursive:true});
let browser;const samples=[];let status='fail',errorType;
try{
  browser=await chromium.launch({channel:'chrome'});const page=await browser.newPage();page.setDefaultTimeout(60000);
  await page.goto('http://127.0.0.1:4187/#worker');await page.waitForFunction(()=>!!window.gates);
  const main=await page.context().newCDPSession(page),cdp=await browser.newBrowserCDPSession();
  const worker=(await cdp.send('Target.getTargets')).targetInfos.find(t=>t.type==='worker'&&/\/worker-/.test(t.url));
  assert.ok(worker);
  const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:worker.targetId,flatten:false});
  let sequence=0;const pending=new Map();
  cdp.on('Target.receivedMessageFromTarget',event=>{const response=JSON.parse(event.message),p=pending.get(response.id);if(p){pending.delete(response.id);response.error?p.reject(new Error('CDP')):p.resolve(response.result);}});
  const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})}).catch(reject);});
  async function sample(stage,gc=false){
    if(gc){await main.send('HeapProfiler.collectGarbage');await command('HeapProfiler.collectGarbage');}
    const a=await main.send('Runtime.getHeapUsage'),b=await command('Runtime.getHeapUsage');
    const state=await page.evaluate(()=>({sets:gates.state().stats.sets,completed:gates.state().business.filter(b=>b.hasResult).length}));
    samples.push({stage,forcedGC:gc,mainUsed:a.usedSize,mainBacking:a.backingStorageSize,workerUsed:b.usedSize,workerBacking:b.backingStorageSize,...state});
    assert.ok((state.sets??0)<=1);
  }
  await sample('baseline',true);
  await page.evaluate(async()=>{gates.install('max','"'+'x'.repeat(50*1024**2-2)+'"');await gates.inspect('max');});
  await sample('50MiB-inspected');await sample('50MiB-inspected-GC',true);
  await page.evaluate(async()=>{gates.install('max','{}');await gates.inspect('A');});await sample('50MiB-evicted-GC',true);
  for(let i=0;i<20;i++){
    await page.evaluate(async i=>{const id='result-'+i;gates.install(id,JSON.stringify(Array(1000).fill({text:'x'.repeat(900)})));await gates.convert(id,'','records');},i);
    await sample('completed-'+(i+1));
  }
  assert.equal(samples.at(-1).completed,20);await sample('20-results-GC',true);
  await page.evaluate(async()=>{gates.install('diagram',JSON.stringify(Array(199).fill('😀'.repeat(90))));const result=await gates.request('diagram','generate',{style:'mermaid'});await gates.diagram.show(result);});
  await page.waitForFunction(()=>gates.diagram.state().status==='rendered');await sample('20-results-plus-200-node-diagram');await sample('20-results-plus-diagram-GC',true);
  await page.evaluate(async()=>{gates.diagram.clear();for(let i=0;i<20;i++)gates.install('result-'+i,'{}');gates.install('diagram','{}');await gates.inspect('A');});
  await sample('results-replaced-and-parse-evicted-GC',true);assert.equal(samples.at(-1).completed,0);
  status='pass';console.log('G02-M01 PASS samples='+samples.length);
}catch(error){errorType=error.name;process.exitCode=1;console.log('G02-M01 FAIL '+errorType);}
finally{
  await writeFile(new URL('./evidence/memory-readiness-chrome.json',import.meta.url),JSON.stringify({base:'48f975a',playwrightVersion,browser:browser?.version(),id:'G02-M01',status,errorType,metric:'sampled CDP UI and JSON Worker heap/backing storage; excludes OS/native/process total, diagram Worker transient peak; GC samples are diagnostic',samples},null,2));await browser?.close();
}
