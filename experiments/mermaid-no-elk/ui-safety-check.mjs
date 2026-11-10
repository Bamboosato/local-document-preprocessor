import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
import {startServer} from './poc-server.mjs';
const server=await startServer(fileURLToPath(new URL('./dist/',import.meta.url)));
const browser=await chromium.launch({headless:true,channel:process.env.POC_BROWSER_CHANNEL||'chrome'});
const results=[];
try{
  const context=await browser.newContext({acceptDownloads:true});const page=await context.newPage();
  page.setDefaultTimeout(15000);const external=[],dialogs=[];
  context.on('request',r=>{if(new URL(r.url()).origin!==server.origin)external.push(new URL(r.url()).origin);});
  page.on('dialog',async dialog=>{dialogs.push(dialog.type());await dialog.dismiss();});
  await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copied=text;}}});});
  await page.goto(server.origin);await page.waitForFunction(()=>!!window.poc);
  const fixture='{"a/b":{"~k":9007199254740993,"zero":-0,"日本語":"ｶﾅ😀"},"outside":"OUTSIDE_SENTINEL"}';
  await page.locator('#json-input').fill(fixture);await page.locator('#pointer').fill('/a~1b');await page.locator('#convert').click();
  await page.waitForFunction(()=>document.querySelector('#status').textContent==='完了');
  assert.equal(await page.locator('#result .node').count(),4);
  const selectedGraphMatches=await page.evaluate(({fixture})=>{const graph=window.poc.graph(fixture,'/a~1b'),nodes=[...document.querySelectorAll('#result .node')],edges=[...document.querySelectorAll('#result path.flowchart-link')];return graph.labels.every((label,i)=>nodes.some(n=>new RegExp(`-flowchart-n${i}-\\d+$`).test(n.id)&&n.textContent===label))&&graph.parents.every((parent,i)=>parent<0||edges.some(e=>new RegExp(`-L_n${parent}_n${i}_\\d+$`).test(e.id)))&&edges.length===graph.parents.filter(p=>p>=0).length;},{fixture});assert.equal(selectedGraphMatches,true);
  await page.locator('#source').click();assert.equal(await page.locator('#source-code').isVisible(),true);
  const source=await page.locator('#source-code').textContent();assert.ok(source.includes('9007199254740993'));assert.ok(source.includes('-0'));assert.ok(!source.includes('OUTSIDE_SENTINEL'));
  await page.locator('#copy').click();assert.equal(await page.evaluate(()=>window.copied),source);
  await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw Error('synthetic-clipboard-denied');};});await page.locator('#copy').click();await page.waitForFunction(()=>document.querySelector('#status').textContent==='コピーできませんでした');assert.equal(await page.locator('#source-code').textContent(),source);
  const downloadPromise=page.waitForEvent('download');await page.locator('#save').click();const download=await downloadPromise;
  const chunks=await (await download.createReadStream()).toArray();const markdown=Buffer.concat(chunks).toString('utf8');assert.equal(download.suggestedFilename(),'fixture.md');assert.ok(markdown.includes(source));assert.ok(!markdown.includes('OUTSIDE_SENTINEL'));assert.ok(markdown.includes('/a~1b'));
  await page.locator('#diagram').click();assert.equal(await page.locator('#result svg').isVisible(),true);results.push('selected pointer, source switch, copied source, downloaded Markdown');
  await page.locator('#json-input').fill('{"rows":[{"value":"EXCLUDED_ROW"},{"value":"SELECTED_ROW"}],"outside":"EXCLUDED_ROOT"}');await page.locator('#pointer').fill('/rows/1');await page.locator('#convert').click();await page.waitForFunction(()=>document.querySelector('#status').textContent==='完了');await page.locator('#source').click();const selected=await page.locator('#source-code').textContent();assert.ok(selected.includes('SELECTED_ROW'));assert.ok(!selected.includes('EXCLUDED_ROW')&&!selected.includes('EXCLUDED_ROOT'));results.push('array element selection excludes other row and root');
  await page.locator('#pointer').fill('/outside');assert.equal(await page.locator('#copy').isDisabled(),true);assert.equal(await page.locator('#source-code').textContent(),'');
  await page.locator('#convert').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('処理失敗'));assert.equal(await page.locator('#save').isDisabled(),true);results.push('invalid scalar selection rejects and invalidates output');
  await page.locator('#pointer').fill('');
  const payloads=['<script>alert(1)</script>','<img src=https://example.invalid/x onerror=alert(1)>','%%{init:{"securityLevel":"loose"}}%%','click n0 "https://example.invalid/"','a\n b & < > \\" \''];
  for(const value of payloads){await page.locator('#json-input').fill(JSON.stringify({danger:value}));await page.locator('#convert').click();await page.waitForFunction(()=>document.querySelector('#status').textContent==='完了');assert.equal(await page.locator('#result script,#result foreignObject,#result image,#result [onclick],#result [onerror],#result a').count(),0);}
  const sanitized=await page.evaluate(()=>window.poc.sanitize('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><foreignObject/><image href="https://example.invalid/x"/><a href="javascript:alert(1)"><text>x</text></a><style>@import url(https://example.invalid/y);</style><rect style="fill:url(https://example.invalid/z)"/></svg>'));
  assert.ok(!/script|foreignObject|https:|javascript:|onload|@import/.test(sanitized));assert.equal(dialogs.length,0);results.push('dangerous strings, remote references and SVG sanitization');
  for(const mode of ['crash','malformed','silent']){
    await page.route('**/worker.js',route=>route.fulfill({contentType:'text/javascript',body:mode==='crash'?'throw Error("synthetic-worker-fault")':mode==='malformed'?'onmessage=()=>postMessage({parse:true})':'onmessage=()=>{}'}));
    await page.evaluate(()=>window.poc.testing.setValidationTimeout(300));
    await page.locator('#convert').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('処理失敗'));
    assert.equal(await page.locator('#save').isDisabled(),true);assert.equal(await page.locator('#copy').isDisabled(),true);assert.equal(await page.locator('#source-code').textContent(),'');assert.equal(await page.evaluate(()=>window.poc.testing.activeWorkers()),0);
    await page.unroute('**/worker.js');
  }
  results.push('worker crash, malformed response, deadline: no unverified exports and workers released');
  await page.route('**/worker.js',route=>route.fulfill({contentType:'text/javascript',body:'onmessage=()=>{}'}));
  await page.evaluate(()=>window.poc.testing.setValidationTimeout(15000));await page.locator('#convert').click();await page.waitForFunction(()=>window.poc.testing.activeWorkers()===1);
  await page.locator('#cancel').click();assert.equal(await page.evaluate(()=>window.poc.testing.activeWorkers()),0);assert.equal(await page.locator('#status').textContent(),'取消済み');
  await page.locator('#convert').click();await page.waitForFunction(()=>window.poc.testing.activeWorkers()===1);await page.locator('#pointer').fill('/missing');assert.equal(await page.evaluate(()=>window.poc.testing.activeWorkers()),0);assert.equal(await page.locator('#copy').isDisabled(),true);await page.locator('#pointer').fill('');
  await page.unroute('**/worker.js');await page.locator('#convert').click();await page.waitForFunction(()=>document.querySelector('#status').textContent==='完了');
  await page.locator('#clear').click();assert.equal(await page.locator('#json-input').inputValue(),'');assert.equal(await page.locator('#save').isDisabled(),true);assert.equal(await page.locator('#result svg').count(),0);results.push('cancel terminates active worker, retry succeeds, clear invalidates');
  const storage=await page.evaluate(async()=>({local:localStorage.length,session:sessionStorage.length,databases:(await indexedDB.databases()).length}));assert.deepEqual(storage,{local:0,session:0,databases:0});
  assert.deepEqual(external,[]);console.log(JSON.stringify({browser:browser.version(),checks:results,externalRequests:external.length,storage,clipboard:'test double including denial; OS integration not verified',passed:true}));await context.close();
}finally{await browser.close();await server.close();}
