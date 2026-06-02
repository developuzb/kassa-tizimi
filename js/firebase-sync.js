/* ============================================================
   firebase-sync.js — Qurilmalararo real-time sinxron (Realtime Database)
   ------------------------------------------------------------
   MODEL:
     • localStorage = tezkor lokal kesh — UI shundan o'qiydi.
     • Firebase Realtime Database = umumiy markaziy baza (barcha qurilmalar).
   OQIM:
     • Lokal o'zgarish (Storage.write) -> RTDB'ga push (faqat o'zgargan yozuvlar).
     • RTDB onValue -> localStorage (Storage.applyCloud) -> UI yangilanadi.
   OFFLINE:
     • RTDB internet yo'qda yozuvlarni navbatga oladi, ulanganda yuboradi.
       localStorage esa har doim ishlaydi.
   Loop oldini olish: cloud'dan kelgan yozuv applyCloud orqali yoziladi —
   qayta RTDB'ga push QILINMAYDI.

   NOTE: Realtime Database tanlandi (Firestore billing/karta talab qildi —
   O'zbekiston kartalari Google billing'ni o'tmadi). RTDB Spark'da bepul.
   ============================================================ */

window.FBSync = (() => {
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.5';

  // localStorage kaliti  ->  RTDB tugun nomi
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
  const rt = {};                  // RTDB funksiyalari (modular SDK)
  const cache = {};               // node -> Map(id -> stable(JSON))  joriy cloud holati
  let refreshTimer = null;

  function key2node(key) { return MAP[key] || null; }

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

  // ---- Lokal o'zgarishni RTDB'ga push (storage.write hook chaqiradi) ----
  function onLocalWrite(key, value) {
    const node = key2node(key);
    if (!node || !ready) return;
    const prev = cache[node] || new Map();
    const nextIds = new Set();
    const updates = {};             // ko'p yo'lli yangilash: { id: obj | null }
    let ops = 0;

    for (const it of (value || [])) {
      if (!it || it.id == null) continue;
      const id = String(it.id);
      nextIds.add(id);
      if (prev.get(id) !== stable(it)) { updates[id] = it; ops++; }
    }
    for (const id of prev.keys()) {
      if (!nextIds.has(id)) { updates[id] = null; ops++; }  // o'chirish
    }
    if (!ops) return;

    // optimistik kesh (onValue keyin tasdiqlaydi)
    const m = new Map();
    for (const it of (value || [])) if (it && it.id != null) m.set(String(it.id), stable(it));
    cache[node] = m;

    rt.update(rt.ref(db, node), updates)
      .catch(e => console.warn('RTDB push xatosi (' + node + '):', e));
  }

  // ---- onValue snapshot -> localStorage ----
  function applySnapshot(node, key, val) {
    const obj = val || {};
    const arr = [];
    const m = new Map();
    Object.keys(obj).forEach(id => {
      const data = obj[id];
      if (data && typeof data === 'object') {
        if (data.id == null) data.id = id;
        arr.push(data);
        m.set(String(id), stable(data));
      }
    });
    cache[node] = m;
    Storage.applyCloud(key, arr);   // qayta push QILMAYDI
    scheduleRefresh();
  }

  // ---- Ishga tushirish (App.init oxirida, seed/migrate tugagach) ----
  async function start() {
    if (started) return;
    started = true;
    const cfg = window.FIREBASE_CONFIG;
    if (!cfg || !cfg.databaseURL) {
      console.warn('FIREBASE_CONFIG.databaseURL yo\'q — RTDB sinxron o\'chiq.');
      return;
    }

    try {
      const appMod = await import(`${SDK}/firebase-app.js`);
      const dbMod  = await import(`${SDK}/firebase-database.js`);
      Object.assign(rt, dbMod);
      const app = appMod.initializeApp(cfg);
      db = dbMod.getDatabase(app);

      for (const [key, node] of Object.entries(MAP)) {
        // 1) Dastlabki holat: cloud BO'SH va lokalda ma'lumot BOR bo'lsa -> yuklaymiz
        const snap0 = await rt.get(rt.ref(db, node));
        const localArr = JSON.parse(localStorage.getItem(key) || '[]');

        if (!snap0.exists() && Array.isArray(localArr) && localArr.length) {
          const seed = {};
          localArr.forEach(it => { if (it && it.id != null) seed[String(it.id)] = it; });
          await rt.update(rt.ref(db, node), seed)
            .catch(e => console.warn('Dastlabki yuklash xatosi (' + node + '):', e));
          const m = new Map();
          localArr.forEach(it => { if (it && it.id != null) m.set(String(it.id), stable(it)); });
          cache[node] = m;
        } else {
          const val = snap0.val() || {};
          const m = new Map();
          Object.keys(val).forEach(id => m.set(String(id), stable(val[id])));
          cache[node] = m;
        }

        // 2) Real-time tinglovchi
        rt.onValue(
          rt.ref(db, node),
          (snap) => applySnapshot(node, key, snap.val()),
          (err) => console.warn('onValue xatosi (' + node + '):', err)
        );
      }

      ready = true;
      App.refresh();
      console.log('🔥 Realtime Database sinxron faol.');
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
