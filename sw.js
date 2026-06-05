/* ============================================================
   sw.js — Service Worker (offline kesh)
   Ilova "qobig'i" (HTML/CSS/JS/ikonka) keshlanadi — internet
   bo'lmasa ham ochiladi. Google Sheets so'rovlari keshlanmaydi
   (ular har doim tarmoqqa boradi, offline bo'lsa navbatga tushadi).
   ============================================================ */

const CACHE = 'kassa-v5';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './css/style.css',
  './js/utils.js',
  './js/storage.js',
  './js/sheets.js',
  './js/kassa.js',
  './js/inventar.js',
  './js/yorliq.js',
  './js/mijozlar.js',
  './js/xodimlar.js',
  './js/hisobotlar.js',
  './js/admin.js',
  './js/app.js',
  './js/firebase-config.js',
  './js/firebase-sync.js',
  './js/vendor/chart.umd.min.js',
  './js/vendor/jsbarcode.min.js',
];

// O'rnatish — qobiqni keshlash
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

// Faollashtirish — eski keshlarni tozalash
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// So'rovlar — shu domendagi GET'lar uchun "network-first":
// online bo'lsa HAR DOIM eng yangi kodni tarmoqdan olamiz (va keshni yangilaymiz),
// offline bo'lsa keshdan beramiz. Shu sabab kod yangilanishi barcha qurilmaga
// darrov yetadi (eski kesh muammosi yo'q).
// Tashqi so'rovlar (Firebase SDK, Realtime Database, Sheets) aralashmaymiz.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // tashqi — to'g'ridan-to'g'ri tarmoqqa

  e.respondWith(
    fetch(req).then(res => {
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req).then(c => c || caches.match('./index.html')))
  );
});
