import {chromium,firefox,webkit,playwrightVersion} from './browser-runtime.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const engines={chrome:()=>chromium.launch({channel:'chrome'}),edge:()=>chromium.launch({channel:'msedge'}),firefox:()=>firefox.launch(),webkit:()=>webkit.launch()};
await mkdir(new URL('./evidence/',import.meta.url),{recursive:true});
for(const name of process.argv.slice(2).length?process.argv.slice(2):Object.keys(engines)){
  let browser,context;const checks=[];
  try{
    browser=await engines[name]();context=await browser.newContext({serviceWorkers:'block'});
    await context.addInitScript(()=>{
      // Hold real JSON Worker replies, not fabricated success data. The serialized
      // queue intentionally prevents a new request overtaking the held reply.
      const NativeWorker=window.Worker,metadata=new Map(),held=[];
      let rule,previous;
      window.replyFault={
        arm:(operation,pointer)=>{rule={operation,pointer};},count:()=>held.length,
        release:()=>{const item=held.shift();previous=item;item.deliver();},
        replay:()=>previous.deliver(),
      };
      window.Worker=class extends NativeWorker{
        postMessage(message,transfer){if(message.operation)metadata.set(message.id,{operation:message.operation,pointer:message.pointer});super.postMessage(message,transfer);}
        set onmessage(handler){super.onmessage=event=>{
          const request=metadata.get(event.data.id);
          const deliver=()=>handler.call(this,event);
          if(rule&&request?.operation===rule.operation&&request.pointer===rule.pointer){rule=undefined;held.push({deliver});}else deliver();
        };}
      };
    });
    const page=await context.newPage();page.setDefaultTimeout(20000);
    await page.goto('http://127.0.0.1:4187/?no-sw=1');await page.waitForFunction(()=>!!window.gates);
    await page.evaluate(async()=>{await gates.convert('A','/results','records');await gates.open('A');});
    await page.waitForFunction(()=>!document.querySelector('#confirm').disabled);
    // Capture old valid response, then move to incompatible and back to valid.
    await page.evaluate(()=>{replyFault.arm('generate','/results');void gates.select('/results');});
    await page.waitForFunction(()=>replyFault.count()===1);
    await page.locator('input[name=target][value="/summary"]').check();
    await page.locator('input[name=target][value="/results"]').check();
    assert.equal(await page.locator('#confirm').isDisabled(),true);
    await page.evaluate(()=>{replyFault.arm('detail','/results');replyFault.release();});
    await page.waitForFunction(()=>replyFault.count()===1);
    await page.evaluate(()=>replyFault.replay());
    assert.equal(await page.locator('#confirm').isDisabled(),true);
    assert.equal(await page.evaluate(()=>gates.state().draft.style),'records');
    await page.evaluate(()=>{replyFault.arm('generate','/results');replyFault.release();});
    await page.waitForFunction(()=>replyFault.count()===1);
    assert.equal(await page.locator('#confirm').isDisabled(),true);
    await page.evaluate(()=>replyFault.release());
    await page.waitForFunction(()=>!document.querySelector('#confirm').disabled);
    assert.equal(await page.evaluate(()=>gates.state().draft.style),'records');
    const before=await page.evaluate(()=>gates.state().business.find(x=>x.id==='A'));
    assert.equal(before.hasResult,true);
    await page.locator('#confirm').click();
    const after=await page.evaluate(()=>gates.state().business.find(x=>x.id==='A'));
    assert.equal(after.style,'records');assert.equal(after.pointer,'/results');assert.equal(after.status,'queued');assert.equal(after.hasResult,false);
    checks.push({id:'G03-R01',status:'pass',data:{staleReplyIgnored:true,disabledDuringDetail:true,disabledDuringGeneration:true,styleRetained:true,oldResultPreservedUntilCommit:true}});
    console.log(`${name} G03-R01 PASS`);
  }catch(error){checks.push({id:'G03-R01',status:'fail',errorType:error.name});console.log(`${name} G03-R01 FAIL ${error.name}`);process.exitCode=1;}
  finally{await writeFile(new URL(`./evidence/selection-race-${name}.json`,import.meta.url),JSON.stringify({base:'48f975a',playwrightVersion,engine:name,version:browser?.version(),checks},null,2));await context?.close();await browser?.close();}
}
