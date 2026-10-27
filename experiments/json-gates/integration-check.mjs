import {chromium,playwrightVersion} from './browser-runtime.mjs';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {generate,parseText} from './core.mjs';
import {integrationCSP} from './integration-policy.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const engines={chrome:()=>chromium.launch({channel:'chrome'}),edge:()=>chromium.launch({channel:'msedge'}),chromium:()=>chromium.launch()};
const origin='http://127.0.0.1:4190';
const text=JSON.stringify({synthetic:'<img src="https://example.invalid" onerror="bad()">',number:9007199254740991});
const expected=generate(parseText(text),'','mermaid');
const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);pdf.addPage().drawText('Synthetic integration fixture',{font,size:12});const bytes=Array.from(await pdf.save());
await mkdir(new URL('./evidence/',import.meta.url),{recursive:true});
for(const engine of process.argv.slice(2).length?process.argv.slice(2):['chrome','edge']){
  let browser,context,page;const checks=[],external=[],schemes=[];
  const check=async(id,intent,fn)=>{try{checks.push({id,intent,status:'pass',data:await fn()});console.log(`${engine} ${id} PASS`);}catch(error){checks.push({id,intent,status:'fail',errorType:error.name});process.exitCode=1;console.log(`${engine} ${id} FAIL ${error.name}`);}};
  const ready=async p=>{await p.goto(origin+'/readiness.html');await p.waitForFunction(()=>!!window.integration);};
  const show=async p=>{await p.evaluate(text=>integration.show(text),text);await p.waitForFunction(()=>integration.view.diagram.state().status==='rendered');};
  const pdfOK=async p=>assert.deepEqual(await p.evaluate(bytes=>integration.pdf(bytes),bytes),{pdfConverted:true,hasOutput:true,verified:true});
  try{
    browser=await engines[engine]();context=await browser.newContext();context.setDefaultTimeout(40000);
    context.on('request',r=>{if(/^https?:/.test(r.url())&&new URL(r.url()).origin!==origin)external.push(true);});
    await context.addInitScript(()=>{window.violations=[];document.addEventListener('securitypolicyviolation',e=>violations.push(e.effectiveDirective));});
    page=await context.newPage();page.on('worker',w=>schemes.push(new URL(w.url()).protocol));await ready(page);
    await check('IC-01','WASM pair and static JSON/diagram Workers coexist with exact labels/edges',async()=>{
      await pdfOK(page);await show(page);
      const data=await page.evaluate(()=>({labels:[...document.querySelectorAll('[data-label]')].map(e=>e.textContent),edges:[...document.querySelectorAll('[data-edge]')].map(e=>e.getAttribute('data-edge')),violations}));
      assert.deepEqual(data.labels,expected.graph.labels);assert.deepEqual(data.edges,expected.graph.parents.flatMap((p,i)=>p<0?[]:[`${p}:${i}`]));
      assert.equal(data.violations.length,0);assert.equal(external.length,0);assert.ok(schemes.length>=3&&schemes.every(s=>s==='http:'));
      return {bothWASM:true,exact:true,external:0,cspViolations:0,staticWorkersOnly:true};
    });
    await check('IC-02','existing sequential queue preserves PDF and JSON results across invalid JSON',async()=>{
      const data=await page.evaluate(bytes=>integration.mixed(bytes),bytes);
      assert.deepEqual(data,{results:[{id:1,pdf:true,json:false},{id:3,pdf:false,json:true}],errors:[2],starts:[1,2,3]});return data;
    });
    await check('IC-03','abort after completed item rejects late success and never starts next item',async()=>{
      const data=await page.evaluate(()=>integration.cancel());assert.deepEqual(data,{completed:[1],started:[1,2]});return data;
    });
    await check('IC-04','existing output functions preserve source and MD-only metadata; invalid diagram blocked',async()=>{
      const data=await page.evaluate(()=>integration.exports());assert.deepEqual(data,{valid:true,plainHasExactSource:true,bodyHasFrontmatter:false,downloadHasFrontmatter:true,deterministic:true,safeFileName:true,invalidBlocked:true});return data;
    });
    await check('IC-05','warm offline reload creates new WASM/JSON Workers with static-only cache and no restored input',async()=>{
      await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
      await context.setOffline(true);
      try{
        await page.reload();await page.waitForFunction(()=>!!window.integration);
        assert.equal(await page.evaluate(()=>integration.view.source()),undefined);await pdfOK(page);await show(page);
        const data=await page.evaluate(async()=>({local:localStorage.length,session:sessionStorage.length,db:(await indexedDB.databases()).length,keys:(await Promise.all((await caches.keys()).map(async k=>(await (await caches.open(k)).keys()).map(r=>new URL(r.url).pathname)))).flat()}));
        assert.equal(data.local+data.session+data.db,0);await context.setOffline(false);
        const allowed=await page.evaluate(async()=>(await (await fetch('/integration-assets.json')).json()).runtime.map(x=>x.url));
        assert.equal(data.keys.length,allowed.length);assert.ok(data.keys.every(x=>allowed.includes(x)));return {offlineWASM:true,newWorkers:true,noInputRestored:true,staticCacheAssets:data.keys.length};
      }finally{await context.setOffline(false);}
    });
    for(const [id,denyCSP] of [['IC-06',false],['IC-07',true]])await check(id,denyCSP?'negative CSP control denies Worker WASM execution':'cold missing WASM fails; explicit restored execution recovers',async()=>{
      const cold=await browser.newContext({serviceWorkers:'block'}),p=await cold.newPage();p.setDefaultTimeout(40000);
      try{
        await ready(p);
        if(denyCSP)await cold.route('**/*integration-conversion.worker*.js',async route=>{const r=await route.fetch();await route.fulfill({response:r,headers:{...r.headers(),'content-security-policy':integrationCSP.replace(" 'wasm-unsafe-eval'",'')}});});
        else await cold.route('**/*.wasm',route=>route.abort());
        assert.equal(await p.evaluate(async bytes=>{try{await integration.pdf(bytes);return false;}catch{return true;}},bytes),true);
        const before=await p.evaluate(()=>integration.calls());await cold.unrouteAll();assert.equal(await p.evaluate(()=>integration.calls()),before);
        await pdfOK(p);return {failureDetected:true,noAutomaticRetry:true,explicitRecovery:true};
      }finally{await cold.close();}
    });
  }catch(error){checks.push({id:'environment',status:'fail',errorType:error.name});console.log(`${engine} environment FAIL ${error.name}`);process.exitCode=1;}
  finally{await writeFile(new URL(`./evidence/integration-${engine}.json`,import.meta.url),JSON.stringify({date:'2026-10-27',base:'e927fe1',engine,playwrightVersion,version:browser?.version(),checks},null,2));await context?.close();await browser?.close();}
}
