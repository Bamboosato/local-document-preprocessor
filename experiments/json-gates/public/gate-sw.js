// Prototype-only origin/port. Cache static application resources, never inputs,
// results, settings, request bodies or query-string URLs.
const CACHE='json-gate-static-v1';
const allowed=url=>url.origin===self.location.origin&&!url.search&&(url.pathname==='/'||url.pathname==='/index.html'||url.pathname==='/frame.html'||/^\/assets\/[^/]+$/.test(url.pathname));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/','/index.html','/frame.html'])).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||!allowed(new URL(event.request.url)))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE),old=await cache.match(event.request);
    if(old)return old;
    const response=await fetch(event.request);
    if(response.ok)await cache.put(event.request,response.clone());
    return response;
  })());
});
