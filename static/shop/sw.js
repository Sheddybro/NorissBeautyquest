/* Only public shell and same-origin static assets are cached. Private HTML/API
   responses and CSRF tokens are never put in Cache Storage. */
const CACHE='noriss-shell-v8';
const ASSETS=['/offline-shell/','/manifest.webmanifest','/static/shop/app.css','/static/shop/app.js','/static/shop/core.js','/static/shop/enhancements.js','/static/shop/storage.js','/static/shop/images/beauty-hero.webp','/static/shop/icons/icon-192.png','/static/shop/icons/icon-512.png','/static/shop/icons/maskable-512.png','/static/shop/icons/apple-touch-icon.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
// No forced skipWaiting: an existing checkout keeps its version until next launch.
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('noriss-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(url.origin!==self.location.origin||request.method!=='GET')return;
 if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/accounts/')||url.pathname.startsWith('/admin/'))return;
 if(request.mode==='navigate'&&url.pathname==='/'){
  event.respondWith((async()=>{try{return await fetch(request,{signal:AbortSignal.timeout(5000)})}catch{const cache=await caches.open(CACHE);return await cache.match('/offline-shell/')||new Response('Connect once online to prepare Noriss Beautyquest for offline use.',{status:503,headers:{'Content-Type':'text/plain'}})}})());return;
 }
 if(ASSETS.some(p=>p===url.pathname))event.respondWith(caches.open(CACHE).then(async cache=>await cache.match(url.pathname)||fetch(request).then(response=>{if(response.ok)cache.put(url.pathname,response.clone());return response})));
});
