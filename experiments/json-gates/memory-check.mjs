import { chromium } from '@playwright/test';
import { mkdir,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
await mkdir(root+'evidence',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage();page.setDefaultTimeout(30000);
  await page.goto('http://127.0.0.1:4187');await page.waitForFunction(()=>window.gates);
  const main=await page.context().newCDPSession(page),cdp=await browser.newBrowserCDPSession();
  let sequence=0;const pending=new Map();
  cdp.on('Target.receivedMessageFromTarget',event=>{
    const response=JSON.parse(event.message),p=pending.get(response.id);
    if(p){pending.delete(response.id);response.error?p.reject(new Error('CDP measurement')):p.resolve(response.result);}
  });
  const targets=await cdp.send('Target.getTargets');
  const worker=targets.targetInfos.find(t=>t.type==='worker'&&/\/worker-/.test(t.url));
  if(!worker)throw new Error('JSON worker unavailable for heap sampling');
  const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:worker.targetId,flatten:false});
  const command=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++sequence;pending.set(id,{resolve,reject});cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})}).catch(reject);
  });
  const samples=[];
  async function sample(stage,gc=false){
    if(gc){await main.send('HeapProfiler.collectGarbage');await command('HeapProfiler.collectGarbage');}
    const a=await main.send('Runtime.getHeapUsage'),b=await command('Runtime.getHeapUsage');
    samples.push({stage,forcedGC:gc,mainUsed:a.usedSize,mainBacking:a.backingStorageSize,workerUsed:b.usedSize,workerBacking:b.backingStorageSize,workerTotal:b.totalSize,retainedSets:await page.evaluate(()=>gates.state().stats.sets??0)});
  }
  await sample('baseline',true);
  for(let i=0;i<20;i++){
    await page.evaluate(async i=>{const id='m'+i;gates.install(id,JSON.stringify({data:'x'.repeat(1024*1024)}));await gates.inspect(id);},i);
    if([0,9,19].includes(i))await sample('one-MiB-inspection-'+(i+1),true);
  }
  await page.evaluate(async()=>{gates.install('huge',JSON.stringify({data:'x'.repeat(8*1024*1024)}));await gates.inspect('huge');});
  await sample('8MiB-before-explicit-GC');await sample('8MiB-after-explicit-GC',true);
  await page.evaluate(async()=>{await gates.inspect('A');});await sample('evicted-huge-parse',true);
  const result={browser:browser.version(),metric:'Chromium CDP Runtime.getHeapUsage; JS heap only, sampled not a true peak; explicit GC samples are diagnostic',samples};
  await writeFile(root+'evidence/memory-chrome.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
}finally{await browser.close();}
