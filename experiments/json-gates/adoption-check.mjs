import {chromium,playwrightVersion} from './browser-runtime.mjs';
import {generate,parseText} from './core.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const engines={chrome:()=>chromium.launch({channel:'chrome'}),edge:()=>chromium.launch({channel:'msedge'}),chromium:()=>chromium.launch()};
const fixture=generate(parseText(JSON.stringify(Array(199).fill('😀'.repeat(90)))),'','mermaid');
await mkdir(new URL('./evidence/',import.meta.url),{recursive:true});
for(const name of process.argv.slice(2).length?process.argv.slice(2):['chrome','edge']){
  let browser,context,page;const checks=[];
  async function check(id,fn){
    try{const data=await fn();checks.push({id,status:'pass',data});console.log(`${name} ${id} PASS`);}
    catch(error){const state=await page?.evaluate(()=>{const s=readiness.diagram.state();return {status:s.status,viewMode:s.viewMode,scale:s.scale,outputAllowed:s.outputAllowed};}).catch(()=>undefined);checks.push({id,status:'fail',errorType:error.name,state});process.exitCode=1;console.log(`${name} ${id} FAIL ${error.name}`);}
  }
  const rendered=p=>p.waitForFunction(()=>readiness.diagram.state().status==='rendered');
  const show=async(p=page)=>{await p.evaluate(result=>readiness.diagram.show(result),fixture);await rendered(p);};
  const exact=async(p=page)=>{
    const data=await p.evaluate(()=>({labels:[...document.querySelectorAll('#diagram [data-label]')].map(n=>n.textContent),edges:[...document.querySelectorAll('#diagram [data-edge]')].map(n=>n.getAttribute('data-edge'))}));
    assert.deepEqual(data.labels,fixture.graph.labels);assert.deepEqual(data.edges,fixture.graph.parents.flatMap((p,i)=>p<0?[]:[`${p}:${i}`]));return {nodes:data.labels.length,edges:data.edges.length};
  };
  try{
    browser=await engines[name]();context=await browser.newContext();context.setDefaultTimeout(20000);page=await context.newPage();
    await page.goto('http://127.0.0.1:4188/readiness.html');await page.waitForFunction(()=>!!window.readiness);
    await check('AD-01',async()=>{
      await show();await page.getByRole('button',{name:'全体を表示',exact:true}).click();
      const geometry=await page.evaluate(()=>{const v=document.querySelector('#diagram-viewport'),s=document.querySelector('#diagram svg').getBoundingClientRect();return {width:s.width,height:s.height,viewportWidth:v.clientWidth,viewportHeight:v.clientHeight};});
      assert.ok(geometry.width>0&&geometry.height>0);assert.ok(geometry.width<=geometry.viewportWidth+1&&geometry.height<=geometry.viewportHeight+1);
      await page.getByRole('button',{name:'拡大',exact:true}).click();await page.getByRole('button',{name:'縮小',exact:true}).click();await page.getByRole('button',{name:'100%に戻す',exact:true}).click();
      assert.equal(await page.evaluate(()=>readiness.diagram.state().scale),1);return {...geometry,...await exact()};
    });
    await check('AD-02',async()=>{
      for(const id of ['zoom-in','zoom-out'])await page.evaluate(id=>{const b=document.getElementById(id);for(let i=0;i<100&&!b.disabled;i++)b.click();},id);
      assert.equal(await page.locator('#zoom-out').isDisabled(),true);
      await page.locator('#reset-zoom').click();assert.equal(await page.evaluate(()=>readiness.diagram.state().scale),1);
      await page.evaluate(()=>{const b=document.getElementById('zoom-in');for(let i=0;i<100&&!b.disabled;i++)b.click();});
      assert.equal(await page.locator('#zoom-in').isDisabled(),true);assert.equal(await page.evaluate(()=>readiness.diagram.state().scale),4);
      const narrow=await browser.newContext({viewport:{width:320,height:800}});
      try{const p=await narrow.newPage();await p.goto('http://127.0.0.1:4188/readiness.html');await p.waitForFunction(()=>!!window.readiness);await show(p);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await p.screenshot({path:new URL(`./evidence/adoption-${name}-controls.png`,import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'),mask:[p.locator('#diagram'),p.locator('#diagram-source')]});}finally{await narrow.close();}
      return {minimumReached:true,maximum:4,narrowOverflow:false};
    });
    await check('AD-03',async()=>{
      await page.evaluate(result=>readiness.diagram.show({...result,code:'invalid diagram'}),fixture);
      assert.equal(await page.locator('#show-source').isDisabled(),true);assert.equal(await page.locator('#diagram-source').inputValue(),'');assert.equal(await page.evaluate(()=>readiness.source()===undefined),true);
      await show();await page.locator('#show-source').click();assert.equal(await page.locator('#diagram-source').inputValue(),fixture.code);assert.equal(await page.evaluate(()=>readiness.source()),fixture.code);
      await page.locator('#show-diagram').click();return {failClosed:true,sourceUnchanged:true};
    });
    await check('AD-04',async()=>{
      await page.evaluate(()=>{readiness.diagram.setMode({blockMilliseconds:6500});readiness.diagram.retry();});await page.waitForFunction(()=>readiness.diagram.state().status==='render-timeout');
      assert.equal(await page.locator('#diagram-source').isVisible(),true);assert.equal(await page.locator('#diagram-source').inputValue(),fixture.code);
      await page.evaluate(()=>readiness.diagram.setMode({}));await page.locator('#retry-diagram').click();await rendered(page);
      assert.equal(await page.evaluate(()=>readiness.source()),fixture.code);await exact();
      await page.evaluate(()=>readiness.diagram.clear());assert.equal(await page.evaluate(()=>readiness.source()===undefined),true);assert.equal(await page.locator('#diagram-source').inputValue(),'');assert.equal(await page.locator('#show-source').isDisabled(),true);
      return {sourceRetainedOnRetry:true,cleared:true};
    });
    await check('AD-05',async()=>{
      await show();await page.locator('#show-source').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#diagram-source').isVisible(),true);
      assert.equal(await page.evaluate(()=>document.activeElement.id),'show-source');
      await page.locator('#show-diagram').focus();await page.keyboard.press('Enter');await page.locator('#zoom-in').focus();await page.keyboard.press('Enter');
      await page.locator('#reset-zoom').click();
      await page.getByRole('region',{name:'JSON構造図の表示領域',exact:true}).focus();await page.keyboard.press('PageDown');
      await page.waitForFunction(()=>document.querySelector('#diagram-viewport').scrollTop>0);
      assert.equal(await page.evaluate(()=>document.activeElement.id),'diagram-viewport');return {keyboard:true,namedRegion:true,screenReaderVerified:false};
    });
    await check('AD-06',async()=>{
      const cold=await browser.newContext({serviceWorkers:'block'}),p=await cold.newPage();
      try{await p.goto('http://127.0.0.1:4188/readiness.html?no-sw=1');await p.waitForFunction(()=>!!window.readiness);await cold.route('**/*validation-worker*',r=>r.abort());
        await p.evaluate(result=>readiness.diagram.show(result),fixture);assert.equal(await p.locator('#show-source').isDisabled(),true);assert.equal(await p.locator('#retry-diagram').isVisible(),false);
        await cold.unrouteAll();assert.equal(await p.evaluate(()=>readiness.diagram.state().status),'validation-failed');await show(p);return {noAutomaticRetry:true,explicitRecovery:true};
      }finally{await cold.close();}
    });
  }catch(error){const code=/ERR_[A-Z_]+|Timeout/.exec(error.message)?.[0]??'setup-error';checks.push({id:'environment',status:'fail',errorType:error.name,code});console.log(`${name} environment FAIL ${code}`);process.exitCode=1;}
  finally{await writeFile(new URL(`./evidence/adoption-${name}.json`,import.meta.url),JSON.stringify({engine:name,version:browser?.version(),playwrightVersion,checks},null,2));await context?.close();await browser?.close();}
}
