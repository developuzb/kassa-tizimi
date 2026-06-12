/* ============================================================
   firebase-sync.js — Qurilmalararo real-time sinxron (Realtime Database)
   ------------------------------------------------------------
   MODEL:
     • localStorage = tezkor lokal kesh — UI shundan o'qiydi.
     • Firebase Realtime Database = umumiy markaziy baza (barcha qurilmalar).
   IKKI XIL TUGUN:
     • 'col'  — id bo'yicha kolleksiya (services, sales, employees, customers,
                branches, shifts). Har yozuv alohida bola sifatida saqlanadi.
     • 'one'  — bitta qiymat (activeShift, counter). Butun qiymat bir tugunда.
   OQIM:
     • Lokal o'zgarish (Storage.write) -> RTDB'ga push.
     • RTDB onValue -> localStorage (Storage.applyCloud) -> UI yangilanadi.
   OFFLINE: RTDB navbatga oladi, ulanganda yuboradi; localStorage doim ishlaydi.
   Loop oldini olish: cloud'dan kelgan yozuv applyCloud orqali yoziladi —
   qayta push QILINMAYDI.
   ============================================================ */

window.FBSync = (() => {
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.5';

  // localStorage kaliti -> { RTDB tugun nomi, tur }
  const NODES = {
    [Storage.K.services]:    { node: 'services',    type: 'col' },
    [Storage.K.sales]:       { node: 'sales',       type: 'col' },
    [Storage.K.employees]:   { node: 'employees',   type: 'col' },
    [Storage.K.customers]:   { node: 'customers',   type: 'col' },
    [Storage.K.branches]:    { node: 'branches',    type: 'col' },
    [Storage.K.shifts]:      { node: 'shifts',      type: 'col' },
    [Storage.K.activeShift]: { node: 'activeShift', type: 'one' },
    [Storage.K.counter]:     { node: 'counter',     type: 'one' },
    // 'settings' — biznes sozlamalari (KPI/QQS/sadoqat/...). Maxsus tur:
    // qurilmaga xos kalitlar (filial, parol, Sheets) sinxronlanmaydi.
    [Storage.K.settings]:    { node: 'settings',    type: 'settings' },
  };

  let db = null;
  let started = false;
  let ready = false;
  const rt = {};                  // RTDB funksiyalari (modular SDK)
  const cache = {};               // node -> Map(id->stable)  ('col')  yoki  stable string  ('one')
  let refreshTimer = null;

  // Kalit tartibiga bog'liq bo'lmagan barqaror seriyalash (taqqoslash uchun)
  function stable(o) {
    if (o === undefined) o = null;
    if (Array.isArray(o)) return '[' + o.map(stable).join(',') + ']';
    if (o && typeof o === 'object') {
      return '{' + Object.keys(o).sort()
        .map(k => JSON.stringify(k) + ':' + stable(o[k])).join(',') + '}';
    }
    return JSON.stringify(o);
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { try { App.refresh(); } catch (_) {} }, 250);
  }

  /* ---------------- Lokal -> Cloud (storage.write hook) ---------------- */
  function onLocalWrite(key, value) {
    const inf = NODES[key];
    if (!inf || !ready) return;
    if (inf.type === 'col') pushCollection(inf.node, value);
    // Sozlamalarda faqat biznes (sinxronlanadigan) qismini yuboramiz
    else if (inf.type === 'settings') pushSingle(inf.node, Storage.getSyncableSettings());
    else pushSingle(inf.node, value);
  }

  function pushCollection(node, value) {
    const prev = cache[node] instanceof Map ? cache[node] : new Map();
    const nextIds = new Set();
    const updates = {};
    let ops = 0;
    for (const it of (value || [])) {
      if (!it || it.id == null) continue;
      const id = String(it.id);
      nextIds.add(id);
      if (prev.get(id) !== stable(it)) { updates[id] = it; ops++; }
    }
    for (const id of prev.keys()) {
      if (!nextIds.has(id)) { updates[id] = null; ops++; }   // o'chirish
    }
    if (!ops) return;
    const m = new Map();
    for (const it of (value || [])) if (it && it.id != null) m.set(String(it.id), stable(it));
    cache[node] = m;
    rt.update(rt.ref(db, node), updates).catch(e => console.warn('RTDB push (' + node + '):', e));
  }

  function pushSingle(node, value) {
    const v = value === undefined ? null : value;
    const s = stable(v);
    if (cache[node] === s) return;
    cache[node] = s;
    rt.set(rt.ref(db, node), v).catch(e => console.warn('RTDB push (' + node + '):', e));
  }

  /* ---------------- Cloud -> Lokal (onValue) ---------------- */
  function applyCol(node, key, val) {
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
    Storage.applyCloud(key, arr);
    scheduleRefresh();
  }

  function applyOne(node, key, val) {
    const v = val === undefined ? null : val;
    cache[node] = stable(v);
    Storage.applyCloud(key, v);
    scheduleRefresh();
  }

  // Sozlamalar: bulutdan kelgan biznes sozlamalarini lokalga MERGE qilamiz
  // (qurilmaga xos kalitlar — filial/parol/Sheets — saqlanib qoladi).
  function applySettings(node, val) {
    cache[node] = stable(val === undefined ? null : val);
    Storage.applyCloudSettings(val || {});
    scheduleRefresh();
  }

  /* ---------------- Ishga tushirish ---------------- */
  async function start() {
    if (started) return;
    started = true;
    const cfg = window.FIREBASE_CONFIG;
    if (!cfg || !cfg.databaseURL) { console.warn('databaseURL yo\'q — RTDB o\'chiq.'); return; }

    try {
      const appMod = await import(`${SDK}/firebase-app.js`);
      const dbMod  = await import(`${SDK}/firebase-database.js`);
      Object.assign(rt, dbMod);
      const app = appMod.initializeApp(cfg);

      // Anonim autentifikatsiya: RTDB qoidalari "auth != null" talab qilganda
      // kerak bo'ladi (database.rules.json ga qarang). Konsolda Anonymous
      // provayderi yoqilmagan bo'lsa xato beradi — ogohlantiramiz, lekin
      // ilovani to'xtatmaymiz (eski ochiq qoidalar bilan ham ishlayveradi).
      try {
        const authMod = await import(`${SDK}/firebase-auth.js`);
        await authMod.signInAnonymously(authMod.getAuth(app));
      } catch (authErr) {
        console.warn('Anonim auth ishlamadi (Firebase Console > Authentication > '
          + 'Sign-in method > Anonymous yoqilganini tekshiring):', authErr);
      }

      db = dbMod.getDatabase(app);

      for (const [key, inf] of Object.entries(NODES)) {
        const snap0 = await rt.get(rt.ref(db, inf.node));

        if (inf.type === 'col') {
          const localArr = JSON.parse(localStorage.getItem(key) || '[]');
          if (!snap0.exists() && Array.isArray(localArr) && localArr.length) {
            const seed = {};
            localArr.forEach(it => { if (it && it.id != null) seed[String(it.id)] = it; });
            await rt.update(rt.ref(db, inf.node), seed).catch(e => console.warn('seed ' + inf.node, e));
            const m = new Map();
            localArr.forEach(it => { if (it && it.id != null) m.set(String(it.id), stable(it)); });
            cache[inf.node] = m;
          } else {
            const val = snap0.val() || {};
            const m = new Map();
            Object.keys(val).forEach(id => m.set(String(id), stable(val[id])));
            cache[inf.node] = m;
          }
          rt.onValue(rt.ref(db, inf.node),
            (snap) => applyCol(inf.node, key, snap.val()),
            (err) => console.warn('onValue ' + inf.node, err));
        } else if (inf.type === 'settings') {
          // Biznes sozlamalari — qurilmaga xos kalitlarsiz sinxron
          const syncable = Storage.getSyncableSettings();
          if (!snap0.exists()) {
            // Bulutda yo'q — shu qurilmaning biznes sozlamalari bilan urug'lantiramiz
            await rt.set(rt.ref(db, inf.node), syncable).catch(e => console.warn('seed settings', e));
            cache[inf.node] = stable(syncable);
          } else {
            // Bulutda bor — shu qurilmaga qo'llaymiz (KPI/QQS/sadoqat/...)
            Storage.applyCloudSettings(snap0.val());
            cache[inf.node] = stable(snap0.val());
          }
          rt.onValue(rt.ref(db, inf.node),
            (snap) => applySettings(inf.node, snap.val()),
            (err) => console.warn('onValue settings', err));
        } else {
          // 'one' — bitta qiymat
          const local = JSON.parse(localStorage.getItem(key) || 'null');
          const localEmpty = local == null || (Array.isArray(local) && !local.length);
          if (!snap0.exists() && !localEmpty) {
            await rt.set(rt.ref(db, inf.node), local).catch(e => console.warn('seed ' + inf.node, e));
            cache[inf.node] = stable(local);
          } else {
            cache[inf.node] = stable(snap0.exists() ? snap0.val() : null);
          }
          rt.onValue(rt.ref(db, inf.node),
            (snap) => applyOne(inf.node, key, snap.val()),
            (err) => console.warn('onValue ' + inf.node, err));
        }
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
