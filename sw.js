const V="quotaquest-v5";
const ASSETS=["./","index.html","callsheet.html","alloc.js","manifest.webmanifest",
  "icon-192.png","icon-512.png","icon-maskable-512.png"];
self.addEventListener("install",e=>{
  e.waitUntil(caches.open(V).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",e=>{
  e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x))))
    .then(()=>self.clients.claim()));
});
// network-first, cache fallback: fresh on wifi, works courtside with no signal
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET") return;
  e.respondWith(
    fetch(e.request).then(r=>{
      const cp=r.clone(); caches.open(V).then(c=>c.put(e.request,cp)); return r;
    }).catch(()=>caches.match(e.request).then(r=>r||caches.match("callsheet.html")))
  );
});
