import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
import {tmpdir} from 'node:os';
import {resolve,sep} from 'node:path';
import {buildPwaManifest} from './build-pwa-manifest.mjs';
const source=await readFile(new URL('../public/sw.js',import.meta.url),'utf8'),origin='https://pwa.invalid';
const digest=value=>createHash('sha256').update(value).digest('hex');
function harness({id='a'.repeat(24),store=new Map(),fault={},network={}}={}){
  const bodies={'/index.html':['<html>A</html>','text/html'],'/assets/a.js':['export const version="A";','text/javascript'],'/assets/a.wasm':['binary-A','application/wasm']};
  const assets=Object.entries(bodies).map(([url,[body]])=>({url,sha256:digest(body),bytes:Buffer.byteLength(body)}));
  const key=request=>new URL(typeof request==='string'?request:request.url,origin).href;
  const cache=name=>({
    match:async request=>store.get(name)?.get(key(request))?.clone(),
    keys:async()=>[...store.get(name).keys()].map(url=>new Request(url)),
    delete:async request=>store.get(name).delete(key(request)),
    put:async(request,response)=>{if(fault.put&&key(request).includes(fault.put))throw new DOMException('synthetic','QuotaExceededError');store.get(name).set(key(request),response.clone());},
  });
  const caches={has:async name=>store.has(name),keys:async()=>{if(fault.keys)throw Error('denied');return[...store.keys()];},delete:async name=>{if(fault.delete)throw Error('denied');return store.delete(name);},open:async name=>{if(fault.open)throw Error('denied');if(!store.has(name))store.set(name,new Map());return cache(name);}};
  const handlers=new Map(),fetches=[],messages=[];
  const self={__LDP_BUILD__:{id,assets},location:new URL(origin),addEventListener:(name,handler)=>handlers.set(name,handler),clients:{matchAll:async options=>{assert.equal(options.type,'window');return[{postMessage:message=>messages.push(message)}];}},skipWaiting:()=>{throw Error('forced-takeover');}};
  vm.runInNewContext(source,{self,caches,crypto:webcrypto,Request,Response,URL,Uint8Array,fetch:async request=>{const path=new URL(request.url).pathname;fetches.push(path);const [body,type]=network[path]??bodies[path]??['missing','text/plain'];return new Response(body,{headers:{'content-type':type}});}});
  async function dispatch(type,properties={}){const waiting=[];let response;handlers.get(type)({...properties,waitUntil:promise=>waiting.push(promise),respondWith:promise=>{response=promise;}});await Promise.all(waiting);return response?await response:undefined;}
  const request=(path,mode='same-origin',method='GET')=>dispatch('fetch',{request:{url:new URL(path,origin).href,mode,method},clientId:'fixture'});
  const message=async type=>{let reply;await dispatch('message',{data:{type},ports:[{postMessage:value=>{reply=value;}}]});return reply;};
  return {store,caches,self,cache:()=>cache('ldp-static-'+id),dispatch,request,message,fetches,fault,network,messages,name:'ldp-static-'+id};
}
test('PW-01 install verifies all assets and status; activation cleans only owned old generations',async()=>{
  const h=harness();h.store.set('ldp-static-old',new Map());h.store.set('unrelated-cache',new Map());await h.dispatch('install');
  assert.equal((await h.message('LDP_STATUS')).complete,true);assert.equal(h.fetches.length,3);await h.dispatch('activate');assert.equal(h.store.has('ldp-static-old'),false);assert.equal(h.store.has('unrelated-cache'),true);
  await h.cache().put('/__ldp_static_ready__',new Response('wrong-generation'));assert.equal((await h.message('LDP_STATUS')).complete,false);
});
test('PW-02 corrupt update rolls back only the new cache and preserves the active generation',async()=>{
  const old=harness();await old.dispatch('install');const next=harness({id:'b'.repeat(24),store:old.store,network:{'/assets/a.js':['corrupt','text/javascript']}});
  await assert.rejects(next.dispatch('install'));assert.equal(old.store.has(old.name),true);assert.equal(old.store.has(next.name),false);assert.equal((await old.message('LDP_STATUS')).complete,true);
});
test('PW-03 quota failure at completion cannot publish partial ready state',async()=>{
  const h=harness({fault:{put:'__ldp_static_ready__'}});await assert.rejects(h.dispatch('install'));assert.equal(h.store.has(h.name),false);
});
test('PW-04 denied Cache API preserves old data; same-generation repair failure does not delete a preexisting cache',async()=>{
  const old=harness();await old.dispatch('install');old.fault.open=true;await assert.rejects(old.dispatch('install'));assert.equal(old.store.has(old.name),true);old.fault.open=false;
  await old.cache().delete('/assets/a.js');old.fault.put='a.js';const reply=await old.message('LDP_REPAIR');assert.equal(reply.failed,true);assert.equal(reply.complete,false);assert.equal(old.store.has(old.name),true);
});
test('PW-05 old HTML stays pinned after server changes; unknown assets and corrupted HTML fail closed',async()=>{
  const h=harness();await h.dispatch('install');h.fetches.length=0;h.network['/index.html']=['<html>B</html>','text/html'];
  assert.equal(await(await h.request('/?private=fixture','navigate')).text(),'<html>A</html>');assert.equal(h.fetches.length,0);
  assert.equal((await h.request('/assets/b.js')).status,503);await h.cache().delete('/index.html');assert.equal((await h.request('/','navigate')).status,503);
});
test('PW-06 queries, POST, foreign origin and user-document URLs are never cached',async()=>{
  const h=harness();await h.dispatch('install');const before=(await h.cache().keys()).length;
  for(const [path,mode,method]of [['/?private=fixture','cors','GET'],['/upload','cors','POST'],['https://other.invalid/assets/a.js','cors','GET'],['/user.json','cors','GET']])assert.equal(await h.request(path,mode,method),undefined);
  assert.equal((await h.cache().keys()).length,before);assert.equal((await h.cache().keys()).some(r=>r.url.includes('private=')),false);
});
test('PW-07 evicted asset repairs only matching bytes/MIME; bad cached bytes never produce offline-ready success',async()=>{
  const h=harness();await h.dispatch('install');await h.cache().delete('/assets/a.js');assert.equal((await h.request('/assets/a.js')).status,200);
  await h.cache().put('/assets/a.js',new Response('corrupt'));h.network['/assets/a.js']=['export const version="A";','text/html'];assert.equal((await h.request('/assets/a.js')).status,503);assert.equal((await h.message('LDP_STATUS')).complete,false);
  delete h.network['/assets/a.js'];assert.equal((await h.message('LDP_REPAIR')).complete,true);
});
test('PW-08 cleanup denial keeps the new generation active and usable',async()=>{
  const h=harness();await h.dispatch('install');h.store.set('ldp-static-old',new Map());h.fault.delete=true;await h.dispatch('activate');assert.equal((await h.message('LDP_STATUS')).complete,true);
});
test('PW-09 build inventory is deterministic and includes unvisited lazy assets and license originals',async()=>{
  const dir=await mkdtemp(resolve(tmpdir(),'ldp-pwa-unit-'));
  try{await mkdir(resolve(dir,'assets'));await mkdir(resolve(dir,'licenses'));await writeFile(resolve(dir,'index.html'),'<html><head></head></html>');await writeFile(resolve(dir,'assets/lazy.js'),'export const A=1;');await writeFile(resolve(dir,'licenses/LICENSE'),'fixture license');
    const a=await buildPwaManifest(dir),b=await buildPwaManifest(dir);assert.equal(a.id,b.id);assert.equal(a.assets.some(x=>x.url==='/licenses/LICENSE'),true);assert.equal(a.assets.some(x=>x.url==='/assets/lazy.js'),true);
  }finally{if(!resolve(dir).startsWith(resolve(tmpdir())+sep))throw Error('unsafe-cleanup');await rm(dir,{recursive:true,force:true});}
});
test('PW-10 activation does not collect a later installing or waiting generation',async()=>{
  const h=harness();await h.dispatch('install');h.store.set('ldp-static-future',new Map());h.self.registration={waiting:{}};await h.dispatch('activate');assert.equal(h.store.has('ldp-static-future'),true);
});
