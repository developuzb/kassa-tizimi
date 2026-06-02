/* ============================================================
   firebase-sync.js — Qurilmalararo real-time sinxron (Firestore)
   ------------------------------------------------------------
   MODEL:
     • localStorage = tezkor lokal kesh — UI shundan o'qiydi.
     • Firestore    = umumiy markaziy baza (barcha qurilmalar uchun).
   OQIM:
     • Lokal o'zgarish (Storage.write) -> Firestore'ga push (delta).
     • Firestore onSnapshot -> localStorage (Storage.applyCloud) -> UI yangilanadi.
   OFFLINE:
     • Firestore IndexedDB keshi + localStorage. Internet yo'qda ham ishlaydi,
       ulanish tiklanganda avtomatik sinxronlanadi.
   Loop oldini olish: cloud'dan kelgan yozuv applyCloud orqali yoziladi —
   u qayta Firebase'ga push qilinmaydi.
   ============================================================ */

window.FBSync = (() => {
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.5';

  // localStorage kaliti  ->  Firestore kolleksiyasi
  const MAP = {
    [Storage.K.services]:  'services',
    [Storage.K.sales]:     'sales',
    [Storage.K.employees]: 'employees',
    [Storage.K.customers]: 'customers',
    [Storage.K.branches]:  'branches',
    [Storage.K.shifts]:    'shifts',
  };

  let db = null;
  let started = false;
  let ready = false;
  const fs = {};                  // Firestore funksiyalari (modular SDK)
  const cache = {};               // col -> Map(id -> stable(JSON))  joriy cloud holati
  let refreshTimer = null;

  function key2col(key) { return MAP[key] || null; }

  // Kalit tartibiga bog'liq bo'lmagan barqaror seriyalash (taqqoslash uchun)
  function stable(o) {
    if (Array.isArray(o)) return '[' + o.map(stable).join(',') + ']';
    if (o && typeof o === 'object') {
      return '{' + Object.keys(o).sort()
        .map(k => JSON.stringify(k) + ':' + stable(o[k])).join(',') + '}';
    }
    return JSON.stringify(o);
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { try { App.refresh(); } catch (_) {} }, 300);
  }

  // ---- Lokal o'zgarishni Firestore'ga push (storage.write hook chaqiradi) ----
  async function onLocalWrite(key, value) {
    const col = key2col(key);
    if (!col || !ready) return;
    const prev = cache[col] || new Map();
    const nextIds = new Set();
    const batch = fs.writeBatch(db);
    let ops = 0;

    for (const it of (value || [])) {
      if (!it || it.id == null) continue;
      const id = String(it.id);
      nextIds.add(id);
      if (prev.get(id) !== stable(it)) { batch.set(fs.doc(db, col, id), it); ops++; }
    }
    for (const id of prev.keys()) {
      if (!nextIds.has(id)) { batch.delete(fs.doc(db, col, id)); ops++; }
    }
    if (!ops) return;

    // optimistik kesh (snapshot keyin tasdiqlaydi)
    const m = new Map();
    for (const it of (value || [])) if (it && it.id != null) m.set(String(it.id), stable(it));
    cache[col] = m;

    try { await batch.commit(); }
    catch (e) { console.warn('Firestore push xatosi (' + col + '):', e); }
  }

  // ---- Snapshot -> localStorage ----
  function applySnapshot(col, key, snap) {
    const arr = [];
    const m = new Map();
    snap.forEach(d => { const data = d.data(); arr.push(data); m.set(d.id, stable(data)); });
    cache[col] = m;
    Storage.applyCloud(key, arr);   // qayta push QILMAYDI
    scheduleRefresh();
  }

  // ---- Ishga tushirish (App.init oxirida, seed/migrate tugagach chaqiriladi) ----
  async function start() {
    if (started) return;
    started = true;
    if (!window.FIREBASE_CONFIG) { console.warn('FIREBASE_CONFIG yo\'q — Firebase o\'chiq.'); return; }

    try {
      const appMod = await import(`${SDK}/firebase-app.js`);
      const fsMod = await import(`${SDK}/firebase-firestore.js`);
      Object.assign(fs, fsMod);
      const app = appMod.initializeApp(window.FIREBASE_CONFIG);

      // Offline kesh bilan (bir nechta tab uchun ham)
      try {
        db = fs.initializeFirestore(app, {
          localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
        });
      } catch (_) {
        db = fs.getFirestore(app); // persistence ishlamasa — oddiy rejim
      }

      for (const [key, col] of Object.entries(MAP)) {
        // 1) Dastlabki holat: cloud BO'SH va lokalda ma'lumot BOR bo'lsa -> yuklaymiz
        const snap0 = await fs.getDocs(fs.collection(db, col));
        const localArr = JSON.parse(localStorage.getItem(key) || '[]');

        if (snap0.empty && Array.isArray(localArr) && localArr.length) {
          const batch = fs.writeBatch(db);
          localArr.forEach(it => { if (it && it.id != null) batch.set(fs.doc(db, col, String(it.id)), it); });
          await batch.commit().catch(e => console.warn('Dastlabki yuklash xatosi (' + col + '):', e));
          const m = new Map();
          localArr.forEach(it => { if (it && it.id != null) m.set(String(it.id), stable(it)); });
          cache[col] = m;
        } else {
          const m = new Map();
          snap0.forEach(d => m.set(d.id, stable(d.data())));
          cache[col] = m;
        }

        // 2) Real-time tinglovchi
        fs.onSnapshot(
          fs.collection(db, col),
          (snap) => applySnapshot(col, key, snap),
          (err) => console.warn('onSnapshot xatosi (' + col + '):', err)
        );
      }

      ready = true;
      App.refresh();
      console.log('🔥 Firebase sinxron faol.');
      if (typeof Toast !== 'undefined') Toast.show('Bulutga ulandi — qurilmalar sinxron ✓', 'success');
    } catch (e) {
      console.warn('Firebase init xatosi (ilova lokal rejimda ishlaydi):', e);
    }
  }

  return {
    start,
    onLocalWrite,
    get ready() { return ready; },
  };
})();
