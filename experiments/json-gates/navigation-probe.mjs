// Literal-SW response, no app/cache/framework. Each cell has its own origin.
import {webkit,chromium,firefox,playwrightVersion} from './browser-runtime.mjs';
import {createServer} from 'node:http';
import {writeFile} from 'node:fs/promises';
const engines={chrome:()=>chromium.launch({channel:'chrome'}),firefox:()=>firefox.launch(),webkit:()=>webkit.launch()};
const worker="self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>e.respondWith(new Response('<!doctype html><title>static-probe</title>',{headers:{'content-type':'text/html'}})));";
for(const name of process.argv.slice(2).length?process.argv.slice(2):Object.keys(engines)){
  const browser=await engines[name](),rows=[];
  try{
    for(const outage of ['online','setOffline','origin-stopped','http-blocked']){
      let requests=0;
      const server=createServer((req,res)=>{requests++;res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',req.url==='/sw.js'?'text/javascript':'text/html');res.end(req.url==='/sw.js'?worker:'<!doctype html><title>origin-probe</title>');});
      await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
      const stop=async()=>{if(!server.listening)return;await new Promise(r=>{server.close(r);server.closeAllConnections();});};
      const context=await browser.newContext(),page=await context.newPage();
      try{
        await page.goto(origin);await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}));});
        const controlled=await page.evaluate(()=>!!navigator.serviceWorker.controller),before=requests;
        if(outage==='setOffline')await context.setOffline(true);
        if(outage==='origin-stopped')await stop();
        if(outage==='http-blocked')await context.route('**/*',r=>r.abort());
        try{const response=await page.goto(origin+'/uncached-target',{timeout:10000});rows.push({outage,controlled,status:response.status(),fromServiceWorker:response.fromServiceWorker(),result:await page.title(),originRequests:requests-before});}
        catch{rows.push({outage,controlled,result:'navigation-error',originRequests:requests-before});}
        if(['setOffline','origin-stopped'].includes(outage)){
          const negative=await browser.newContext({serviceWorkers:'block'});
          try{if(outage==='setOffline')await negative.setOffline(true);const p=await negative.newPage();let failed=false;try{await p.goto(origin+'/never-acquired',{timeout:5000});}catch{failed=true;}rows.push({outage,control:'no-worker',failedAsExpected:failed});}finally{await negative.close();}
        }
      }finally{await context.close();await stop();}
    }
  }finally{await writeFile(new URL(`./evidence/navigation-probe-${name}-${playwrightVersion}.json`,import.meta.url),JSON.stringify({playwrightVersion,browserVersion:browser.version(),rows},null,2));await browser.close();}
  console.log(name+' '+playwrightVersion+' '+JSON.stringify(rows));
}
