/* ============================================================
   sw.js — Service Worker (offline kesh)
   Ilova "qobig'i" (HTML/CSS/JS/ikonka) keshlanadi — internet
   bo'lmasa ham ochiladi. Google Sheets so'rovlari keshlanmaydi
   (ular har doim tarmoqqa boradi, offline bo'lsa navbatga tushadi).
   ============================================================ */

const CACHE = 'kassa-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './css/style.css',
  './js/storage.js',
  './js/sheets.js',
  './js/kassa.js',
  './js/inventar.js',
  './js/mijozlar.js',
  './js/xodimlar.js',
  './js/hisobotlar.js',
  './js/admin.js',
  './js/app.js',
  './js/vendor/chart.umd.min.js',
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

// So'rovlar — faqat shu domendagi GET'larni keshdan beramiz (cache-first).
// Tashqi so'rovlar (Google Sheets / Apps Script) to'g'ridan-to'g'ri tarmoqqa ketadi.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // tashqi — aralashmaymiz

  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        // muvaffaqiyatli javobni keshga qo'shamiz (keyingi marta offline ishlasin)
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html')); // offline fallback
    })
  );
});
