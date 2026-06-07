/* ============================================================
   sw.js — Service Worker (offline kesh)
   Ilova "qobig'i" (HTML/CSS/JS/ikonka) keshlanadi — internet
   bo'lmasa ham ochiladi. Google Sheets so'rovlari keshlanmaydi
   (ular har doim tarmoqqa boradi, offline bo'lsa navbatga tushadi).
   ============================================================ */

const CACHE = 'kassa-v16';
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
  './js/vendor/xlsx.full.min.js',
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

// So'rovlar — shu domendagi GET'lar uchun "network-first + 1.2s timeout":
// • tarmoq tez javob bersa — eng yangi kod (va kesh yangilanadi) -> stale kod yo'q
// • tarmoq sekin bo'lsa (1.2s) yoki offline — keshdan DARROV beramiz (tez yuklanish),
//   tarmoq javobi kelganda kesh fon rejimida yangilanadi
// Tashqi so'rovlar (Firebase SDK, Realtime Database, Sheets) aralashmaymiz.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // tashqi — to'g'ridan-to'g'ri tarmoqqa

  e.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then(res => {
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));   // keshni yangilaymiz
      }
      return res;
    });
    if (!cached) {
      // kesh yo'q (birinchi yuklash) — tarmoqni kutamiz
      try { return await network; } catch (_) { return caches.match('./index.html'); }
    }
    // kesh bor — tarmoqni 1.2s kutamiz, ulgurmasa keshdan beramiz
    const timeout = new Promise(r => setTimeout(() => r(null), 1200));
    const winner = await Promise.race([network.catch(() => null), timeout]);
    return winner || cached;
  })());
});
