const CACHE = "loinhac-v1";
const FILES = ["./", "./index.html", "./css/styles.css", "./js/nlp.js", "./js/store.js", "./js/theme.js", "./js/app.js", "./manifest.json", "./icons/icon.svg"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
    if (res.ok && new URL(e.request.url).origin === location.origin) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
    return res;
  }).catch(() => r)));
});
