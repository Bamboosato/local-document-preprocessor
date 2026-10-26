import { chromium, firefox, webkit } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts } from 'pdf-lib';
const root=fileURLToPath(new URL('.',import.meta.url));
const engines={chrome:()=>chromium.launch({channel:'chrome',headless:true}),edge:()=>chromium.launch({channel:'msedge',headless:true}),firefox:()=>firefox.launch({headless:true}),webkit:()=>webkit.launch({headless:true})};
const targets=process.argv.slice(2).length?process.argv.slice(2):['chrome','edge','firefox','webkit'];
await mkdir(root+'evidence',{recursive:true});
const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
for(let i=0;i<30;i++){const page=pdf.addPage();page.drawText('Synthetic fixture B page '+i,{x:50,y:700,size:12,font});}
const pdfBytes=Array.from(await pdf.save());
for(const engine of targets){
  const checks=[],network=[],wasm=[],failedRequests=[],consoleErrors=[],started=new Date().toISOString();let browser,context,page;
  const check=async(id,intent,fn)=>{
    if(process.env.GATE_FILTER&&!new RegExp(process.env.GATE_FILTER).test(id)){checks.push({id,intent,status:'not-run'});return;}
    if(['G04-02','G04-03'].includes(id)&&!(await page.evaluate(()=>gates.diagram.state().validated))){checks.push({id,intent,status:'blocked',reason:'verified-source-unavailable'});return;}
    const start=performance.now();
    let caseTimer;
    try{const data=await Promise.race([fn(),new Promise((_,reject)=>{caseTimer=setTimeout(()=>reject(Object.assign(new Error('case-deadline'),{code:'case-deadline'})),45000);})]);checks.push({id,intent,status:'pass',milliseconds:Math.round(performance.now()-start),data});console.log(`${engine} ${id} PASS`);}
    catch(error){const data=error.gateMeasurement;checks.push({id,intent,status:'fail',milliseconds:Math.round(performance.now()-start),errorType:error.name,errorCode:error.code,data});console.log(`${engine} ${id} FAIL ${error.name} ${error.code??''}`);if(page)await page.screenshot({path:root+`evidence/${engine}-${id}.png`,timeout:5000,fullPage:true,mask:[page.locator('#tree'),page.locator('#detail'),page.locator('#selection'),page.locator('#results'),page.locator('#notice')]}).catch(()=>{});}
    finally{clearTimeout(caseTimer);}
  };
  try{
    browser=await engines[engine]();context=await browser.newContext({viewport:{width:1280,height:900}});context.setDefaultTimeout(25000);context.setDefaultNavigationTimeout(30000);page=await context.newPage();
    page.on('request',req=>{const u=new URL(req.url());if(u.pathname.endsWith('.wasm'))wasm.push(true);if(!['http:','https:','ws:','wss:'].includes(u.protocol))return;if(u.hostname!=='127.0.0.1')network.push({protocol:u.protocol,host:u.hostname});});
    page.on('pageerror',()=>consoleErrors.push('pageerror'));
    page.on('requestfailed',req=>{const u=new URL(req.url());if(u.hostname==='127.0.0.1')failedRequests.push({path:u.pathname,reason:req.failure()?.errorText});});
    await page.goto('http://127.0.0.1:4187');await page.waitForFunction(()=>Boolean(window.gates),{timeout:30000});
    await check('G01-browser','JSON-only parse/generation uses real Worker without anydoc/PDFium WASM initialization',async()=>{
      const boundary=await page.evaluate(async()=>{
        await gates.inspect('A');for(const style of ['items','records','mermaid'])await gates.request('A','generate',{pointer:'/results',style});
        gates.install('wide','['+Array(99999).fill('0').join(',')+']');const summary=await gates.inspect('wide');
        gates.install('ticks',JSON.stringify('`a'.repeat(150000)));const generated=await gates.request('ticks','generate',{pointer:'',style:'items'});
        return {nodes:summary.count,largeLiteralGenerated:generated.markdown.length>300000};
      });
      assert.equal(boundary.nodes,100000);assert.equal(boundary.largeLiteralGenerated,true);
      assert.equal(wasm.length,0);return {styles:3,wasmRequests:0,...boundary};
    });
    await check('G02-00','PDF cancellation fixture can really convert using the existing PDF engine path',async()=>{
      const result=await page.evaluate(async bytes=>{gates.install('pdfSmoke','');return gates.raw('pdfSmoke','pdf',{bytes:new Uint8Array(bytes).buffer});},pdfBytes);
      assert.equal(result.pdfConverted,true);assert.equal(result.hasOutput,true);return result;
    });
    await check('G02-01','A result survives actual PDF B Worker cancellation and A/C reinspection',async()=>{
      const before=await page.evaluate(()=>gates.state());
      await page.evaluate(async bytes=>{
        await gates.convert('A','/results','records');
        gates.install('B','');
        window.pdfTask=gates.raw('B','pdf',{bytes:new Uint8Array(bytes).buffer},()=>{window.pdfStarted=true;const t=performance.now();document.querySelector('#cancel-worker').click();window.cancelFeedback=performance.now()-t;}).catch(()=>false);
      },pdfBytes);
      await page.waitForFunction(()=>window.pdfStarted===true);
      const t=performance.now();
      await page.evaluate(async()=>{await gates.inspect('A');await gates.inspect('C');});
      const c=await page.evaluate(()=>gates.request('C','generate',{pointer:'/results',style:'items'}));
      assert.ok(c.markdown.includes('1.2300'));assert.equal(c.markdown.includes('9007199254740993'),false);
      const after=await page.evaluate(()=>gates.state());
      assert.equal(after.business.find(x=>x.id==='A').hasResult,true);assert.equal(after.business.find(x=>x.id==='A').pointer,'/results');
      assert.ok(after.epoch>before.epoch);assert.equal(after.stats.sets,1);
      assert.equal(after.business.find(x=>x.id==='B').status,'cancelled');
      return {epochBefore:before.epoch,epochAfter:after.epoch,restored:true,cancelFeedback:await page.evaluate(()=>window.cancelFeedback),recoveryMilliseconds:Math.round(performance.now()-t)};
    });
    await check('G02-02','20 file inspections evict parse sets; bounded huge-value detail; Worker failure/reload error recovers',async()=>{
      await page.evaluate(()=>gates.convert('A','/results','records'));
      const measurements=await page.evaluate(async()=>{
        const output=[];
        for(let i=0;i<20;i++){
          const id='memory'+i;gates.install(id,JSON.stringify({data:'x'.repeat(1024*1024)}));await gates.inspect(id);
          output.push(gates.state().stats.sets);
        }
        const detail=await gates.request('memory19','detail',{pointer:''});
        gates.install('bad','{');let failed=false;try{await gates.inspect('bad');}catch{failed=true;}
        await gates.inspect('A');
        const epoch=gates.state().epoch;
        window.crashTask=gates.raw('A','crash').catch(()=>false);
        return {sets:output,maxExcerpt:Array.from(detail.text).length,excerptComplete:detail.complete,failed,epoch};
      });
      assert.ok(measurements.sets.every(n=>n===1));assert.equal(measurements.maxExcerpt,10000);assert.equal(measurements.excerptComplete,false);assert.equal(measurements.failed,true);
      await page.waitForFunction(e=>gates.state().epoch>e,measurements.epoch);
      await page.evaluate(async()=>{await gates.inspect('A');await gates.inspect('C');});
      const after=await page.evaluate(()=>gates.state());assert.equal(after.business.find(x=>x.id==='A').hasResult,true);
      return {inspections:20,setsMaximum:1,excerptCodepoints:10000,errorRecovered:true};
    });
    await check('G02-03','single 50 MiB input accepts exact byte boundary in a real Worker',async()=>{
      const result=await page.evaluate(async()=>{
        gates.install('limit','null'+' '.repeat(50*1024*1024-4));const t=performance.now();const summary=await gates.inspect('limit');
        await gates.inspect('A');return {type:summary.type,milliseconds:Math.round(performance.now()-t),sets:gates.state().stats.sets};
      });assert.equal(result.type,'null');assert.equal(result.sets,1);return result;
    });
    await check('G03-01','expand and select stay independent; cancel preserves result; valid target restores records without style change',async()=>{
      await page.evaluate(async()=>{if(document.querySelector('dialog').open)gates.close();await gates.convert('A','/results','records');});
      await page.evaluate(()=>gates.open('A'));await page.waitForFunction(()=>!document.querySelector('#confirm').disabled);
      const selected=await page.evaluate(()=>gates.state().draft.pointer);
      await page.getByRole('button',{name:'開閉 "results"',exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('[name=target][value="/results/0"]'));
      assert.equal(await page.evaluate(()=>gates.state().draft.pointer),selected);
      await page.evaluate(()=>gates.select('/summary'));await page.waitForFunction(()=>document.querySelector('#reason').textContent==='style');assert.equal(await page.locator('#confirm').isDisabled(),true);
      await page.evaluate(()=>gates.select('/results'));await page.waitForFunction(()=>!document.querySelector('#confirm').disabled);
      assert.equal(await page.evaluate(()=>gates.state().draft.style),'records');
      await page.click('#cancel');assert.equal(await page.evaluate(()=>gates.state().business.find(x=>x.id==='A').hasResult),true);
      return {selectionUnchanged:true,styleRetained:true,resultPreserved:true};
    });
    await check('G03-02','300 row window still locates hidden target; Tab never changes selection; 51st sibling reachable',async()=>{
      await page.evaluate(async()=>{
        gates.install('tree',JSON.stringify(Object.fromEntries(Array.from({length:51},(_,i)=>['n'+i,Object.fromEntries(Array.from({length:8},(_,j)=>['k'+j,{}]))]))));
        await gates.open('tree');gates.setView({expanded:['',...Array.from({length:50},(_,i)=>'/n'+i)]});await gates.select('/n40');
      });
      assert.ok(await page.locator('#tree .row').count()<=300);
      assert.equal(await page.locator('[name=target]:checked').count(),0);
      await page.locator('#heading').focus();for(let i=0;i<8;i++)await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(()=>gates.state().draft.pointer),'/n40');
      await page.click('#locate');await page.waitForFunction(()=>document.activeElement?.value==='/n40');
      await page.evaluate(()=>gates.select('/n50'));await page.click('#locate');await page.waitForFunction(()=>document.activeElement?.value==='/n50');
      assert.ok(await page.locator('#tree .row').count()<=300);
      await page.click('#cancel');return {maximumRows:300,hiddenSelectionPreserved:true,locatedSibling:50};
    });
    await check('G03-03','depth128 at 320px and separate 32px text/640px layout keep controls reachable, indentation bounded',async()=>{
      await page.evaluate(()=>{if(document.querySelector('dialog').open)gates.close();});
      // Windows Firefox can stall resizing even a blank page (viewport-probe).
      // Separate initial viewports verify layout without claiming resize support.
      const atViewport=async(viewport,fn)=>{
        const isolated=await browser.newContext({viewport});
        try{
          const p=await isolated.newPage();p.setDefaultTimeout(25000);
          await p.goto('http://127.0.0.1:4187');await p.waitForFunction(()=>!!window.gates);
          await p.evaluate(async()=>{gates.install('deep','['.repeat(128)+'0'+']'.repeat(128));await gates.open('deep');await gates.select('/0'.repeat(127));});
          await p.click('#locate');await p.waitForFunction(()=>document.activeElement?.value==='/0'.repeat(127));
          return await fn(p);
        }finally{await isolated.close();}
      };
      console.log(`${engine} G03-03 stage initial-narrow`);
      const geometry=await atViewport({width:320,height:700},async p=>{
        const g=await p.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,maxIndent:Math.max(...[...document.querySelectorAll('#tree .row')].map(el=>parseFloat(getComputedStyle(el).paddingLeft))),focusVisible:document.activeElement.getBoundingClientRect().width>0}));
        assert.equal(g.overflow,false);assert.ok(g.maxIndent<=64);assert.equal(g.focusVisible,true);
        assert.equal(await p.evaluate(()=>['cancel','confirm'].every(id=>{const r=document.getElementById(id).getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;})),true);
        await p.screenshot({path:root+`evidence/${engine}-320px.png`,timeout:5000,fullPage:true,mask:[p.locator('#tree'),p.locator('#detail'),p.locator('#selection'),p.locator('#results'),p.locator('#notice')]});
        return g;
      });
      console.log(`${engine} G03-03 stage initial-text-layout`);
      await atViewport({width:640,height:450},async p=>{
        await p.evaluate(()=>document.body.style.fontSize='32px');
        assert.equal(await p.evaluate(()=>getComputedStyle(document.querySelector('#tree label')).fontSize),'32px');
        assert.equal(await p.locator('#cancel').isVisible(),true);await p.click('#cancel');
      });
      return {...geometry,textPixels:32,textViewport:640,initialViewports:true,dynamicResizeVerified:false};
    });
    await check('G04-00','probe strict Mermaid.parse Worker compatibility without treating failure as valid output',async()=>{
      const result=await page.evaluate(async()=>{
        const out=await gates.request('A','generate',{pointer:'',style:'mermaid'});const valid=await gates.diagram.show(out,{validationContext:'worker'});
        const result={workerCompatible:valid,reason:gates.diagram.state().reason,outputAllowed:gates.diagram.state().outputAllowed};gates.diagram.clear();return result;
      });assert.equal(result.workerCompatible,true);return result;
    });
    await check('G04-01','explicit text-label Mermaid syntax validates in Worker and dangerous data renders as exact safe labels/SVG',async()=>{
      const source=await page.evaluate(async()=>{
        gates.install('diagram',JSON.stringify({end:'9007199254740993',data:'<img src="https://invalid.example/a" onerror="alert(1)">',fence:'```',directive:'%%{init:{"securityLevel":"loose"}}%%',click:'click n0 "https://invalid.example"',unicode:'日本語ｶﾅ😀'}));
        const out=await gates.request('diagram','generate',{pointer:'',style:'mermaid'});window.diagramExpected=out.labels;
        return await gates.diagram.show(out);
      });if(!source){const error=new Error('validation');error.gateMeasurement=await page.evaluate(()=>gates.diagram.state());throw error;}
      await page.waitForFunction(()=>['rendered','display-failed','initialization-timeout','render-timeout','validation-failed'].includes(gates.diagram.state().status),{timeout:22000});
      const result=await page.evaluate(()=>({state:gates.diagram.state(),expected:window.diagramExpected}));
      if(result.state.status!=='rendered'){const error=new Error('display');error.gateMeasurement={status:result.state.status,details:result.state.details,reason:result.state.reason};throw error;}
      assert.equal(result.state.details.forbidden,0);assert.equal(result.state.details.external,0);
      try {assert.deepEqual(result.state.details.labels,result.expected);assert.equal(result.state.details.nodeCount,result.expected.length);}catch(error){error.gateMeasurement={labelCount:result.state.details.labels.length,expectedCount:result.expected.length,mismatches:result.expected.map((v,i)=>v===result.state.details.labels[i]?null:i).filter(v=>v!==null),literalEntities:result.state.details.labels.some(v=>/&#\d+;|&quot;/.test(v))};throw error;}
      assert.equal(result.state.details.edgeCount,result.expected.length-1);
      assert.equal(network.length,0);return {validated:result.state.validated,nodes:result.expected.length,labelsMatch:true,external:0};
    });
    await check('G04-02','bounded long synchronous drawing tests real 5 second destruction and parent responsiveness',async()=>{
      await page.evaluate(async()=>{
        gates.diagram.setMode({blockMilliseconds:6500});window.parentTicks=0;window.tickTimer=setInterval(()=>window.parentTicks++,100);
        gates.diagram.retry();
      });
      await page.waitForFunction(()=>gates.diagram.state().status==='render-timeout',{timeout:16000});
      const measurement=await page.evaluate(()=>{clearInterval(window.tickTimer);return {elapsed:gates.diagram.state().elapsed,ticks:window.parentTicks,status:gates.diagram.state().status,frames:document.querySelectorAll('iframe').length,outputAllowed:gates.diagram.state().outputAllowed};});
      // This assertion is a feasibility gate, not a flaky timing test to relax.
      // 300ms is the specified feedback target; a whole 6.5s blockage must fail.
      try {assert.ok(measurement.elapsed<5300);assert.ok(measurement.ticks>=45);assert.equal(measurement.frames,0);}catch(error){error.gateMeasurement=measurement;throw error;}
      return measurement;
    });
    await check('G04-03','validated redraw retry, stale rendering clear, warm offline and unvalidated output fail closed',async()=>{
      await page.evaluate(()=>gates.diagram.setMode({}));
      await context.setOffline(true);await page.evaluate(()=>gates.diagram.retry());
      await page.waitForFunction(()=>['rendered','initialization-timeout','display-failed'].includes(gates.diagram.state().status),{timeout:22000});
      const offline=await page.evaluate(()=>gates.diagram.state());assert.equal(offline.outputAllowed,true);
      if(offline.status!=='rendered'){
        const frame=page.frames().find(f=>f.url().includes('/frame.html'));
        const controller=frame?await frame.evaluate(()=>{try{return {controlled:Boolean(navigator.serviceWorker.controller)};}catch(error){return {accessError:error.name};}}).catch(()=>({unavailable:true})):null;
        const error=new Error('warm-offline-display');error.gateMeasurement={status:offline.status,validated:offline.validated,outputAllowed:offline.outputAllowed,frameController:controller,failedStaticRequests:failedRequests.filter(r=>/frame|mermaid|chunk/.test(r.path)).slice(-10)};await context.setOffline(false);throw error;
      }
      await context.setOffline(false);
      await page.evaluate(()=>{gates.diagram.retry();gates.diagram.clear();});
      assert.equal(await page.evaluate(()=>gates.diagram.state().outputAllowed),false);
      const invalid=await page.evaluate(()=>gates.diagram.show({code:'this is not a diagram'}));assert.equal(invalid,false);assert.equal(await page.evaluate(()=>gates.diagram.retry()),false);
      const storage=await page.evaluate(async()=>{
        const names=await caches.keys(),urls=[];for(const name of names)for(const req of await(await caches.open(name)).keys())urls.push(req.url);
        return {local:localStorage.length,session:sessionStorage.length,databases:(await indexedDB.databases()).length,caches:names.length,staticOnly:urls.every(raw=>{const u=new URL(raw);return u.origin===location.origin&&!u.search&&['/','/index.html','/frame.html'].includes(u.pathname)||u.origin===location.origin&&!u.search&&/^\/assets\/[^/]+$/.test(u.pathname);})};
      });
      assert.deepEqual(storage,{local:0,session:0,databases:0,caches:1,staticOnly:true});
      return {warmOfflineStatus:offline.status,validatedOutputPreserved:offline.outputAllowed,invalidOutputBlocked:true,storage};
    });
    await check('G04-04','generated documents/settings never enter storage; static-only SW cache has no query URLs',async()=>{
      await context.setOffline(false);
      const result=await page.evaluate(async()=>{
        const names=await caches.keys(),entries=[];
        for(const name of names)for(const req of await(await caches.open(name)).keys()){const u=new URL(req.url);entries.push(!u.search&&u.origin===location.origin&&(['/','/index.html','/frame.html'].includes(u.pathname)||/^\/assets\/[^/]+$/.test(u.pathname)));}
        return {local:localStorage.length,session:sessionStorage.length,databases:(await indexedDB.databases()).length,caches:names.length,staticOnly:entries.every(Boolean),externalProbe:window.externalProbe===true};
      });
      assert.equal(result.local,0);assert.equal(result.session,0);assert.equal(result.databases,0);assert.equal(result.staticOnly,true);assert.equal(result.externalProbe,false);assert.equal(network.length,0);return result;
    });
    await check('G04-05','cold validation-asset acquisition failure blocks exports and only explicit retry recovers',async()=>{
      const cold=await browser.newContext({serviceWorkers:'block'});cold.setDefaultTimeout(25000);const tab=await cold.newPage();
      try{
        await cold.route('**/assets/validation-worker-*.js',route=>route.abort());
        await tab.goto('http://127.0.0.1:4187/?no-sw=1');await tab.waitForFunction(()=>window.gates);
        const rejected=await tab.evaluate(async()=>{const out=await gates.request('A','generate',{pointer:'',style:'mermaid'});window.coldSource=out;await gates.diagram.show(out);return gates.diagram.state();});
        assert.equal(rejected.outputAllowed,false);assert.equal(await tab.evaluate(()=>gates.diagram.retry()),false);
        await cold.unroute('**/assets/validation-worker-*.js');
        assert.equal(await tab.evaluate(()=>gates.diagram.state().outputAllowed),false);
        const explicit=await tab.evaluate(()=>gates.diagram.show(window.coldSource));assert.equal(explicit,true);
        await tab.waitForFunction(()=>['rendered','display-failed'].includes(gates.diagram.state().status));
        assert.equal(await tab.evaluate(()=>gates.diagram.state().status),'rendered');
        await tab.evaluate(()=>{gates.diagram.retry();gates.diagram.clear();});
        assert.equal(await tab.evaluate(()=>gates.diagram.state().outputAllowed),false);
        return {coldFailureBlocked:true,noAutomaticRetry:true,explicitRetryRecovered:true,clearRevokesOutput:true};
      }finally{await cold.close();}
    });
    await check('G04-06','metadata label punctuation stays data and astral Unicode source above 50,000 UTF-16 units still validates within codepoint limit',async()=>{
      const results=await page.evaluate(async()=>{
        gates.install('punctuation',JSON.stringify({"a'b":"'); click n0 'https://invalid.example'",spaces:'a  b',braces:'} --> n999',syntax:'`bold` **x**',escape:'a\\n\\t'}));
        const out=await gates.request('punctuation','generate',{pointer:'',style:'mermaid'});window.punctuationExpected=out.labels;
        const valid=await gates.diagram.show(out);return {valid};
      });assert.equal(results.valid,true);
      await page.waitForFunction(()=>['rendered','display-failed'].includes(gates.diagram.state().status));
      const exact=await page.evaluate(()=>{const s=gates.diagram.state();return s.status==='rendered'&&JSON.stringify(s.details.labels)===JSON.stringify(window.punctuationExpected);});assert.equal(exact,true);
      const sizes=await page.evaluate(async()=>{
        gates.install('astral',JSON.stringify(Array(199).fill('😀'.repeat(100))));const out=await gates.request('astral','generate',{pointer:'',style:'mermaid'});
        window.astralExpected=out.labels;const valid=await gates.diagram.show(out);return {valid,codepoints:Array.from(out.code).length,utf16:out.code.length,expected:out.labels.length};
      });assert.ok(sizes.codepoints<=50000);assert.ok(sizes.utf16>50000);assert.equal(sizes.valid,true);
      await page.waitForFunction(()=>['rendered','display-failed','render-timeout'].includes(gates.diagram.state().status));
      const actual=await page.evaluate(()=>gates.diagram.state());assert.equal(actual.status,'rendered');assert.equal(actual.details.nodeCount,sizes.expected);assert.equal(actual.details.edgeCount,sizes.expected-1);
      assert.equal(await page.evaluate(()=>JSON.stringify(gates.diagram.state().details.labels)===JSON.stringify(window.astralExpected)),true);await page.evaluate(()=>gates.diagram.clear());
      return {...sizes,punctuationExact:true,nodeCount:actual.details.nodeCount,edgeCount:actual.details.edgeCount,allLabelsExact:true};
    });
  }catch(error){checks.push({id:'environment',status:'unavailable',errorType:error.name});console.log(engine+' unavailable '+error.name+' '+String(error.message).replace(/[A-Z]:\\[^\n]+/gi,'[local path]').slice(0,1200));}
  finally{
    const result={engine,version:browser?.version(),started,checks,externalRequests:network,consoleErrorCount:consoleErrors.length};
    await writeFile(root+`evidence/${engine}${process.env.EVIDENCE_SUFFIX??''}.json`,JSON.stringify(result,null,2)+'\n');
    await browser?.close();
    console.log(engine+' summary '+JSON.stringify({pass:checks.filter(x=>x.status==='pass').length,fail:checks.filter(x=>x.status==='fail').length,unavailable:checks.filter(x=>x.status==='unavailable').length}));
    if(checks.some(x=>['fail','blocked','unavailable'].includes(x.status)))process.exitCode=1;
  }
}
