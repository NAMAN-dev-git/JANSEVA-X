const SHELL_CACHE = "janseva-x-static-shell-v1";
const SHELL_ASSETS = ["/", "/index.html", "/manifest.webmanifest", "/icons/janseva-x.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(names.filter((name) => name !== SHELL_CACHE).map((name) => caches.delete(name)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Never Cache Storage-cache APIs, bearer-authenticated traffic, or data.
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || request.headers.has("Authorization")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/index.html")));
    return;
  }
  const staticAsset = url.pathname.startsWith("/assets/") || request.destination === "style" || request.destination === "script" || request.destination === "image" || request.destination === "font";
  if (!staticAsset) return;
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (!response.ok || response.type !== "basic") return response;
    const copy = response.clone();
    void caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
    return response;
  })));
});
