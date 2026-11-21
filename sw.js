/* NUFHAS Alumni — service worker: lets the site install like an app and open the page shell offline.
   Only this site's own files are cached. Member data comes from Supabase (another domain) and is never cached here. */
const CACHE = "nufhas-v3c";
const SHELL = ["./", "index.html", "assets/style.css", "assets/app.js", "assets/community.js", "assets/career.js", "assets/admin.js", "assets/smart.js", "assets/data.js", "assets/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()).catch(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network first (so updates show immediately); fall back to the cached copy when offline.
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match("index.html")))
  );
});
