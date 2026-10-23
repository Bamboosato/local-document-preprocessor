// Full built harness with the origin stopped; not identical to a device outage.
import {webkit,playwrightVersion} from './browser-runtime.mjs';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import assert from 'node:assert/strict';
const dist=fileURLToPath(new URL('./dist/',import.meta.url));let requests=0;
const server=createServer(async(req,res)=>{
  requests++;
  const pathname=new URL(req.url,'http://localhost').pathname;
  const path=resolve(dist,'.'+(pathname==='/'?'/index.html':pathname));
  if(!path.startsWith(resolve(dist)+sep)){res.writeHead(403).end();return;}
  try{const body=await readFile(path);res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json'})[extname(path)]??'application/octet-stream');res.end(body);}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const stop=async()=>{if(server.listening)await new Promise(r=>{server.close(r);server.closeAllConnections();});};
const browser=await webkit.launch(),context=await browser.newContext(),page=await context.newPage();let result;
try{
  await page.goto(origin+'/#worker');await page.waitForFunction(()=>!!window.gates);
  await page.evaluate(async()=>{gates.install('transient-fixture','{"sentinel":123}');window.result=await gates.request('transient-fixture','generate',{style:'mermaid'});await gates.diagram.show(result);});
  await page.waitForFunction(()=>gates.diagram.state().status==='rendered');
  const controlled=await page.evaluate(()=>!!navigator.serviceWorker.controller),before=requests;
  await stop();const response=await page.reload();await page.waitForFunction(()=>!!window.gates);
  assert.equal(await page.evaluate(()=>gates.state().business.some(b=>b.id==='transient-fixture')),false);
  await page.evaluate(async()=>{await gates.diagram.show(await gates.request('A','generate',{style:'mermaid'}));});await page.waitForFunction(()=>gates.diagram.state().status==='rendered');
  result={playwrightVersion,browserVersion:browser.version(),controlled,originStopped:!server.listening,originRequestsAfterStop:requests-before,status:response.status(),fromServiceWorker:response.fromServiceWorker(),jsonRegenerated:true,transientNotRestored:true};
  assert.equal(result.fromServiceWorker,true);assert.equal(result.originRequestsAfterStop,0);console.log(JSON.stringify(result));
}catch(error){result={playwrightVersion,result:'fail',errorType:error.name};process.exitCode=1;console.log(JSON.stringify(result));}
finally{await writeFile(new URL(`./evidence/origin-stop-${playwrightVersion}.json`,import.meta.url),JSON.stringify(result,null,2));await browser.close();await stop();}
