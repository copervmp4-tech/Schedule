/* Greece 2026 offline service worker */
const CACHE = "greece-2026-v4";
const PRECACHE = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png"];

// 行程改版後要讓已安裝的 App 立刻拿到新版：改這裡的 CACHE 版號，install 會重抓一份
// （{cache: "reload"} 繞過 HTTP 快取），activate 再把舊版整包刪掉。
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE.map(url => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// 同源請求：先回快取（離線可用），背景更新快取（下次開啟拿到新版）。
// 跨域（Google Maps、Open-Meteo）不攔截，交給網路。
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(cached => {
      const refresh = fetch(event.request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || refresh;
    })
  );
});
