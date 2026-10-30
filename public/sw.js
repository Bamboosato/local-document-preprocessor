// The production builder prepends the exact static distribution inventory.
const BUILD=self.__LDP_BUILD__;
const CACHE_NAME=BUILD?'ldp-static-'+BUILD.id:'ldp-unbuilt';
const READY='/__ldp_static_ready__';
const entries=new Map((BUILD?.assets??[]).map(asset=>[asset.url,asset]));
const origin=self.location.origin;
let degraded=false;
function pathOf(url){try{return url.pathname.split('/').map(segment=>encodeURIComponent(decodeURIComponent(segment))).join('/');}catch{return '';}}
function isStaticAsset(url){return url.search === '' && entries.has(pathOf(url));}
function appPath(url){const path=pathOf(url);return path==='/'?'/index.html':path;}
async function valid(response,entry){
  if(!response?.ok||response.redirected||response.type==='opaque')return false;
  const mime=(response.headers.get('content-type')??'').split(';')[0].trim();
  if(entry.url.endsWith('.js')&&!['text/javascript','application/javascript'].includes(mime))return false;
  if(entry.url.endsWith('.css')&&mime!=='text/css')return false;
  if(entry.url.endsWith('.wasm')&&mime!=='application/wasm')return false;
  if(entry.url.endsWith('.html')&&mime!=='text/html')return false;
  const bytes=await response.clone().arrayBuffer();
  if(bytes.byteLength!==entry.bytes)return false;
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('')===entry.sha256;
}
async function verifiedNetwork(entry){
  const response=await fetch(new Request(new URL(entry.url,origin),{cache:'no-store',credentials:'same-origin',redirect:'error'}));
  if(!await valid(response,entry))throw new Error('invalid-static-asset');
  return response;
}
async function fill(){
  if(!BUILD||!entries.has('/index.html'))throw new Error('unbuilt-worker');
  const existed=await caches.has(CACHE_NAME),cache=await caches.open(CACHE_NAME);
  try{
    // Sequential verification limits simultaneous large WASM buffers.
    for(const entry of entries.values()){
      const cached=await cache.match(entry.url);
      if(!await valid(cached,entry))await cache.put(entry.url,await verifiedNetwork(entry));
    }
    await cache.put(READY,new Response(BUILD.id));
    degraded=false;
  }catch(error){if(!existed)await caches.delete(CACHE_NAME).catch(()=>{});throw error;}
}
async function status(){
  try{
    const cache=await caches.open(CACHE_NAME),keys=new Set((await cache.keys()).map(request=>pathOf(new URL(request.url))));
    const marker=await cache.match(READY),ready=marker&&await marker.text()===BUILD?.id;
    return {generation:BUILD?.id,complete:!degraded&&!!ready&&[...entries.keys()].every(path=>keys.has(path))};
  }catch{return {generation:BUILD?.id,complete:false};}
}
function unavailable(navigation){
  if(!navigation)return new Response('Static generation unavailable',{status:503,headers:{'content-type':'text/plain','cache-control':'no-store'}});
  const nonce=[...crypto.getRandomValues(new Uint8Array(16))].map(value=>value.toString(16).padStart(2,'0')).join('');
  // This small trusted recovery page must work even when index.html is gone.
  // It prepares an update only; it never reloads or activates over other tabs.
  const script=`const b=document.getElementById('recover'),m=document.getElementById('message');b.addEventListener('click',async()=>{b.disabled=true;m.textContent='更新を確認しています。';try{const r=await navigator.serviceWorker.getRegistration();if(!r)throw Error();await r.update();const w=r.installing;const show=()=>{if(r.waiting||w?.state==='installed'){m.textContent='更新の準備ができました。ほかのタブの結果を保存し、すべてのタブ・PWAを閉じてから再度開いてください。';b.disabled=false;}else if(w?.state==='redundant'){m.textContent='更新を準備できませんでした。接続と保存設定を確認して再試行してください。';b.disabled=false;}};if(w)w.addEventListener('statechange',show);show();if(!w&&!r.waiting){m.textContent='結果を保存してすべてのタブ・PWAを閉じ、再度開いてください。';b.disabled=false;}}catch{m.textContent='更新を準備できませんでした。接続と保存設定を確認して再試行してください。';b.disabled=false;}});`;
  return new Response('<!doctype html><meta charset="utf-8"><title>オフライン資産を利用できません</title><h1>オフライン資産を利用できません</h1><p id="message">接続とブラウザーの保存設定を確認してください。ほかのタブの結果は保存してから再起動してください。</p><button id="recover">更新を確認</button><p><a href="/">再読み込み</a></p><script nonce="'+nonce+'">'+script+'</script>',{status:503,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; script-src 'nonce-"+nonce+"'; worker-src 'self'; connect-src 'self'; base-uri 'none'"}});
}
async function assetResponse(entry,event){
  let cache;
  try{cache=await caches.open(CACHE_NAME);const response=await cache.match(entry.url);if(await valid(response,entry))return response;if(response)await cache.delete(entry.url);}catch{}
  degraded=true;
  // Never use another generation's cached HTML or unverified network response.
  // Worker clients run conversion protocols: notify windows only, never inject
  // an unrelated message into the JSON/document worker's request handler.
  try{for(const client of await self.clients.matchAll({type:'window'}))client.postMessage({type:'LDP_CACHE_DEGRADED'});}catch{}
  try{
    const response=await verifiedNetwork(entry);
    if(cache)await cache.put(entry.url,response.clone()).catch(()=>{});
    return response;
  }catch{return unavailable(event.request.mode==='navigate');}
}
self.addEventListener('install',event=>event.waitUntil(fill()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  // Native waiting preserves all old controlled windows. Never force takeover.
  try{for(const name of await caches.keys()){
    // A later update may already be installing/waiting; never delete its cache.
    if(self.registration?.installing||self.registration?.waiting)return;
    if(name.startsWith('ldp-static-')&&name!==CACHE_NAME)await caches.delete(name);
  }}catch{}
})()));
self.addEventListener('fetch',event=>{
  const request=event.request;if(request.method!=='GET')return;
  const url=new URL(request.url);if(url.origin!==origin)return;
  const path=appPath(url),navigation=request.mode==='navigate';
  if(navigation&&(path==='/index.html')){event.respondWith(assetResponse(entries.get('/index.html'),event));return;}
  if(isStaticAsset(url)){event.respondWith(assetResponse(entries.get(pathOf(url)),event));return;}
  if(url.pathname.startsWith('/assets/')||navigation)event.respondWith(unavailable(navigation));
});
self.addEventListener('message',event=>{
  if(!event.ports?.[0]||!['LDP_STATUS','LDP_REPAIR'].includes(event.data?.type))return;
  event.waitUntil((async()=>{
    let failed=false;
    if(event.data.type==='LDP_REPAIR')try{await fill();}catch{failed=true;degraded=true;}
    event.ports[0].postMessage({...await status(),failed});
  })());
});
