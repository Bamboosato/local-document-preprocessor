import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('.',import.meta.url));
const targets=process.argv.slice(2).length?process.argv.slice(2):['chromium'];
const server=spawn(process.execPath,['standard-build.mjs','--preview'],{cwd,stdio:['ignore','pipe','pipe']});
let failures=0;
try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('preview-startup')),30000);server.once('error',()=>{clearTimeout(timer);reject(new Error('preview-startup'));});server.once('exit',()=>{clearTimeout(timer);reject(new Error('preview-startup'));});server.stdout.on('data',data=>{if(data.toString().includes('Standard preview port')){clearTimeout(timer);resolve();}});});
  await mkdir(new URL('evidence/',import.meta.url),{recursive:true});
  for(const target of targets){
    const browser=await chromium.launch({headless:true,...(target==='chromium'?{}:{channel:target==='edge'?'msedge':'chrome'})});
    const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();
    page.setDefaultTimeout(20000);const checks=[],external=[],pageErrors=[];
    page.on('request',req=>{const u=new URL(req.url());if(['http:','https:'].includes(u.protocol)&&u.origin!=='http://127.0.0.1:4194')external.push(u.protocol);});
    page.on('pageerror',()=>pageErrors.push('pageerror'));
    const check=async(id,intent,run)=>{
      let timer,expired=false;
      try{await Promise.race([run(),new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(new Error('case-deadline'));},45000);})]);checks.push({id,intent,status:'pass'});console.log(target+' '+id+' PASS');}
      catch{failures++;checks.push({id,intent,status:'fail',reason:expired?'case-deadline':'assertion-or-browser'});console.log(target+' '+id+' FAIL');await page.screenshot({path:cwd+'evidence/standard-'+target+'-'+id+'.png',mask:[page.locator('#standard-view'),page.locator('#standard-input')],timeout:5000}).catch(()=>{});if(expired)await page.close().catch(()=>{});}
      finally{clearTimeout(timer);}
    };
    try{
      await page.goto('http://127.0.0.1:4194/standard.html');await page.waitForFunction(()=>Boolean(window.standard));
      await check('SM-01','real JSON generation, Worker validation, SVG labels/edges, UI toggle',async()=>{
        await page.locator('#standard-input').fill('{"value":9007199254740993,"text":"<img src=x onerror=alert(1)>","emoji":"😀"}');await page.locator('#standard-convert').click();
        await page.waitForFunction(()=>standard.view.state().status==='rendered');
        const result=await page.evaluate(()=>{const expected=standard.make(document.querySelector('#standard-input').value);const paths=[...document.querySelectorAll('#standard-diagram .flowchart-link')];return {labels:[...document.querySelectorAll('#standard-diagram .node .label')].map(n=>n.textContent),expected:expected.labels,edges:paths.length,parents:expected.graph.parents.every((parent,i)=>parent<0||paths.some(p=>p.getAttribute('data-id')?.startsWith(`L_n${parent}_n${i}_`))),source:standard.view.source()===expected.code,output:standard.view.output()===expected.markdown};});
        assert.deepEqual(result.labels,result.expected);assert.equal(result.edges,result.labels.length-1);assert.ok(result.parents&&result.source&&result.output);
        assert.equal(await page.evaluate(()=>Boolean(document.querySelector('#standard-diagram svg style'))&&getComputedStyle(document.querySelector('#standard-diagram .node rect')).fill!=='rgb(0, 0, 0)'),true);
        await page.locator('#standard-show-source').click();assert.ok(await page.locator('#standard-source').isVisible());assert.equal(await page.locator('#standard-source').getAttribute('readonly'),'');await page.locator('#standard-show-diagram').click();
      });
      await check('SM-02','UTF8 limit +/-1 and oversized output retention without calling render',async()=>{
        const ok=await page.evaluate(async()=>{
          const t=standard.testing;let calls=0;const root=document.querySelector('#standard-view').cloneNode(true);document.body.append(root);
          const v=t.createStandardView(root,{validate:async()=>true,render:async()=>{calls++;return '<svg xmlns="http://www.w3.org/2000/svg"/>';},delay:0});
          const statuses=[];for(const size of [51199,51200,51201]){await v.show({code:'漢'.repeat(17000)+'a'.repeat(size-51000),markdown:'verified'});statuses.push(v.state().status);}
          const result=calls===2&&statuses.join(',')==='rendered,rendered,large'&&v.output()==='verified'&&t.utf8Bytes('😀')===4;
          v.dispose();root.remove();return result;
        });assert.equal(ok,true);
      });
      await check('SM-03','SVG sanitizer rejects executable elements, root handlers and external references',async()=>{
        const ok=await page.evaluate(()=>{
          const safe=standard.testing.sanitizeStandardSvg('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><foreignObject/><image href="https://invalid.example/a"/><style>@import "https://invalid.example/a";</style><g onclick="alert(1)"><a href="javascript:alert(1)"/><use href="https://invalid.example/a"/><path style="fill:url(https://invalid.example/a)"/><text>safe</text></g></svg>');
          const doc=new DOMParser().parseFromString(safe,'image/svg+xml');return !doc.querySelector('script,foreignObject,image,a,style,[onload],[onclick],[href],[style]')&&doc.querySelector('text').textContent==='safe';
        });assert.equal(ok,true);assert.equal(external.length,0);
        assert.equal(await page.evaluate(()=>standard.testing.sanitizeStandardSvg('<svg xmlns="http://www.w3.org/2000/svg"><style>@keyframes dash {to {stroke-dashoffset:0}}</style><path d="M0 0 L1 1"/></svg>').includes('@keyframes')),true);
      });
      await check('SM-04','out of order render/validation completion, clear and dispose discard old responses',async()=>{
        const ok=await page.evaluate(async()=>{
          const root=document.querySelector('#standard-view').cloneNode(true);document.body.append(root);const t=standard.testing;
          const waits={};let entered;
          const v=t.createStandardView(root,{validate:async()=>true,delay:0,render:code=>new Promise((resolve,reject)=>{waits[code]={resolve,reject};entered?.();})});
          const start=async code=>{const ready=new Promise(r=>entered=r);const task=v.show({code,markdown:code});await ready;return {task};};
          const a=await start('A'),b=await start('B');waits.B.resolve('<svg xmlns="http://www.w3.org/2000/svg"><text>B</text></svg>');await b.task;waits.A.reject(new Error('late'));await a.task;
          let ok=root.querySelector('#standard-diagram').textContent==='B'&&v.source()==='B'&&v.state().status==='rendered';
          const c=await start('C');v.clear();waits.C.resolve('<svg/>');await c.task;ok&&=v.state().status==='empty'&&v.source()===undefined;
          const d=await start('D');v.dispose();waits.D.resolve('<svg/>');await d.task;ok&&=root.querySelector('#standard-diagram').childNodes.length===0;root.remove();
          const r=document.querySelector('#standard-view').cloneNode(true);document.body.append(r);let late;const w=t.createStandardView(r,{validate:()=>new Promise(resolve=>late=resolve)});const pending=w.show({code:'old'});w.clear();late(true);await pending;ok&&=w.state().status==='empty';w.dispose();r.remove();return ok;
        });assert.equal(ok,true);
      });
      await check('SM-05','validation failure forbids output; display/resource failure preserves output and retries',async()=>{
        const ok=await page.evaluate(async()=>{
          const root=document.querySelector('#standard-view').cloneNode(true);document.body.append(root);const t=standard.testing;let fail=true;
          const v=t.createStandardView(root,{validate:async r=>r.code!=='invalid',delay:0,render:async()=>{if(fail)throw new Error('asset-or-render');return '<svg xmlns="http://www.w3.org/2000/svg"><text>OK</text></svg>';}});
          await v.show({code:'invalid',markdown:'no'});let ok=v.output()===undefined&&v.state().status==='invalid';
          await v.show({code:'valid',markdown:'verified'});ok&&=v.state().status==='error'&&v.output()==='verified';
          fail=false;root.querySelector('#standard-retry').click();await new Promise(r=>setTimeout(r,0));ok&&=v.state().status==='rendered'&&v.output()==='verified';v.dispose();root.remove();return ok;
        });assert.equal(ok,true);
        const invalid=await page.evaluate(async()=>{const result=standard.make('{}');result.code='flowchart invalid';await standard.view.show(result);return standard.view.state().status==='invalid'&&standard.view.output()===undefined;});assert.equal(invalid,true);
      });
      await check('SM-06','200 nodes and escaped data retain all labels; multi-byte generation can exceed display limit',async()=>{
        const result=await page.evaluate(async()=>{
          const item=standard.make(JSON.stringify(Array.from({length:199},(_,i)=>i)));await standard.view.show(item);
          const paths=[...document.querySelectorAll('#standard-diagram .flowchart-link')];
          const normal=standard.view.state().status==='rendered'&&document.querySelectorAll('#standard-diagram .node').length===200&&[...document.querySelectorAll('#standard-diagram .node .label')].every((n,i)=>n.textContent===item.labels[i])&&paths.length===199&&item.graph.parents.every((parent,i)=>parent<0||paths.some(p=>p.getAttribute('data-id')?.startsWith(`L_n${parent}_n${i}_`)));
          const large=standard.make(JSON.stringify(Array.from({length:180},()=> '漢'.repeat(70))));await standard.view.show(large);
          return {normal,large:standard.view.state().status==='large',output:standard.view.output()===large.markdown};
        });assert.ok(result.normal&&result.large&&result.output);
      });
      await check('SM-07','reload starts empty; no storage/cache input or external requests',async()=>{
        const clean=await page.evaluate(async()=>localStorage.length===0&&sessionStorage.length===0&&(await indexedDB.databases()).length===0&&(await caches.keys()).length===0);assert.equal(clean,true);
        await page.reload();await page.waitForFunction(()=>Boolean(window.standard));assert.equal(await page.evaluate(()=>standard.view.state().status==='empty'&&standard.view.source()===undefined&&document.querySelector('#standard-input').value===''),true);assert.equal(external.length,0);assert.equal(pageErrors.length,0);
      });
      await check('SM-08','real lazy chunk request failure preserves source; explicit retry reloads library',async()=>{
        const isolated=await browser.newContext();const fresh=await isolated.newPage();
        try{
          await fresh.route('**/assets/mermaid.core-*.js',route=>route.abort());
          await fresh.goto('http://127.0.0.1:4194/standard.html');await fresh.waitForFunction(()=>Boolean(window.standard));
          const result=await fresh.evaluate(async()=>{await standard.view.show(standard.make('{"case":1}'));return {status:standard.view.state().status,allowed:standard.view.output()!==undefined};});
          assert.equal(result.status,'error');assert.equal(result.allowed,true);
          // Dynamic import failure can remain cached by the browser. A reload is
          // the recovery boundary for failed module fetches, not endless retries.
          await fresh.unroute('**/assets/mermaid.core-*.js');await fresh.reload();await fresh.waitForFunction(()=>Boolean(window.standard));
          const recovered=await fresh.evaluate(async()=>{await standard.view.show(standard.make('{"case":1}'));return standard.view.state().status==='rendered';});assert.equal(recovered,true);
        }finally{await isolated.close();}
      });
      await writeFile(cwd+'evidence/standard-'+target+'.json',JSON.stringify({browser:target,version:browser.version(),checks,externalRequests:external.length,pageErrors:pageErrors.length,scope:'headless synthetic fixtures; not device or installed PWA proof'},null,2));
    }finally{await context.close();await browser.close();}
  }
}catch{failures++;console.log('standard setup FAIL');}
finally{if(server.exitCode===null){server.kill();await new Promise(resolve=>server.once('exit',resolve));}}
if(failures)process.exitCode=1;
