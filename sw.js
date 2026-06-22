/* Market Pulse — Service Worker v3
   方針：アプリ本体(HTML/JS)は「ネットワーク優先」。
   → コードを直せば常に最新が反映され、古いapp.jsが残る問題が起きない。
   オフライン時のみキャッシュを表示する。 */
const CACHE = "mp-v3";
const SHELL = ["./", "./index.html", "./app.js", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// すべてのGETをネットワーク優先。成功したら同一オリジンのみキャッシュ更新。失敗時のみキャッシュ。
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        try {
          if (new URL(req.url).origin === self.location.origin && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
        } catch (_) {}
        return res;
      })
      .catch(() => caches.match(req))
  );
});

// Android Chrome のみ：定期同期（iOS Safari は非対応）
self.addEventListener("periodicsync", (e) => {
  if (e.tag === "refresh-15m") {
    e.waitUntil(
      self.clients.matchAll().then((cs) => cs.forEach((c) => c.postMessage({ type: "refresh" })))
    );
  }
});