import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const template=await readFile(new URL('./readiness-sw-template.js',import.meta.url),'utf8');
function harness({deny=false,quota=false}={}){
  const listeners={},stores=new Map([['json-readiness-old',{}],['unrelated',{}]]);
  let claimed=false;
  const caches={
    open:async name=>{if(deny)throw new Error('denied');if(!stores.has(name))stores.set(name,{});return {addAll:async()=>{if(quota)throw new Error('quota');},match:async()=>undefined};},
    keys:async()=>[...stores.keys()],delete:async name=>stores.delete(name),
  };
  vm.runInNewContext(template.replace('__GENERATION__','new').replace('__ASSETS__',JSON.stringify(['/readiness.html','/assets/worker-fixed.js'])),{
    URL,caches,fetch:async()=>({ok:true}),self:{location:{origin:'https://fixture.invalid'},clients:{claim:async()=>{claimed=true;}},addEventListener:(name,fn)=>{listeners[name]=fn;}},
  });
  const event=name=>{let promise;listeners[name]({waitUntil:p=>{promise=p;}});return promise;};
  return {stores,listeners,event,claimed:()=>claimed};
}
test('SW-01 activation removes only owned old generation after successful install',async()=>{
  const h=harness();await h.event('install');assert.equal(h.stores.has('json-readiness-old'),true);
  await h.event('activate');assert.deepEqual([...h.stores.keys()],['unrelated','json-readiness-new']);assert.equal(h.claimed(),true);
});
test('SW-02 failed quota installation removes partial cache and retains old generation',async()=>{
  const h=harness({quota:true});await assert.rejects(h.event('install'));
  assert.deepEqual([...h.stores.keys()],['json-readiness-old','unrelated']);assert.equal(h.claimed(),false);
});
test('SW-03 denied storage rejects install rather than marking assets ready',async()=>{
  const h=harness({deny:true});await assert.rejects(h.event('install'));assert.equal(h.stores.has('json-readiness-old'),true);
});
test('SW-04 non-GET, query, outside origin and unlisted paths bypass cache',()=>{
  const h=harness();
  for(const [method,url]of [['POST','https://fixture.invalid/readiness.html'],['GET','https://fixture.invalid/readiness.html?input=x'],['GET','https://outside.invalid/readiness.html'],['GET','https://fixture.invalid/input.json']]){
    let handled=false;h.listeners.fetch({request:{method,url},respondWith:()=>{handled=true;}});assert.equal(handled,false);
  }
});
test('SW-05 denied cache falls back to online request without persisting it',async()=>{
  const h=harness({deny:true});let result;
  h.listeners.fetch({request:{method:'GET',url:'https://fixture.invalid/readiness.html'},respondWith:p=>{result=p;}});
  assert.equal((await result).ok,true);
});
