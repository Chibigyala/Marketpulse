/* Market Pulse — Service Worker
   オフライン表示（アプリの外枠をキャッシュ）と、Android向け定期同期。 */
const CACHE = "mp-v2";
const SHELL = ["./", "./index.html", "./app.js", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // データ（プロキシ/Yahoo/RSS）はネットワーク優先、アプリ外枠はキャッシュ優先
  const isData = url.searchParams.has("type") || url.hostname.includes("workers.dev");
  if (isData) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
  } else {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
  }
});

// Android Chrome のみ：登録されていれば最大15分間隔で起動（iOS Safari は非対応）
self.addEventListener("periodicsync", (e) => {
  if (e.tag === "refresh-15m") {
    e.waitUntil(
      self.clients.matchAll().then((cs) => cs.forEach((c) => c.postMessage({ type: "refresh" })))
    );
  }
});
