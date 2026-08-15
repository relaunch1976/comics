// オフラインでも一覧を開けるようにするための Service Worker。
//
// ビルド成果物のファイル名にはハッシュが付くので、プリキャッシュの一覧を
// 生成する仕組み（=ビルドプラグインの依存）は入れず、実行時キャッシュで済ませる。
//
//   ハッシュ付きアセット : キャッシュ優先（内容が変わればファイル名も変わる）
//   ナビゲーション       : ネットワーク優先（新しいindex.htmlを取り逃さない）
//   同一オリジン以外     : 何もしない（楽天APIと表紙画像はそのまま通す）

const CACHE = "comics-v1";

self.addEventListener("install", () => {
  // 新しいSWを待たせない
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    void cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      void cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw e;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // 楽天API（openapi.rakuten.co.jp）と表紙画像は触らない。
  // 検索結果をキャッシュすると新刊の検出が遅れる。
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(cacheFirst(request));
  }
});
