import {chromium,firefox,webkit,playwrightVersion} from './browser-runtime.mjs';
import {generate,parseText} from './core.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const engines={chrome:()=>chromium.launch({channel:'chrome'}),edge:()=>chromium.launch({channel:'msedge'}),firefox:()=>firefox.launch(),webkit:()=>webkit.launch()};
const dir=new URL('./evidence/',import.meta.url);await mkdir(dir,{recursive:true});
const normal=generate(parseText(String.raw`{"data":"<img src=\"https://example.invalid\" onerror=\"window.injected=1\">","num":9007199254740993,"control":"\n\t","__proto__":{}}`), '', 'mermaid');
const maximum=generate(parseText(JSON.stringify(Array(199).fill('😀'.repeat(90)))),'','mermaid');
for(const name of process.argv.slice(2).length?process.argv.slice(2):Object.keys(engines)){
  let browser,context,page;const checks=[],violations=[],external=[],schemes=[];
  const check=async(id,intent,fn)=>{
    if(process.env.READINESS_FILTER&&!new RegExp(process.env.READINESS_FILTER).test(id)){checks.push({id,intent,status:'not-run'});return;}
    try{const data=await fn();checks.push({id,intent,status:'pass',data});console.log(`${name} ${id} PASS`);}
    catch(error){checks.push({id,intent,status:'fail',errorType:error.name,measurement:error.measurement,state:await page?.evaluate(()=>{const s=readiness.diagram.state();return {status:s.status,outputAllowed:s.outputAllowed,validated:s.validated};}).catch(()=>({status:'unavailable'}))});process.exitCode=1;console.log(`${name} ${id} FAIL ${error.name}`);}
  };
  const ready=async p=>{await p.goto('http://127.0.0.1:4188/readiness.html');await p.waitForFunction(()=>!!window.readiness);};
  const rendered=p=>p.waitForFunction(()=>readiness.diagram.state().status==='rendered');
  const show=async(source=normal,p=page)=>{await p.evaluate(result=>readiness.diagram.show(result),source);await rendered(p);};
  const exact=async(source,p=page)=>{
    const data=await p.evaluate(()=>{const svg=document.querySelector('#diagram svg');return {labels:[...svg.querySelectorAll('[data-label]')].map(el=>el.textContent),edges:[...svg.querySelectorAll('[data-edge]')].map(el=>el.getAttribute('data-edge')),forbidden:svg.querySelectorAll('a,script,foreignObject,image,iframe').length,active:[...svg.querySelectorAll('*')].some(el=>[...el.attributes].some(a=>/^on|href|style$/i.test(a.name)))};});
    assert.deepEqual(data.labels,source.graph.labels);assert.deepEqual(data.edges,source.graph.parents.flatMap((p,i)=>p<0?[]:[`${p}:${i}`]));assert.equal(data.forbidden,0);assert.equal(data.active,false);
    return {nodes:data.labels.length,edges:data.edges.length,exact:true};
  };
  try{
    browser=await engines[name]();context=await browser.newContext();context.setDefaultTimeout(22000);
    await context.addInitScript(()=>{window.cspViolations=[];document.addEventListener('securitypolicyviolation',e=>window.cspViolations.push(e.effectiveDirective+(e.blockedURI.endsWith('/favicon.ico')?':favicon':'')));});
    context.on('request',r=>{if(/^https?:/.test(r.url())&&new URL(r.url()).origin!=='http://127.0.0.1:4188')external.push(true);});
    page=await context.newPage();page.on('worker',w=>schemes.push(new URL(w.url()).protocol));await ready(page);
    await check('PR-01','all hostile labels and edges preserved under self-only CSP',async()=>{await show();return exact(normal);});
    await check('PR-02','maximum graph retains every label and edge',async()=>{await show(maximum);return exact(maximum);});
    await check('PR-03','busy static Worker terminates at five seconds with UI responsive and explicit retry',async()=>{
      await page.evaluate(()=>{window.ticks=0;window.timer=setInterval(()=>ticks++,100);readiness.diagram.setMode({blockMilliseconds:6500});readiness.diagram.retry();});
      await page.waitForFunction(()=>readiness.diagram.state().status==='render-timeout');
      const data=await page.evaluate(()=>{clearInterval(timer);const s=readiness.diagram.state();return {elapsed:s.elapsed,ticks,allowed:s.outputAllowed,alive:s.workerAlive};});
      assert.ok(data.elapsed>=4900&&data.elapsed<5300);assert.ok(data.ticks>=45);assert.equal(data.allowed,true);assert.equal(data.alive,false);
      await page.evaluate(()=>{readiness.diagram.setMode({});readiness.diagram.retry();});await rendered(page);return data;
    });
    await check('PR-04','invalid source and mismatched graph never allow export or diagram-only retry',async()=>{
      for(const source of [{...normal,code:'invalid diagram'},{...normal,graph:{...normal.graph,labels:['invalid']}}]){
        await page.evaluate(result=>readiness.diagram.show(result),source);assert.equal(await page.evaluate(()=>readiness.diagram.state().outputAllowed),false);assert.equal(await page.evaluate(()=>readiness.diagram.retry()),false);
      }return {failClosed:true};
    });
    await check('PR-05','controlled warm offline reload creates new static validation and layout Workers',async()=>{
      let stage='control';
      await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
      await context.setOffline(true);
      try{stage='offline-navigation';await page.reload();stage='entry-ready';await page.waitForFunction(()=>!!window.readiness);stage='new-workers';await show();return {offlineReload:true,...await exact(normal)};}
      catch(error){error.measurement={stage,...await page.evaluate(()=>({documentReady:document.readyState,controlled:!!navigator.serviceWorker.controller,entryReady:!!window.readiness,cspDirectives:window.cspViolations??[]})).catch(()=>({documentUnavailable:true}))};throw error;}
      finally{await context.setOffline(false);}
    });
    await check('PR-06','cold resource failure forbids output; online restoration alone does not retry',async()=>{
      const cold=await browser.newContext({serviceWorkers:'block'}),p=await cold.newPage();p.setDefaultTimeout(22000);
      try{
        await ready(p);await cold.route('**/*validation-worker*',r=>r.abort());await p.evaluate(result=>readiness.diagram.show(result),normal);
        assert.equal(await p.evaluate(()=>readiness.diagram.state().outputAllowed),false);assert.equal(await p.evaluate(()=>readiness.diagram.retry()),false);
        await cold.unrouteAll();assert.equal(await p.evaluate(()=>readiness.diagram.state().status),'validation-failed');await show(normal,p);return {failClosed:true,explicitRecovery:true};
      }finally{await cold.close();}
    });
    await check('PR-07','missing ready times out at fifteen seconds; clear removes old generation before retry',async()=>{
      const cold=await browser.newContext({serviceWorkers:'block'}),p=await cold.newPage();p.setDefaultTimeout(22000);
      try{
        await ready(p);await p.bringToFront();await cold.route('**/*layout-worker*',r=>r.fulfill({contentType:'text/javascript',body:'self.onmessage=()=>{};'}));
        await p.evaluate(result=>readiness.diagram.show(result),normal);await p.waitForFunction(()=>readiness.diagram.state().status==='initialization-timeout');
        const data=await p.evaluate(()=>{const s=readiness.diagram.state();return {elapsed:s.elapsed,allowed:s.outputAllowed,alive:s.workerAlive};});
        assert.ok(data.elapsed>=14900&&data.elapsed<15300);assert.equal(data.allowed,true);assert.equal(data.alive,false);
        await p.evaluate(()=>readiness.diagram.clear());assert.equal(await p.evaluate(()=>readiness.diagram.state().outputAllowed),false);
        await cold.unrouteAll();await show(normal,p);return data;
      }finally{await cold.close();}
    });
    await check('PR-08','no CSP violation, external request, dynamic Worker or document persistence',async()=>{
      violations.push(...await page.evaluate(()=>window.cspViolations));
      const data=await page.evaluate(async()=>{
        const manifest=await (await fetch('/readiness-assets.json')).json();
        const entry=await fetch(manifest.assets.find(p=>/\/readiness-.*\.js$/.test(p)));
        return {local:localStorage.length,session:sessionStorage.length,db:(await indexedDB.databases()).length,keys:(await Promise.all((await caches.keys()).map(async k=>(await (await caches.open(k)).keys()).map(r=>new URL(r.url).pathname)))).flat(),assets:manifest.assets,varyOrigin:/origin/i.test(entry.headers.get('vary')??'')};
      });
      try{assert.equal(external.length,0);assert.equal(violations.length,0);assert.ok(schemes.length>0&&schemes.every(s=>s==='http:'));assert.equal(data.local,0);assert.equal(data.session,0);assert.equal(data.db,0);assert.ok(data.keys.every(k=>data.assets.includes(k)));assert.equal(data.varyOrigin,false);}
      catch(error){error.measurement={external:external.length,cspDirectives:violations,workerSchemes:schemes,local:data.local,session:data.session,databases:data.db,cachedAssets:data.keys.length,staticOnly:data.keys.every(k=>data.assets.includes(k))};throw error;}
      return {external:0,cspViolations:0,dynamicWorkers:0,local:0,session:0,databases:0,assets:data.keys.length};
    });
  }catch(error){const errorCode=/ERR_[A-Z_]+|NS_ERROR_[A-Z_]+|Timeout|EPERM|ENOENT/.exec(error.message)?.[0]??'setup-error';checks.push({id:'environment',status:'fail',errorType:error.name,errorCode});console.log(`${name} environment FAIL ${errorCode}`);process.exitCode=1;}
  finally{await writeFile(new URL(`readiness-${name}${process.env.EVIDENCE_SUFFIX??''}.json`,dir),JSON.stringify({date:'2026-10-26',base:'48f975a',engine:name,playwrightVersion,version:browser?.version(),checks},null,2));await context?.close();await browser?.close();}
}
