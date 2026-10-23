// Separate prototype. Eager static graph acquisition includes Worker entry assets,
// whose fetches are not uniformly intercepted by a document's Service Worker.
const CACHE='json-g04-alternative-static-v1';
const allowed=url=>url.origin===self.location.origin&&!url.search&&(['/', '/index.html','/gate-assets.json'].includes(url.pathname)||/^\/assets\/[^/]+\.(js|css)$/.test(url.pathname));
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const response=await fetch('/gate-assets.json',{cache:'no-store'});if(!response.ok)throw new Error('static-manifest');
  const entries=await response.json();if(!Array.isArray(entries)||entries.some(path=>typeof path!=='string'||!allowed(new URL(path,self.location.origin))))throw new Error('static-path');
  const cache=await caches.open(CACHE);await cache.addAll(['/', '/index.html', '/gate-assets.json',...entries]);await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||!allowed(new URL(event.request.url)))return;
  event.respondWith((async()=>{const cache=await caches.open(CACHE);return await cache.match(event.request)||fetch(event.request);})());
});
