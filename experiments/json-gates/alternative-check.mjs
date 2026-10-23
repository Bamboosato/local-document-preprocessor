import {chromium,firefox,webkit,playwrightVersion} from './browser-runtime.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const engines={chrome:()=>chromium.launch({channel:'chrome'}),edge:()=>chromium.launch({channel:'msedge'}),firefox:()=>firefox.launch(),webkit:()=>webkit.launch()};
const dir=new URL('./evidence/',import.meta.url);await mkdir(dir,{recursive:true});
for(const name of process.argv.slice(2).length?process.argv.slice(2):Object.keys(engines)){
  const browser=await engines[name](),context=await browser.newContext(),page=await context.newPage(),checks=[],external=[];
  context.setDefaultTimeout(25000);
  context.on('request',r=>{const raw=r.url();if(!/^https?:\/\//.test(raw))return;const u=new URL(raw);if(u.hostname!=='127.0.0.1')external.push(u.hostname);});
  const check=async(id,intent,fn)=>{if(process.env.ALT_FILTER&&!new RegExp(process.env.ALT_FILTER).test(id)){checks.push({id,intent,status:'not-run'});return;}try{const data=await fn();checks.push({id,intent,status:'pass',data});console.log(`${name} ${id} PASS`);}catch(e){const diagnostic=e.gateMeasurement??await page.evaluate(()=>{const s=gates.diagram.state();return {status:s.status,elapsed:s.elapsed,validated:s.validated,workerAlive:s.workerAlive,staticStage:s.staticStage,failureReason:s.failureReason};}).catch(()=>({}));checks.push({id,intent,status:'fail',errorType:e.name,diagnostic});process.exitCode=1;console.log(`${name} ${id} FAIL ${e.name} `+JSON.stringify(diagnostic));}};
  const ready=async()=>{await page.goto('http://127.0.0.1:4187/#worker');await page.waitForFunction(()=>!!window.gates);};
  const rendered=()=>page.waitForFunction(()=>gates.diagram.state().status==='rendered');
  const show=async(maximum=false)=>{await page.evaluate(async maximum=>{
    const input=maximum?JSON.stringify(Array(199).fill('😀'.repeat(90))):JSON.stringify({html:'<img src="https://example.invalid/a" onerror="window.injected=1">',syntax:'end\n```\nclick n0 "https://example.invalid"',quote:'\u0000"{}\\\n',raw:9007199254740991});
    const id=maximum?'alternative-maximum':'alternative-normal';gates.install(id,input);window.altSource=await gates.request(id,'generate',{pointer:'',style:'mermaid'});await gates.diagram.show(altSource);
  },maximum);await rendered();};
  try{
    await ready();
    await check('ALT-01','all labels and parent-child edges exactly preserved; data cannot create active SVG',async()=>{
      await show();const data=await page.evaluate(()=>{const svg=document.querySelector('#results svg');return {labels:[...svg.querySelectorAll('[data-label]')].map(n=>n.textContent),expected:altSource.labels,edges:[...svg.querySelectorAll('[data-edge]')].map(n=>n.getAttribute('data-edge')),parents:altSource.graph.parents,forbidden:svg.querySelectorAll('a,script,foreignObject,image,iframe').length,attributes:[...svg.querySelectorAll('*')].some(n=>[...n.attributes].some(a=>/^on|href|style$/i.test(a.name))),executed:!!window.injected};});
      assert.deepEqual(data.labels,data.expected);assert.deepEqual(data.edges,data.parents.flatMap((p,i)=>p<0?[]:[`${p}:${i}`]));assert.equal(data.forbidden,0);assert.equal(data.attributes,false);assert.equal(data.executed,false);return {labels:data.labels.length,edges:data.edges.length,exact:true};
    });
    await check('ALT-02','uncooperative 6.5s Worker terminates at 5s while parent UI keeps responding; retry uses new context',async()=>{
      await page.evaluate(()=>{window.ticks=0;window.interval=setInterval(()=>ticks++,100);gates.diagram.setMode({blockMilliseconds:6500});gates.diagram.retry();});
      await page.waitForFunction(()=>gates.diagram.state().status==='render-timeout');
      const measured=await page.evaluate(()=>{clearInterval(interval);return {...gates.diagram.state(),ticks};});
      assert.ok(measured.elapsed>=4900&&measured.elapsed<5300);assert.ok(measured.ticks>=45);assert.equal(measured.workerAlive,false);assert.equal(measured.outputAllowed,true);assert.equal(await page.locator('#results svg').count(),0);
      await page.evaluate(()=>{gates.diagram.setMode({});gates.diagram.retry();});await rendered();return {elapsed:measured.elapsed,ticks:measured.ticks,terminated:true,retried:true};
    });
    await check('ALT-03','clear/result replacement discards old work and cannot restore a stale SVG',async()=>{
      await show();
      await page.evaluate(()=>{gates.diagram.setMode({blockMilliseconds:6500});gates.diagram.retry();});await page.waitForFunction(()=>gates.diagram.state().status==='rendering');
      await page.evaluate(()=>gates.diagram.clear());await page.waitForTimeout(200);
      assert.equal(await page.locator('#results svg').count(),0);assert.equal(await page.evaluate(()=>gates.diagram.state().outputAllowed),false);
      await show(true);await page.waitForTimeout(6600);assert.equal(await page.evaluate(()=>gates.diagram.state().status),'rendered');
      assert.equal(await page.evaluate(()=>JSON.stringify([...document.querySelectorAll('#results [data-label]')].map(n=>n.textContent))===JSON.stringify(altSource.labels)),true);
      return {staleAbsent:true,waitBeyondOldCompletion:true};
    });
    await check('ALT-04','200 nodes including long non-BMP labels preserve every codepoint and every edge',async()=>{
      await show(true);const data=await page.evaluate(()=>{const svg=document.querySelector('#results svg');return {exact:JSON.stringify([...svg.querySelectorAll('[data-label]')].map(n=>n.textContent))===JSON.stringify(altSource.labels),nodes:svg.querySelectorAll('[data-node]').length,edges:[...svg.querySelectorAll('[data-edge]')].map(n=>n.getAttribute('data-edge')),expected:altSource.graph.parents.flatMap((p,i)=>p<0?[]:[`${p}:${i}`]),width:svg.width.baseVal.value,height:svg.height.baseVal.value};});
      console.log(`${name} ALT-04 metrics `+JSON.stringify({exact:data.exact,nodes:data.nodes,edges:data.edges.length,expected:data.expected.length,width:data.width,height:data.height,edgeMatch:JSON.stringify(data.edges)===JSON.stringify(data.expected)}));
      assert.equal(data.exact,true);assert.equal(data.nodes,200);assert.deepEqual(data.edges,data.expected);assert.ok(Number.isFinite(data.width)&&Number.isFinite(data.height));return {nodes:200,edges:199,exact:true};
    });
    await check('ALT-05','warm static cache supports new layout Worker and fresh validation/display contexts while offline',async()=>{
      await show();
      // Cache writes complete independently of response delivery. Wait for required assets explicitly.
      await page.waitForFunction(async()=>{const c=await caches.open('json-g04-alternative-static-v1');const keys=await c.keys();return ['layout-worker-','validation-worker-'].every(s=>keys.some(k=>k.url.includes(s)));});
      await context.setOffline(true);await page.evaluate(()=>gates.diagram.retry());await rendered();console.log(`${name} ALT-05 offline-new-worker PASS`);
      await page.evaluate(()=>gates.diagram.show(altSource));await rendered();const scheme=await page.evaluate(()=>gates.diagram.state().workerScheme);await context.setOffline(false);return {newWorker:true,revalidation:true,scheme};
    });
    await check('ALT-06','cold validation resource failure forbids exports and requires explicit reconversion',async()=>{
      const cold=await browser.newContext({serviceWorkers:'block'}),p=await cold.newPage();
      try{await p.goto('http://127.0.0.1:4187/?no-sw=1#worker');await p.waitForFunction(()=>!!window.gates);
        await cold.route('**/*validation-worker*',r=>r.abort());
        await p.evaluate(async()=>{const result=await gates.request('A','generate',{style:'mermaid'});window.coldSource=result;await gates.diagram.show(result);});
        assert.equal(await p.evaluate(()=>gates.diagram.state().outputAllowed),false);assert.equal(await p.evaluate(()=>gates.diagram.retry()),false);
        await cold.unrouteAll();await p.waitForTimeout(200);assert.equal(await p.evaluate(()=>gates.diagram.state().status),'validation-failed');
        await p.evaluate(()=>gates.diagram.show(coldSource));await p.waitForFunction(()=>gates.diagram.state().status==='rendered');return {failClosed:true,explicitRecovery:true};
      }finally{await cold.close();}
    });
    await check('ALT-07','no external requests or persistent document state; only allowlisted static assets cached',async()=>{
      await context.setOffline(false);const data=await page.evaluate(async()=>({local:localStorage.length,session:sessionStorage.length,db:(await indexedDB.databases()).length,keys:(await Promise.all((await caches.keys()).map(async key=>(await (await caches.open(key)).keys()).map(r=>new URL(r.url).pathname)))).flat()}));
      assert.equal(external.length,0);assert.equal(data.local,0);assert.equal(data.session,0);assert.equal(data.db,0);assert.ok(data.keys.every(p=>['/','/index.html','/gate-assets.json'].includes(p)||/^\/assets\/[^/]+$/.test(p)));return {external:0,local:0,session:0,databases:0,staticAssets:data.keys.length};
    });
    await check('ALT-08','layout asset failure retains validated exports; invalid source and graph mismatch fail closed',async()=>{
      const cold=await browser.newContext({serviceWorkers:'block'}),p=await cold.newPage();
      try{await p.goto('http://127.0.0.1:4187/?no-sw=1#worker');await p.waitForFunction(()=>!!window.gates);
        await p.evaluate(async()=>{window.candidate=await gates.request('A','generate',{style:'mermaid'});await gates.diagram.show({...candidate,code:'not a mermaid diagram'});});
        assert.equal(await p.evaluate(()=>gates.diagram.state().outputAllowed),false);
        await p.evaluate(()=>gates.diagram.show({...candidate,graph:{...candidate.graph,labels:['tampered']}}));assert.equal(await p.evaluate(()=>gates.diagram.state().outputAllowed),false);
        await cold.route('**/*layout-worker*',r=>r.abort());await p.evaluate(()=>gates.diagram.show(candidate));await p.waitForFunction(()=>gates.diagram.state().status==='display-failed');
        assert.equal(await p.evaluate(()=>gates.diagram.state().outputAllowed),true);assert.equal(await p.locator('#results svg').count(),0);
        await cold.unrouteAll();await p.waitForTimeout(200);assert.equal(await p.evaluate(()=>gates.diagram.state().status),'display-failed');await p.evaluate(()=>gates.diagram.retry());await p.waitForFunction(()=>gates.diagram.state().status==='rendered');
        return {invalidSourceBlocked:true,graphMismatchBlocked:true,validatedOutputRetained:true,explicitRetry:true};
      }finally{await cold.close();}
    });
    await check('ALT-09','missing ready event expires after 15s and destroys context; retry creates a working context',async()=>{
      const cold=await browser.newContext({serviceWorkers:'block'}),p=await cold.newPage();
      try{await p.goto('http://127.0.0.1:4187/?no-sw=1#worker');await p.waitForFunction(()=>!!window.gates);
        console.log(`${name} ALT-09 visibility `+await p.evaluate(()=>document.visibilityState));
        await p.bringToFront();
        await cold.route('**/*layout-worker*',r=>r.fulfill({status:200,contentType:'text/javascript',body:'self.onmessage=()=>{};'}));
        await p.evaluate(async()=>{window.initStart=performance.now();await gates.diagram.show(await gates.request('A','generate',{style:'mermaid'}));});
        await p.waitForFunction(()=>gates.diagram.state().status==='initialization-timeout',null,{timeout:20000});
        const data=await p.evaluate(()=>({elapsed:gates.diagram.state().elapsed,alive:gates.diagram.state().workerAlive,allowed:gates.diagram.state().outputAllowed,visibility:document.visibilityState}));
        console.log(`${name} ALT-09 metrics `+JSON.stringify(data));
        await cold.unrouteAll();await p.evaluate(()=>gates.diagram.retry());await p.waitForFunction(()=>gates.diagram.state().status==='rendered');data.retried=true;
        try{assert.ok(data.elapsed>=14900&&data.elapsed<15300);assert.equal(data.alive,false);assert.equal(data.allowed,true);}catch(error){error.gateMeasurement=data;throw error;}
        return {elapsed:data.elapsed,terminated:true,retried:true};
      }finally{await cold.close();}
    });
    await check('ALT-10','actual offline state with unacquired validation assets fails closed and online restoration does not auto-retry',async()=>{
      const cold=await browser.newContext({serviceWorkers:'block'}),p=await cold.newPage();
      try{
        await p.bringToFront();await p.goto('http://127.0.0.1:4187/?no-sw=1#worker');await p.waitForFunction(()=>!!window.gates);
        await p.evaluate(async()=>{window.coldSource=await gates.request('A','generate',{style:'mermaid'});});
        await cold.setOffline(true);await p.evaluate(()=>gates.diagram.show(coldSource));
        assert.equal(await p.evaluate(()=>gates.diagram.state().status),'validation-failed');assert.equal(await p.evaluate(()=>gates.diagram.state().outputAllowed),false);assert.equal(await p.evaluate(()=>gates.diagram.retry()),false);
        await cold.setOffline(false);await p.waitForTimeout(200);assert.equal(await p.evaluate(()=>gates.diagram.state().status),'validation-failed');
        await p.evaluate(()=>gates.diagram.show(coldSource));await p.waitForFunction(()=>gates.diagram.state().status==='rendered');return {realOffline:true,failClosed:true,noAutoRetry:true,reconverted:true};
      }finally{await cold.close();}
    });
    await check('ALT-11','additional PWA diagnostic: offline page reload and JSON regeneration',async()=>{
      await show();
      await context.setOffline(true);
      try{await page.reload();}catch(error){error.gateMeasurement={stage:'offline-navigation',errorCode:/ERR_INTERNET_DISCONNECTED|ERR_FAILED|NS_ERROR_OFFLINE/.exec(error.message)?.[0]??'navigation-error'};throw error;}
      await page.waitForFunction(()=>!!window.gates);await show();
      await context.setOffline(false);return {offlineReload:true,newJsonWorker:true};
    });
    await check('ALT-12','late old asset completion cannot overwrite the current Worker; clear terminates the new busy Worker',async()=>{
      const cold=await browser.newContext({serviceWorkers:'block'}),p=await cold.newPage();let first=true,released=false,signal;
      const requested=new Promise(resolve=>signal=resolve);
      try{
        await p.goto('http://127.0.0.1:4187/?no-sw=1#worker');await p.waitForFunction(()=>!!window.gates);
        await p.evaluate(()=>gates.inspect('A'));
        const baseline=p.workers().length;
        await cold.route('**/*layout-worker*',async route=>{
          if(first){first=false;signal();await new Promise(r=>setTimeout(r,500));await route.continue();released=true;}else await route.continue();
        });
        await p.evaluate(async()=>gates.diagram.show(await gates.request('A','generate',{style:'mermaid'})));
        await requested;
        await p.evaluate(async()=>{gates.diagram.clear();window.newSource=await gates.request('C','generate',{style:'mermaid'});await gates.diagram.show(newSource,{blockMilliseconds:2000});});
        await p.waitForFunction(()=>gates.diagram.state().status==='rendering');await p.waitForTimeout(600);
        assert.equal(released,true);
        await p.evaluate(()=>gates.diagram.clear());
        const until=performance.now()+2000;while(p.workers().length!==baseline&&performance.now()<until)await p.waitForTimeout(25);
        assert.equal(p.workers().length,baseline);assert.equal(await p.locator('#results svg').count(),0);
        await cold.unrouteAll();await p.evaluate(()=>gates.diagram.show(newSource));await p.waitForFunction(()=>gates.diagram.state().status==='rendered');
        assert.equal(await p.evaluate(()=>JSON.stringify([...document.querySelectorAll('#results [data-label]')].map(n=>n.textContent))===JSON.stringify(newSource.labels)),true);
        return {oldAssetReleased:true,noWorkerLeak:true,newSourceExact:true};
      }finally{await cold.close();}
    });
  }finally{await writeFile(new URL(`alternative-${name}${process.env.EVIDENCE_SUFFIX??''}.json`,dir),JSON.stringify({engine:name,playwrightVersion,version:browser.version(),checks},null,2));await context.close();await browser.close();}
}
