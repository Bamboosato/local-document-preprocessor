import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('./dist/',import.meta.url));
const server=createServer(async(req,res)=>{try{
  const path=new URL(req.url,'http://localhost').pathname;
  if(!/^\/(?:index\.html|tiny\.js|worker\.js|assets\/[\w.-]+\.js)?$/.test(path))throw Error();
  const name=path==='/'?'index.html':path.slice(1);
  res.setHeader('Content-Type',name.endsWith('.html')?'text/html':'text/javascript');
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'");
  res.end(await readFile(root+name));
}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,channel:process.env.POC_BROWSER_CHANNEL||'chrome'});
try {
  const page=await browser.newPage(); const requests=[], external=[];
  const expectedOrigin=`http://127.0.0.1:${server.address().port}`;
  page.on('request',r=>{const u=new URL(r.url());if(u.origin!==expectedOrigin)external.push(u.origin);requests.push(u.pathname);});
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(()=>!!window.poc);
  const result=await page.evaluate(async()=>{
    const code=await window.poc.render('{"日本語":"😀","children":[1,2]}');
    const labels=document.querySelector('#result').textContent;
    const svg=!!document.querySelector('#result svg');
    const fixtures=['{"日本語":"😀","children":[1,2]}','[null,true,{"半角ｶﾅ":"長い値","nested":[]}]','42','{"unsafe":"<img src=x onerror=alert(1)>","symbols":"a\n b & < >"}'.replace('a\n b','a\\n b')];
    const cases=[];
    for(const text of fixtures){
      try{
        const graph=window.poc.graph(text);await window.poc.render(text);
        const root=document.querySelector('#result');
        const nodes=[...root.querySelectorAll('.node')];
        const edges=[...root.querySelectorAll('path.flowchart-link')];
        const labelsMatch=graph.labels.every((label,i)=>nodes.some(n=>new RegExp(`-flowchart-n${i}-\\d+$`).test(n.id)&&n.textContent===label));
        const edgeMatch=graph.parents.every((parent,i)=>parent<0||edges.some(e=>new RegExp(`-L_n${parent}_n${i}_\\d+$`).test(e.id)))&&edges.length===graph.parents.filter(p=>p>=0).length;
        cases.push({nodes:nodes.length===graph.labels.length,labelsMatch,edgeMatch,safe:!root.querySelector('script,foreignObject,image,[onerror]')});
      }catch(error){cases.push({error:String(error)});}
    }
    const limits={};
    for(const count of [199,200,201]){
      try{window.poc.graph(JSON.stringify(Array.from({length:count-1},()=>null)));limits[count]=true;}catch{limits[count]=false;}
    }
    const displayLimits=[51200-1,51200,51200+1].map(n=>window.poc.withinDisplayLimit('x'.repeat(n)));
    const boundary=[];
    for(const delta of [299,300,301]){
      const values=Array.from({length:199},()=> '漢'.repeat(59));
      let remain=delta;for(let i=0;remain>0;i++){const n=Math.min(100,remain);values[i]+='x'.repeat(n);remain-=n;}
      const text=JSON.stringify(values);const prepared=await window.poc.prepare(text);
      boundary.push({bytes:new TextEncoder().encode(prepared.code).length,displayable:prepared.displayable,text});
    }
    let overRejected=false;try{await window.poc.render(boundary[2].text);}catch(error){overRejected=error.message==='display-limit'&&!document.querySelector('#result svg');}
    const boundaryRendered=[];
    for(const entry of boundary.slice(0,2)){
      await window.poc.render(entry.text);boundaryRendered.push(document.querySelectorAll('#result .node').length===200);
    }
    const realBoundaries=boundary.map(({bytes,displayable})=>({bytes,displayable}));
    const started=performance.now();
    const maxCode=await window.poc.render(JSON.stringify(Array.from({length:199},()=>null)));
    const maxDurationMs=Math.round(performance.now()-started);
    const maxNodes=document.querySelectorAll('#result .node').length;
    const testWorker=code=>new Promise(resolve=>{const w=new Worker('/worker.js');w.onmessage=e=>{resolve(e.data);w.terminate()};w.onerror=()=>resolve({error:'worker error'});w.postMessage(code);});
    const worker=await testWorker(code);
    const invalid=await testWorker('flowchart TD\n  A -->');
    const pending=window.poc.render('{"old":"STALE_TOKEN"}');window.poc.clear();
    const stale=await pending;const cleared=!document.querySelector('#result svg');
    const nativeWorker=window.Worker;let failWorker;
    window.Worker=class {postMessage(){failWorker=this;}terminate(){}};
    const oldFailure=window.poc.render('{"old":"STALE_FAILURE"}');
    for(let i=0;i<50&&!failWorker;i++)await new Promise(r=>setTimeout(r,0));
    if(!failWorker)throw Error('worker-not-started');
    window.poc.clear();failWorker.onmessage({data:{parse:false}});
    const staleFailure=await oldFailure;failWorker=undefined;
    const oldSuccess=window.poc.render('{"old":"STALE_SUCCESS"}');
    for(let i=0;i<50&&!failWorker;i++)await new Promise(r=>setTimeout(r,0));
    if(!failWorker)throw Error('worker-not-started');
    window.poc.clear();failWorker.onmessage({data:{parse:true}});
    const staleSuccess=await oldSuccess;window.Worker=nativeWorker;
    let invalidJsonRejected=false;
    try{await window.poc.render('{');}catch{invalidJsonRejected=true;}
    await window.poc.render('{"retry":"RECOVERY"}');
    const recovered=document.querySelector('#result').textContent.includes('RECOVERY');
    return {code:code.startsWith('flowchart TD'),svg,japanese:labels.includes('日本語'),emoji:labels.includes('😀'),cases,limits,displayLimits,realBoundaries,overRejected,boundaryRendered,maxDurationMs,maxNodes,maxGenerated:!!maxCode,worker,invalid,stale,cleared,staleFailure,staleSuccess,invalidJsonRejected,recovered};
  });
  console.log(JSON.stringify({result,requests,external}));
  if(external.length||!result.code||!result.svg||!result.japanese||!result.emoji||!result.worker.parse||result.invalid.parse||result.stale!=='stale'||!result.cleared||result.staleFailure!=='stale'||result.staleSuccess!=='stale'||!result.invalidJsonRejected||!result.recovered||result.cases.some(c=>!c.nodes||!c.labelsMatch||!c.edgeMatch||!c.safe)||!result.limits[199]||!result.limits[200]||result.limits[201]||JSON.stringify(result.displayLimits)!=='[true,true,false]'||JSON.stringify(result.realBoundaries)!=='[{"bytes":51199,"displayable":true},{"bytes":51200,"displayable":true},{"bytes":51201,"displayable":false}]'||!result.overRejected||JSON.stringify(result.boundaryRendered)!=='[true,true]'||result.maxNodes!==200)process.exitCode=1;
}finally{await browser.close();server.close();}
