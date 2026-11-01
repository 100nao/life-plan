/* ライフプラン Service Worker — アプリ本体をキャッシュしてオフラインで動かす。
   ユーザーデータ・APIキー・AIとの会話は localStorage にのみ保存され、ここでは一切扱わない。
   アプリを更新したら CACHE_VERSION を上げること。 */
const CACHE_VERSION = 'lifeplan-v1.3.0';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/favicon-32.png',
  './images/avatar-128.png',
  './images/avatar-256.png',
  './images/bg-mist.jpg',
  './images/bg-sunrise.jpg',
  './images/bg-forest.jpg',
  './images/bg-ocean.jpg',
  './images/bg-mist-thumb.jpg',
  './images/bg-sunrise-thumb.jpg',
  './images/bg-forest-thumb.jpg',
  './images/bg-ocean-thumb.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

// HTML / JS / CSS はネットワーク優先（更新がすぐ反映される）。オフライン時だけキャッシュを使う。
// 画像などはキャッシュ優先。
self.addEventListener('fetch', (event) => {
  const req = event.request;
  // POST（Gemini API など）と外部ドメインは一切キャッシュせず、そのままネットワークへ。
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isNav = req.mode === 'navigate';
  const isCode = isNav || /\.(js|css|webmanifest)$/.test(url.pathname) || url.pathname.endsWith('/');
  const cacheKey = isNav ? './index.html' : req;

  if (isCode) {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE_VERSION).then((c) => c.put(cacheKey, copy)); }
        return res;
      }).catch(() => caches.match(cacheKey, { ignoreSearch: true }))
    );
    return;
  }

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => cached || fetch(req).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE_VERSION).then((c) => c.put(req, copy)); }
      return res;
    }))
  );
});
