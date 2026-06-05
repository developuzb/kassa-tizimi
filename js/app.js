/* ============================================================
   app.js — Ilova yadrosi
   • Navigatsiya (pastki menyu)
   • Modal va Toast yordamchilari
   • Online/offline holatini kuzatish + avtomatik sinxronlash
   • Dastlabki ishga tushirish
   ============================================================ */

/* ===================== TOAST ===================== */
const Toast = (() => {
  function show(msg, type = '') {
    const root = document.getElementById('toast-root');
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = msg;
    root.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 250); }, 2600);
  }
  return { show };
})();

/* ===================== MODAL ===================== */
const Modal = (() => {
  function open(html) {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal-overlay" onclick="if(event.target===this)Modal.close()">
        <div class="modal">
          <button class="modal-close" onclick="Modal.close()">×</button>
          ${html}
        </div>
      </div>`;
  }
  function close() { document.getElementById('modal-root').innerHTML = ''; }

  // Tasdiqlash oynasi
  function confirm(message, onYes) {
    open(`
      <h3>❓ Tasdiqlash</h3>
      <p style="white-space:pre-line;margin-bottom:16px">${esc(message)}</p>
      <div class="btn-row">
        <button class="btn btn-ghost" onclick="Modal.close()">Bekor</button>
        <button class="btn btn-danger" id="modal-yes">Ha</button>
      </div>`);
    document.getElementById('modal-yes').onclick = () => { close(); onYes(); };
  }
  return { open, close, confirm };
})();

/* ===================== APP (navigatsiya + init) ===================== */
const App = (() => {
  const views = {
    kassa: Kassa, ombor: Inventar, mijoz: Mijozlar, xodimlar: Xodimlar,
    hisobot: Hisobotlar, admin: Admin,
  };

  function go(name) {
    // ko'rinishlarni almashtirish
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + name).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.view === name));
    // moduldagi render() ni chaqirish
    views[name]?.render();
    window.scrollTo(0, 0);
  }

  // Header'dagi smena va internet holatini yangilash
  function refreshHeader() {
    const shift = Storage.getActiveShift();
    const branch = Storage.getActiveBranch();
    let label = shift ? `🟢 ${shift.xodim}` : 'Smena yopiq';
    if (branch) label += ` · 🏪 ${branch.nom}`;
    document.getElementById('current-staff').textContent = label;
    updateNet();
  }

  function updateNet() {
    const el = document.getElementById('net-status');
    if (navigator.onLine) { el.className = 'net-status online'; el.title = 'Onlayn'; }
    else { el.className = 'net-status offline'; el.title = 'Oflayn — ma\'lumot lokal saqlanmoqda'; }
  }

  // Joriy ochiq ko'rinishni qayta chizadi (Firebase'dan yangi ma'lumot kelganda).
  // OPTIMIZATSIYA: modal ochiq yoki foydalanuvchi maydonga yozayotgan bo'lsa,
  // qayta chizmaymiz — aks holda matn/fokus yo'qoladi yoki ekran sakraydi.
  function refresh() {
    const modalOpen = (document.getElementById('modal-root')?.innerHTML || '').trim() !== '';
    const ae = document.activeElement;
    const typing = ae && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName);
    if (modalOpen || typing) { refreshHeader(); return; }   // faqat header (yengil)
    const active = document.querySelector('.view.active');
    if (active) views[active.id.replace('view-', '')]?.render();
    refreshHeader();
  }

  // Eski (ochiq matnli) parol/PINlarni bir marta hashga ko'chiradi
  async function migrateSecurity() {
    const s = Storage.getSettings();
    if (!s.adminAuth) {
      const rec = await Security.make(s.adminPassword || 'admin123');
      Storage.setSettings({ adminAuth: rec, adminPassword: '' });
    }
    const emps = Storage.getEmployees();
    let changed = false;
    for (const e of emps) {
      if (e.pin && !e.pinAuth) {
        e.pinAuth = await Security.make(String(e.pin));
        delete e.pin;
        changed = true;
      }
    }
    if (changed) Storage.setEmployees(emps);
  }

  async function init() {
    Storage.seedIfEmpty();
    await migrateSecurity();

    // navigatsiya tugmalari
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.onclick = () => go(btn.dataset.view);
    });

    // online/offline hodisalari
    window.addEventListener('online', async () => {
      updateNet();
      if (Storage.isDirty()) {
        Toast.show('Internet tiklandi — sinxronlanmoqda...', 'success');
        const r = await Sheets.syncIfNeeded();
        if (r.ok) Toast.show('Google Sheets sinxronlandi ✓', 'success');
      }
    });
    window.addEventListener('offline', () => {
      updateNet();
      Toast.show('Internet uzildi — oflayn rejim', 'error');
    });

    refreshHeader();
    go('kassa');

    // Multi-device real-time sinxron (Firebase) — seed/migrate tugagach ulanamiz
    if (window.FBSync) window.FBSync.start();

    // Ishga tushganda sinxronlanmagan o'zgarish bo'lsa, fon rejimida yuboramiz
    if (navigator.onLine && Storage.isDirty()) {
      Sheets.syncIfNeeded().then(r => {
        if (r.ok) Toast.show('Google Sheets sinxronlandi ✓', 'success');
      });
    }
  }

  return { go, init, refreshHeader, updateNet, refresh };
})();

// Ilovani ishga tushirish
document.addEventListener('DOMContentLoaded', App.init);
