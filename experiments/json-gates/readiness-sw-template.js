// Build substitutes the static generation and exact URL allowlist.
const CACHE='json-readiness-__GENERATION__';
const PREFIX='json-readiness-';
const ASSETS=__ASSETS__;
const allowed=request=>{
  const url=new URL(request.url);
  return request.method==='GET'&&url.origin===self.location.origin&&!url.search&&ASSETS.includes(url.pathname);
};
self.addEventListener('install',event=>event.waitUntil((async()=>{
  try{
    const cache=await caches.open(CACHE);
    await cache.addAll(ASSETS);
    // Do not skipWaiting: existing tabs must finish with their own asset generation.
  }catch(error){
    await caches.delete(CACHE).catch(()=>{});
    throw error;
  }
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const name of await caches.keys())if(name.startsWith(PREFIX)&&name!==CACHE)await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  if(!allowed(event.request))return;
  event.respondWith((async()=>{
    // A denied Cache API must not disable the online static path.
    try{const hit=await (await caches.open(CACHE)).match(event.request);if(hit)return hit;}catch{}
    return fetch(event.request);
  })());
});
