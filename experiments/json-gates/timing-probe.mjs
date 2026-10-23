// Sequential controls: discriminate clock drift and timer-dispatch delay.
import {firefox,playwrightVersion} from './browser-runtime.mjs';
import {writeFile} from 'node:fs/promises';
const browser=await firefox.launch(),context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),rows=[];
try{
  await page.goto('http://127.0.0.1:4187/?no-sw=1');await page.bringToFront();
  for(const mode of ['long-only','long-only','short-pulse','short-pulse','worker','worker']){
    const result=await page.evaluate(mode=>new Promise(resolve=>{
      const start=performance.now(),wall=Date.now(),results={visibility:document.visibilityState},workers=[];let pulse;
      const done=(key)=>{results[key]={monotonic:performance.now()-start,wall:Date.now()-wall};if(results.long&&(mode==='long-only'||results.short||results.worker)){clearTimeout(pulse);workers.forEach(w=>w.terminate());resolve(results);}};
      setTimeout(()=>done('long'),15000);
      if(mode==='short-pulse'){const tick=()=>{if(performance.now()-start>=15000)done('short');else pulse=setTimeout(tick,Math.min(50,15000-(performance.now()-start)));};tick();}
      if(mode==='worker'){const w=new Worker('data:text/javascript,self.onmessage=e=>setTimeout(()=>postMessage(true),e.data);postMessage("ready")');workers.push(w);w.onmessage=e=>{if(e.data==='ready')w.postMessage(Math.max(0,15000-(performance.now()-start)));else done('worker');};}
    }),mode);rows.push({mode,...result});console.log(JSON.stringify({mode,...result}));
  }
}finally{await writeFile(new URL(`./evidence/timing-probe-${playwrightVersion}.json`,import.meta.url),JSON.stringify({playwrightVersion,rows},null,2));await browser.close();}
