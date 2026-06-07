/* ============================================================
   storage.js — LocalStorage asosida offline ma'lumotlar bazasi
   Barcha modullar ma'lumotni shu yerdan o'qiydi/yozadi.
   Internet bo'lmasa ham tizim to'liq ishlaydi.
   ============================================================ */

const Storage = (() => {
  const PREFIX = 'kassa_';
  const K = {
    services:    PREFIX + 'services',     // mahsulotlar bazasi (katalog)
    sales:       PREFIX + 'sales',        // sotuvlar (cheklar)
    employees:   PREFIX + 'employees',    // xodimlar
    customers:   PREFIX + 'customers',    // mijozlar (CRM)
    branches:    PREFIX + 'branches',     // filiallar
    shifts:      PREFIX + 'shifts',       // yopilgan smenalar tarixi
    activeShift: PREFIX + 'activeShift',  // hozir ochiq smena
    settings:    PREFIX + 'settings',     // sozlamalar (parol, Sheets, faol filial)
    queue:       PREFIX + 'queue',        // (eski) Sheets navbati — endi ishlatilmaydi
    dirty:       PREFIX + 'dirty',        // Sheets bilan sinxronlash kerakligi bayrog'i
    counter:     PREFIX + 'receiptNo',    // chek raqami hisoblagichi
  };

  // Firestore'dan kelgan ma'lumotni yozayotganda true bo'ladi
  // (qayta Firebase'ga push qilinmasin — loop oldini olish).
  let _applyingCloud = false;

  /* --- past darajadagi o'qish/yozish (xatolikka chidamli) --- */
  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.error('Storage o\'qish xatosi:', key, e);
      return fallback;
    }
  }
  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      // Firebase'ga ko'zgu: bu o'zgarish lokal bo'lsa (cloud'dan kelmagan) push qilamiz
      if (!_applyingCloud && typeof window !== 'undefined' && window.FBSync) {
        try { window.FBSync.onLocalWrite(key, value); }
        catch (err) { console.warn('FBSync push xatosi:', err); }
      }
      return true;
    } catch (e) {
      console.error('Storage yozish xatosi (xotira to\'lgan bo\'lishi mumkin):', e);
      Toast?.show('Saqlashda xatolik — qurilma xotirasi to\'lgan bo\'lishi mumkin', 'error');
      return false;
    }
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ============ XIZMATLAR ============ */
  function getServices()    { return read(K.services, []); }
  function setServices(arr) { write(K.services, arr); }
  function addService(s) {
    const list = getServices();
    s.id = s.id || uid();
    s.aktiv = s.aktiv !== false;
    list.push(s);
    setServices(list);
    return s;
  }
  function updateService(id, patch) {
    const list = getServices().map(s => s.id === id ? { ...s, ...patch } : s);
    setServices(list);
  }
  function deleteService(id) {
    setServices(getServices().filter(s => s.id !== id));
  }

  /* ============ SOTUVLAR (CHEKLAR) ============ */
  function getSales()   { return read(K.sales, []); }
  function addSale(sale) {
    const list = getSales();
    sale.id = sale.id || uid();   // qurilmalararo barqaror hujjat id'si
    list.push(sale);
    write(K.sales, list);
  }
  // Chek raqami bo'yicha sotuvni yangilash (masalan, qaytarilgan deb belgilash)
  function updateSale(chekRaqami, patch) {
    write(K.sales, getSales().map(s => s.chek_raqami === chekRaqami ? { ...s, ...patch } : s));
  }
  function nextReceiptNo() {
    const n = (read(K.counter, 0) || 0) + 1;
    write(K.counter, n);
    return n;
  }

  /* ============ XODIMLAR ============ */
  function getEmployees()    { return read(K.employees, []); }
  function setEmployees(arr) { write(K.employees, arr); }
  function addEmployee(e) {
    const list = getEmployees();
    e.id = e.id || uid();
    e.aktiv = e.aktiv !== false;
    list.push(e);
    setEmployees(list);
    return e;
  }
  function updateEmployee(id, patch) {
    setEmployees(getEmployees().map(e => e.id === id ? { ...e, ...patch } : e));
  }
  function deleteEmployee(id) {
    setEmployees(getEmployees().filter(e => e.id !== id));
  }

  /* ============ MIJOZLAR (CRM) ============ */
  function getCustomers()    { return read(K.customers, []); }
  function setCustomers(arr) { write(K.customers, arr); }
  function addCustomer(c) {
    const list = getCustomers();
    c.id = c.id || uid();
    c.ballar = c.ballar || 0;       // sadoqat ballari
    c.jamiXarid = c.jamiXarid || 0; // umumiy xarid summasi
    c.xaridSoni = c.xaridSoni || 0; // xaridlar soni
    list.push(c);
    setCustomers(list);
    return c;
  }
  function updateCustomer(id, patch) {
    setCustomers(getCustomers().map(c => c.id === id ? { ...c, ...patch } : c));
  }
  function deleteCustomer(id) {
    setCustomers(getCustomers().filter(c => c.id !== id));
  }
  function getCustomer(id) { return getCustomers().find(c => c.id === id) || null; }
  // Mijozga xarid yozish: ballar qo'shiladi, statistika yangilanadi
  function recordCustomerPurchase(id, summa, ballar) {
    const c = getCustomer(id);
    if (!c) return;
    updateCustomer(id, {
      ballar: (c.ballar || 0) + (ballar || 0),
      jamiXarid: (c.jamiXarid || 0) + summa,
      xaridSoni: (c.xaridSoni || 0) + 1,
      oxirgiXarid: Date.now(),
    });
  }
  // Ballarni ishlatish (sarflash)
  function spendCustomerPoints(id, ballar) {
    const c = getCustomer(id);
    if (!c) return;
    updateCustomer(id, { ballar: Math.max(0, (c.ballar || 0) - ballar) });
  }

  /* ============ FILIALLAR ============ */
  function getBranches()    { return read(K.branches, []); }
  function setBranches(arr) { write(K.branches, arr); }
  function addBranch(b) {
    const list = getBranches();
    b.id = b.id || uid();
    b.aktiv = b.aktiv !== false;
    list.push(b);
    setBranches(list);
    // birinchi filial — avtomatik faol
    if (!getSettings().activeBranchId) setSettings({ activeBranchId: b.id });
    return b;
  }
  function updateBranch(id, patch) {
    setBranches(getBranches().map(b => b.id === id ? { ...b, ...patch } : b));
  }
  function deleteBranch(id) {
    setBranches(getBranches().filter(b => b.id !== id));
    if (getSettings().activeBranchId === id) {
      const first = getBranches()[0];
      setSettings({ activeBranchId: first ? first.id : '' });
    }
  }
  function getBranch(id) { return getBranches().find(b => b.id === id) || null; }
  function getActiveBranch() { return getBranch(getSettings().activeBranchId); }
  function setActiveBranch(id) { setSettings({ activeBranchId: id }); }

  /* ============ SINXRON BAYROG'I ============ */
  // Lokal o'zgarish bo'lganda true bo'ladi; Sheets'ga muvaffaqiyatli
  // yozilgach false. Internet tiklanganda avtomatik sinxronlash uchun.
  function isDirty()      { return read(K.dirty, false) === true; }
  function markDirty()    { write(K.dirty, true); }
  function clearDirty()   { write(K.dirty, false); }

  /* ============ FIREBASE'DAN KELGAN MA'LUMOTNI QO'LLASH ============ */
  // Firestore onSnapshot orqali kelgan ma'lumotni lokalga yozadi, lekin
  // qayta Firebase'ga push QILMAYDI (cheksiz loop oldini olish).
  function applyCloud(key, value) {
    _applyingCloud = true;
    try { write(key, value); }
    finally { _applyingCloud = false; }
  }

  /* ============ SMENALAR ============ */
  function getActiveShift()    { return read(K.activeShift, null); }
  function setActiveShift(s)   { write(K.activeShift, s); }
  // null yozamiz (removeItem emas) — shunda smena yopilishi Firebase orqali
  // boshqa qurilmalarga ham yetadi.
  function clearActiveShift()  { write(K.activeShift, null); }
  function getShifts()         { return read(K.shifts, []); }
  function addShift(s) {
    const list = getShifts();
    s.id = s.id || uid();
    list.push(s);
    write(K.shifts, list);
  }

  /* ============ SOZLAMALAR ============ */
  const DEFAULT_SETTINGS = {
    adminPassword: 'admin123',   // faqat birinchi ishga tushganda hashga ko'chiriladi
    adminAuth: null,             // { salt, hash } — parolning xavfsiz ko'rinishi
    apiKey: '',                  // Google Sheets API kaliti (o'qish uchun)
    sheetId: '',                 // Google Sheet ID
    appsScriptUrl: '',           // Apps Script Web App URL (o'qish+yozish)
    biznesNomi: 'Mening Biznesim',
    valyuta: 'so\'m',
    autoSync: true,              // sotuvni avtomatik Sheets'ga yuborish
    activeBranchId: '',          // hozir tanlangan filial
    kamQoldiq: 5,                // shu miqdordan kam bo'lsa "kam qoldi" ogohlantirish
    // --- Soliq (QQS) ---
    qqsYoq: false,               // soliq qo'llanilsinmi
    qqsFoiz: 12,                 // QQS foizi (%)
    qqsIchida: false,            // true = narx ichida (inclusive), false = ustiga qo'shiladi
    // --- Sadoqat dasturi ---
    sadoqatYoq: false,           // sadoqat ballari yoqilganmi
    sadoqatFoiz: 1,              // har xariddan necha % ball beriladi
    ballNarxi: 1,                // 1 ball = necha so'm (ballarni sarflashda)
    // --- Xodim KPI (har kategoriya uchun ulush) ---
    // { "<kategoriya>": { tur: "foiz" | "summa", qiymat: number } }
    kpi: {},
  };
  function getSettings()      { return { ...DEFAULT_SETTINGS, ...read(K.settings, {}) }; }
  function setSettings(patch) { write(K.settings, { ...getSettings(), ...patch }); }

  /* ============ SINXRONLASH NAVBATI (offline queue) ============ */
  // Internet yo'q paytda Sheets'ga yuborilmagan yozuvlar shu yerda saqlanadi
  function getQueue()    { return read(K.queue, []); }
  function setQueue(arr) { write(K.queue, arr); }
  function enqueue(item) {
    const q = getQueue();
    q.push({ ...item, _qid: uid() });
    setQueue(q);
  }
  function dequeue(qid) {
    setQueue(getQueue().filter(i => i._qid !== qid));
  }

  /* ============ OMBOR QOLDIG'I ============ */
  // Sotuvdan keyin qoldiqni kamaytiradi (faqat qoldiq kuzatilayotgan tovarlarda).
  // items: [{ id, miqdor }]
  // Dinamik narx/seriya id'si "baseId~ts" bo'lishi mumkin — baza id bilan moslaymiz
  function baseId(id) { return String(id).split('~')[0]; }
  function decrementStock(items) {
    const list = getServices();
    let changed = false;
    items.forEach(it => {
      const s = list.find(x => x.id === baseId(it.id));
      if (s && s.qoldiq != null) {
        s.qoldiq = Math.max(0, Number(s.qoldiq) - it.miqdor);
        changed = true;
      }
    });
    if (changed) setServices(list);
  }
  // Qaytarishda qoldiqni tiklaydi
  function incrementStock(items) {
    const list = getServices();
    let changed = false;
    items.forEach(it => {
      const s = list.find(x => x.id === baseId(it.id));
      if (s && s.qoldiq != null) {
        s.qoldiq = Number(s.qoldiq) + it.miqdor;
        changed = true;
      }
    });
    if (changed) setServices(list);
  }
  // Seriya/IMEI bo'yicha sotuvni topish (qaysi chek/mijoz)
  function findBySerial(q) {
    const needle = String(q).trim().toLowerCase();
    if (!needle) return [];
    return getSales().filter(s => (s.items || []).some(it =>
      (it.seriyalar || []).some(x => String(x).toLowerCase().includes(needle))));
  }
  // Kam qolgan tovarlar (ogohlantirish uchun)
  function lowStock(threshold = 5) {
    return getServices().filter(s => s.qoldiq != null && s.qoldiq <= threshold);
  }

  /* ============ XODIM KPI (kategoriya bo'yicha ulush) ============ */
  function getKpiConfig()    { return getSettings().kpi || {}; }
  function setKpiConfig(map) { setSettings({ kpi: map || {} }); }
  // Mavjud kategoriyalar ro'yxati (KPI sozlash / filtr uchun)
  function categoriesList() {
    return [...new Set(getServices().map(s => s.kategoriya).filter(Boolean))].sort();
  }
  // Bitta sotuv-item uchun xodimga tegishli KPI summasi.
  // item.id dinamik narxda "serviceId~ts" bo'lishi mumkin — "~" gacha kesamiz.
  function kpiForItem(item) {
    if (!item) return 0;
    const baseId = String(item.id || '').split('~')[0];
    const svc = getServices().find(s => s.id === baseId);
    const kat = svc && svc.kategoriya;
    const rule = kat ? getKpiConfig()[kat] : null;
    if (!rule || !rule.qiymat) return 0;
    const miqdor = item.miqdor || 1;
    if (rule.tur === 'foiz')  return Math.round((item.narx || 0) * miqdor * rule.qiymat / 100);
    if (rule.tur === 'summa') return rule.qiymat * miqdor;
    return 0;
  }

  /* ============ QARZ (qarzga sotilgan cheklar) ============ */
  // faqatOchiq=true -> hali to'lanmagan qarzlar; false -> barcha qarz cheklari
  function getDebts(faqatOchiq = true) {
    return getSales().filter(s => s.qarz && !s.qaytarilgan &&
      (!faqatOchiq || s.qarzStatus === 'ochiq'));
  }
  // Qarzni to'langan deb belgilash (chek raqami bo'yicha)
  function markDebtPaid(chekRaqami) {
    updateSale(chekRaqami, { qarzStatus: 'tolangan', qarzTolanganTs: Date.now() });
  }

  /* ============ DEMO MA'LUMOTLAR (birinchi ishga tushirishda) ============ */
  function seedIfEmpty() {
    // Standart filial
    if (getBranches().length === 0) {
      addBranch({ nom: 'Asosiy do\'kon', manzil: '' });
    }
    // Demo mahsulotlar (tovar do'koni — qoldiq bilan)
    if (getServices().length === 0) {
      const demo = [
        { nom: 'Coca-Cola 1L',   narx: 12000, kategoriya: 'Ichimlik',   emoji: '🥤', qoldiq: 24 },
        { nom: 'Suv 1.5L',       narx: 4000,  kategoriya: 'Ichimlik',   emoji: '💧', qoldiq: 40 },
        { nom: 'Non',            narx: 3000,  kategoriya: 'Oziq-ovqat', emoji: '🍞', qoldiq: 30 },
        { nom: 'Shokolad',       narx: 15000, kategoriya: 'Shirinlik',  emoji: '🍫', qoldiq: 18 },
        { nom: 'Chips',          narx: 9000,  kategoriya: 'Gazak',      emoji: '🍟', qoldiq: 12 },
        { nom: 'Sut 1L',         narx: 11000, kategoriya: 'Sut mahsuloti', emoji: '🥛', qoldiq: 15 },
      ];
      demo.forEach(addService);
    }
    if (getEmployees().length === 0) {
      addEmployee({ ism: 'Administrator', lavozim: 'Boshqaruvchi', pin: '1234' });
    }
  }

  return {
    K, uid, seedIfEmpty, applyCloud,
    // xizmatlar
    getServices, setServices, addService, updateService, deleteService,
    // sotuvlar
    getSales, addSale, updateSale, nextReceiptNo,
    // xodimlar
    getEmployees, setEmployees, addEmployee, updateEmployee, deleteEmployee,
    // mijozlar (CRM)
    getCustomers, setCustomers, addCustomer, updateCustomer, deleteCustomer,
    getCustomer, recordCustomerPurchase, spendCustomerPoints,
    // filiallar
    getBranches, setBranches, addBranch, updateBranch, deleteBranch,
    getBranch, getActiveBranch, setActiveBranch,
    // sinxron bayrog'i
    isDirty, markDirty, clearDirty,
    // smenalar
    getActiveShift, setActiveShift, clearActiveShift, getShifts, addShift,
    // sozlamalar
    getSettings, setSettings,
    // navbat
    getQueue, setQueue, enqueue, dequeue,
    // ombor qoldig'i
    decrementStock, incrementStock, lowStock, findBySerial,
    // xodim KPI
    getKpiConfig, setKpiConfig, categoriesList, kpiForItem,
    // qarz
    getDebts, markDebtPaid,
  };
})();
