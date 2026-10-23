// Minimal reproduction: distinguish browser offline emulation from app/cache work.
import {chromium,firefox,webkit} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const engines={chrome:()=>chromium.launch({channel:'chrome'}),edge:()=>chromium.launch({channel:'msedge'}),firefox:()=>firefox.launch(),webkit:()=>webkit.launch()};
for(const name of process.argv.slice(2).length?process.argv.slice(2):Object.keys(engines)){
const browser=await engines[name](),context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),results=[];
await page.goto('http://127.0.0.1:4187/?no-sw=1');
for(const offline of [false,true]){
  await context.setOffline(offline);
  for(const scheme of ['blob','data'])results.push(await page.evaluate(async({offline,scheme})=>{
    let worker,url;
    try{
      url=scheme==='blob'?URL.createObjectURL(new Blob(['self.postMessage(true)'],{type:'text/javascript'})):'data:text/javascript,self.postMessage(true)';
      const result=await new Promise(resolve=>{
        worker=new Worker(url);worker.onmessage=()=>resolve('message');worker.onerror=e=>{e.preventDefault();resolve('error');};setTimeout(()=>resolve('timeout'),1000);
      });return {offline,scheme,result};
    }catch(e){return {offline,scheme,result:e.name};}
    finally{worker?.terminate();if(scheme==='blob'&&url)URL.revokeObjectURL(url);}
  },{offline,scheme}));
}
await writeFile(new URL(`./evidence/offline-worker-probe-${name}.json`,import.meta.url),JSON.stringify(results,null,2));console.log(name+' '+JSON.stringify(results));await browser.close();
}
