/* ============================================================
   admin.js — Modul 5: ADMIN PANEL (parol bilan himoyalangan)
   • Parolni o'zgartirish
   • Biznes sozlamalari (nom, valyuta)
   • Google Sheets ulanishi (API key, Sheet ID, Apps Script URL)
   • Ulanishni tekshirish, navbatni sinxronlash
   • Ma'lumotlarni eksport/tozalash
   ============================================================ */

const Admin = (() => {
  let unlocked = false;

  function render() {
    const root = document.getElementById('view-admin');
    if (!unlocked) { renderLock(root); return; }
    // Qayta qurishdan oldin qaysi jildlar ochiq ekanini eslab qolamiz
    const opened = [...root.querySelectorAll('.adm-folder[open]')].map(d => d.dataset.fld);
    renderPanel(root);
    // ...va qayta tiklaymiz (amal bajarilganda jild yopilib qolmasin)
    opened.forEach(id => {
      const d = root.querySelector(`.adm-folder[data-fld="${id}"]`);
      if (d) d.open = true;
    });
  }

  /* ---------- Parol ekrani ---------- */
  function renderLock(root) {
    root.innerHTML = `
      <div class="lock-screen">
        <div class="lock-icon">🔐</div>
        <h2 class="section-title">Admin panel</h2>
        <p class="muted">Kirish uchun parolni kiriting</p>
        <div style="max-width:280px;margin:18px auto 0">
          <input class="input" id="adm-pass" type="password" placeholder="Parol"
                 onkeydown="if(event.key==='Enter')Admin.unlock()">
          <button class="btn btn-primary" style="margin-top:10px" onclick="Admin.unlock()">Kirish</button>
        </div>
      </div>`;
  }

  async function unlock() {
    const val = document.getElementById('adm-pass').value;
    if (await Security.verify(val, Storage.getSettings().adminAuth)) {
      unlocked = true;
      render();
    } else {
      Toast.show('Parol noto\'g\'ri', 'error');
    }
  }

  function lock() { unlocked = false; render(); }

  /* ---------- Asosiy panel ----------
     Tuzilma:
       • Tepada — TEZKOR PANEL (kunlik kerakli amallar: faol filial + sinxronlash)
       • Pastda — yig'iladigan JILDLAR (kamdan-kam kerakli sozlamalar)
  */
  function renderPanel(root) {
    const s = Storage.getSettings();
    const dirty = Storage.isDirty();
    const branches = Storage.getBranches();
    const activeBranch = branches.find(b => b.id === s.activeBranchId);

    root.innerHTML = `
      <div class="row-between">
        <h2 class="section-title">🔐 Admin panel</h2>
        <button class="btn btn-ghost" style="width:auto" onclick="Admin.lock()">🚪 Chiqish</button>
      </div>

      <!-- ===== TEZKOR PANEL (doim ochiq) ===== -->
      <div class="adm-quick">
        <div class="field" style="margin-bottom:0">
          <label>Faol filial (sotuv shu filialga yoziladi)</label>
          <select class="input" id="set-branch" onchange="Admin.changeBranch(this.value)">
            ${branches.map(b => `<option value="${b.id}" ${b.id === s.activeBranchId ? 'selected' : ''}>${esc(b.nom)}${b.aktiv ? '' : ' (o\'chiq)'}</option>`).join('')}
          </select>
        </div>
        <div class="adm-sync-row">
          <span class="adm-sync-pill">${dirty ? '🟡 Sinxronlanmagan o\'zgarish bor' : '🟢 Sheets bilan sinxron'}</span>
          <button class="btn btn-accent" onclick="Admin.syncNow()">☁️ Sinxronlash</button>
        </div>
      </div>

      <!-- ===== SOZLAMALAR JILDLARI ===== -->
      <div class="adm-group-label">Sozlamalar</div>

      ${folder('🏪', 'Biznes sozlamalari', esc(s.biznesNomi) + ' · ' + esc(s.valyuta), `
        <div class="field"><label>Biznes nomi (chekda chiqadi)</label>
          <input class="input" id="set-biznes" value="${esc(s.biznesNomi)}"></div>
        <div class="field"><label>Valyuta</label>
          <input class="input" id="set-valyuta" value="${esc(s.valyuta)}"></div>
        <button class="btn btn-primary" onclick="Admin.saveBusiness()">💾 Saqlash</button>
      `)}

      ${folder('🏬', 'Filiallarni boshqarish', branches.length + ' ta filial · faol: ' + esc(activeBranch?.nom || '—'), `
        <div id="branch-list">
          ${branches.map(b => `
            <div class="list-item">
              <div><div class="li-main">🏪 ${esc(b.nom)}
                ${b.id === s.activeBranchId ? '<span class="badge on">faol</span>' : ''}</div>
                <div class="li-sub">${esc(b.manzil) || 'manzil yo\'q'}</div></div>
              <div>
                <button class="icon-btn" onclick="Admin.branchForm('${b.id}')">✏️</button>
                <button class="icon-btn" onclick="Admin.branchRemove('${b.id}')">🗑️</button>
              </div>
            </div>`).join('') || '<p class="empty">Filial yo\'q</p>'}
        </div>
        <button class="btn btn-primary" style="margin-top:10px" onclick="Admin.branchForm()">➕ Filial qo'shish</button>
      `)}

      ${folder('🧮', 'Soliq (QQS) va sadoqat', (s.qqsYoq ? 'QQS yoq' : 'QQS o\'chiq') + ' · ' + (s.sadoqatYoq ? 'sadoqat yoq' : 'sadoqat o\'chiq'), `
        <div class="field"><label>QQS (soliq)</label>
          <select class="input" id="set-qqs-yoq">
            <option value="false" ${!s.qqsYoq ? 'selected' : ''}>O'chiq</option>
            <option value="true" ${s.qqsYoq ? 'selected' : ''}>Yoqilgan</option>
          </select></div>
        <div class="field"><label>QQS foizi (%)</label>
          <input class="input" id="set-qqs-foiz" type="number" inputmode="numeric" value="${s.qqsFoiz}"></div>
        <div class="field"><label>QQS hisoblash usuli</label>
          <select class="input" id="set-qqs-ichida">
            <option value="false" ${!s.qqsIchida ? 'selected' : ''}>Narx ustiga qo'shiladi</option>
            <option value="true" ${s.qqsIchida ? 'selected' : ''}>Narx ichida</option>
          </select></div>
        <div style="border-top:1px solid var(--hairline);margin:10px 0"></div>
        <div class="field"><label>Sadoqat ballari</label>
          <select class="input" id="set-sadoqat-yoq">
            <option value="false" ${!s.sadoqatYoq ? 'selected' : ''}>O'chiq</option>
            <option value="true" ${s.sadoqatYoq ? 'selected' : ''}>Yoqilgan</option>
          </select></div>
        <div class="field"><label>Har xariddan ball (%)</label>
          <input class="input" id="set-sadoqat-foiz" type="number" inputmode="numeric" value="${s.sadoqatFoiz}"></div>
        <div class="field"><label>1 ball = necha ${esc(s.valyuta)}</label>
          <input class="input" id="set-ball-narxi" type="number" inputmode="numeric" value="${s.ballNarxi}"></div>
        <button class="btn btn-primary" onclick="Admin.saveTaxLoyalty()">💾 Saqlash</button>
      `)}

      ${folder('💰', 'Xodim KPI (kategoriya ulushi)', Object.keys(s.kpi || {}).length + ' ta kategoriya sozlangan', `
        <p class="muted" style="font-size:13px;margin-bottom:12px">Har kategoriya uchun xodimga beriladigan ulush — <b>foiz</b> (sotuv narxidan %) yoki <b>summa</b> (har dona uchun ${esc(s.valyuta)}). Tovar sotilganda ochiq smenadagi xodim ish haqiga qo'shiladi.</p>
        ${kpiRowsHTML()}
      `)}

      <!-- ===== TIZIM JILDLARI ===== -->
      <div class="adm-group-label">Tizim</div>

      ${folder('📋', 'Google Sheets ulanishi', Sheets.canWrite() ? 'Ulangan' : 'Ulanmagan', `
        <p class="muted" style="font-size:13px;margin-bottom:10px">
          Yozish uchun <b>Apps Script URL</b> kerak (tavsiya etiladi).
          Faqat o'qish uchun API key + Sheet ID ham yetadi.
          To'liq yo'riqnoma — <b>README.md</b> faylida.</p>
        <div class="field"><label>Apps Script Web App URL (o'qish + yozish)</label>
          <input class="input" id="set-script" value="${esc(s.appsScriptUrl)}" placeholder="https://script.google.com/macros/s/.../exec"></div>
        <div class="field"><label>Google Sheet ID</label>
          <input class="input" id="set-sheetid" value="${esc(s.sheetId)}" placeholder="1AbC...xyz"></div>
        <div class="field"><label>API key (faqat o'qish, ixtiyoriy)</label>
          <input class="input" id="set-apikey" value="${esc(s.apiKey)}" placeholder="AIza..."></div>
        <div class="field"><label>Avtomatik sinxronlash</label>
          <select class="input" id="set-autosync">
            <option value="true" ${s.autoSync ? 'selected' : ''}>Yoqilgan</option>
            <option value="false" ${!s.autoSync ? 'selected' : ''}>O'chiq</option>
          </select></div>
        <div class="btn-row">
          <button class="btn btn-ghost" onclick="Admin.saveSheets()">💾 Saqlash</button>
          <button class="btn btn-primary" onclick="Admin.testConn()">🔌 Tekshirish</button>
        </div>
        <p class="muted" style="font-size:12px;margin-top:10px">
          Mahsulotlar, Sotuvlar, Hisobot, Smenalar, Mijozlar, Xodimlar va Filiallar
          varaqlari to'liq tartiblanib yoziladi.</p>
      `)}

      ${folder('🔑', 'Xavfsizlik', 'Admin parolini o\'zgartirish', `
        <div class="field"><label>Joriy parol</label>
          <input class="input" id="pw-old" type="password"></div>
        <div class="field"><label>Yangi parol</label>
          <input class="input" id="pw-new" type="password"></div>
        <button class="btn btn-primary" onclick="Admin.changePassword()">🔄 Yangilash</button>
      `)}

      ${folder('💾', 'Ma\'lumotlar', 'Zaxira, tiklash va tozalash', `
        <div class="btn-row">
          <button class="btn btn-ghost" onclick="Admin.exportData()">⬇️ Zaxira (JSON)</button>
          <button class="btn btn-ghost" onclick="Admin.importData()">⬆️ Tiklash (JSON)</button>
        </div>
        <button class="btn btn-danger" style="margin-top:8px" onclick="Admin.clearData()">🗑️ Hammasini tozalash</button>
        <p class="muted" style="font-size:12px;margin-top:8px">
          Zaxirani muntazam yuklab oling — ma'lumot faqat shu qurilmada saqlanadi.</p>
      `)}
    `;
  }

  /* Xodim KPI qatorlari (kategoriya × tur/qiymat) */
  function kpiRowsHTML() {
    const cats = Storage.categoriesList();
    const cfg = Storage.getKpiConfig();
    if (!cats.length) return '<p class="empty">Avval Omborga tovar/kategoriya qo\'shing</p>';
    return cats.map(c => {
      const r = cfg[c] || { tur: 'foiz', qiymat: 0 };
      return `
        <div class="kpi-row" data-kat="${esc(c)}">
          <span class="kpi-name">${esc(c)}</span>
          <select class="input kpi-tur">
            <option value="foiz" ${r.tur === 'foiz' ? 'selected' : ''}>%</option>
            <option value="summa" ${r.tur === 'summa' ? 'selected' : ''}>so'm</option>
          </select>
          <input class="input kpi-val" type="number" inputmode="numeric" min="0" value="${r.qiymat || 0}">
        </div>`;
    }).join('') + '<button class="btn btn-primary" style="margin-top:8px" onclick="Admin.saveKpi()">💾 KPI saqlash</button>';
  }

  function saveKpi() {
    const map = {};
    document.querySelectorAll('#view-admin .kpi-row').forEach(row => {
      const kat = row.dataset.kat;
      const tur = row.querySelector('.kpi-tur').value;
      const qiymat = Math.max(0, Number(row.querySelector('.kpi-val').value) || 0);
      if (qiymat > 0) map[kat] = { tur, qiymat };
    });
    Storage.setKpiConfig(map);
    render();
    Sheets.scheduleSync();
    Toast.show('KPI saqlandi ✓', 'success');
  }

  /* Yig'iladigan "jild" (collapsible) HTML'ini quradi.
     id — render() qayta qurganda ochiq holatni tiklash uchun barqaror kalit */
  function folder(icon, title, sub, body) {
    const id = title.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    return `
      <details class="adm-folder" data-fld="${id}">
        <summary>
          <span class="fld-ico">${icon}</span>
          <span class="fld-txt">${esc(title)}<span class="fld-sub">${esc(sub)}</span></span>
          <span class="fld-chev">▶</span>
        </summary>
        <div class="fld-body">${body}</div>
      </details>`;
  }

  /* ---------- Amallar ---------- */
  function saveBusiness() {
    Storage.setSettings({
      biznesNomi: document.getElementById('set-biznes').value.trim() || 'Biznes',
      valyuta: document.getElementById('set-valyuta').value.trim() || "so'm",
    });
    Toast.show('Saqlandi ✓', 'success');
  }

  async function changePassword() {
    const oldp = document.getElementById('pw-old').value;
    const newp = document.getElementById('pw-new').value;
    if (!(await Security.verify(oldp, Storage.getSettings().adminAuth))) { Toast.show('Joriy parol noto\'g\'ri', 'error'); return; }
    if (newp.length < 4) { Toast.show('Yangi parol kamida 4 belgi', 'error'); return; }
    Storage.setSettings({ adminAuth: await Security.make(newp) });
    Toast.show('Parol yangilandi ✓', 'success');
    document.getElementById('pw-old').value = '';
    document.getElementById('pw-new').value = '';
  }

  function saveSheets() {
    Storage.setSettings({
      appsScriptUrl: document.getElementById('set-script').value.trim(),
      sheetId: document.getElementById('set-sheetid').value.trim(),
      apiKey: document.getElementById('set-apikey').value.trim(),
      autoSync: document.getElementById('set-autosync').value === 'true',
    });
    Toast.show('Sozlamalar saqlandi ✓', 'success');
  }

  async function testConn() {
    saveSheets(); // avval saqlaymiz
    Toast.show('Tekshirilmoqda...');
    const r = await Sheets.testConnection();
    Toast.show(r.message, r.ok ? 'success' : 'error');
  }

  function saveTaxLoyalty() {
    Storage.setSettings({
      qqsYoq: document.getElementById('set-qqs-yoq').value === 'true',
      qqsFoiz: Math.max(0, Number(document.getElementById('set-qqs-foiz').value) || 0),
      qqsIchida: document.getElementById('set-qqs-ichida').value === 'true',
      sadoqatYoq: document.getElementById('set-sadoqat-yoq').value === 'true',
      sadoqatFoiz: Math.max(0, Number(document.getElementById('set-sadoqat-foiz').value) || 0),
      ballNarxi: Math.max(1, Number(document.getElementById('set-ball-narxi').value) || 1),
    });
    Toast.show('Saqlandi ✓', 'success');
  }

  async function syncNow() {
    saveSheets(); // sozlamalarni avval saqlaymiz
    if (!Sheets.canWrite()) { Toast.show('Avval Apps Script URL kiriting', 'error'); return; }
    if (!navigator.onLine) { Toast.show('Internet yo\'q', 'error'); return; }
    Toast.show('Sinxronlanmoqda...');
    const r = await Sheets.sync();
    Toast.show(r.message, r.ok ? 'success' : 'error');
    render();
  }

  /* ---------- Filiallar boshqaruvi ---------- */
  function changeBranch(id) {
    Storage.setActiveBranch(id);
    App.refreshHeader();
    render();
    Toast.show('Faol filial o\'zgartirildi', 'success');
  }

  function branchForm(id) {
    const b = id ? Storage.getBranch(id) : null;
    Modal.open(`
      <h3>${b ? '✏️ Filialni tahrirlash' : '➕ Yangi filial'}</h3>
      <div class="field"><label>Nomi *</label>
        <input class="input" id="b-nom" value="${esc(b?.nom)}" placeholder="Chilonzor filiali"></div>
      <div class="field"><label>Manzil (ixtiyoriy)</label>
        <input class="input" id="b-manzil" value="${esc(b?.manzil)}" placeholder="Toshkent, Chilonzor 5"></div>
      <div class="field"><label>Holati</label>
        <select class="input" id="b-aktiv">
          <option value="true" ${b?.aktiv !== false ? 'selected' : ''}>Aktiv</option>
          <option value="false" ${b?.aktiv === false ? 'selected' : ''}>O'chiq</option>
        </select></div>
      <button class="btn btn-primary" id="b-save">💾 Saqlash</button>
    `);
    document.getElementById('b-save').onclick = () => {
      const nom = document.getElementById('b-nom').value.trim();
      if (!nom) { Toast.show('Filial nomini kiriting', 'error'); return; }
      const data = {
        nom,
        manzil: document.getElementById('b-manzil').value.trim(),
        aktiv: document.getElementById('b-aktiv').value === 'true',
      };
      if (b) Storage.updateBranch(b.id, data);
      else   Storage.addBranch(data);
      Storage.markDirty();
      Modal.close();
      render();
      Sheets.scheduleSync();
      Toast.show('Saqlandi ✓', 'success');
    };
  }

  function branchRemove(id) {
    const b = Storage.getBranch(id);
    if (Storage.getBranches().length <= 1) { Toast.show('Kamida bitta filial qolishi kerak', 'error'); return; }
    Modal.confirm(`"${b?.nom}" filiali o'chirilsinmi?`, () => {
      Storage.deleteBranch(id);
      Storage.markDirty();
      App.refreshHeader();
      render();
      Sheets.scheduleSync();
      Toast.show('O\'chirildi', 'success');
    });
  }

  function exportData() {
    const dump = {};
    Object.values(Storage.K).forEach(k => { dump[k] = localStorage.getItem(k); });
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kassa-zaxira-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    Toast.show('Zaxira yuklab olindi ✓', 'success');
  }

  // Zaxira fayldan tiklash — joriy ma'lumotlarni almashtiradi
  function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        let dump;
        try {
          dump = JSON.parse(reader.result);
        } catch (e) {
          Toast.show('Fayl noto\'g\'ri (JSON emas)', 'error');
          return;
        }
        const validKeys = Object.values(Storage.K);
        const matched = Object.keys(dump).filter(k => validKeys.includes(k));
        if (matched.length === 0) { Toast.show('Bu fayl ushbu ilova zaxirasi emas', 'error'); return; }
        Modal.confirm('Zaxiradan tiklash JORIY barcha ma\'lumotlarni almashtiradi.\nDavom etilsinmi?', () => {
          matched.forEach(k => { if (dump[k] != null) localStorage.setItem(k, dump[k]); });
          Storage.markDirty();
          unlocked = false;
          App.go('kassa');
          App.refreshHeader();
          Toast.show('Zaxiradan tiklandi ✓', 'success');
        });
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function clearData() {
    Modal.confirm('DIQQAT! Barcha sotuvlar, xizmatlar va xodimlar o\'chiriladi. Davom etilsinmi?', () => {
      Object.values(Storage.K).forEach(k => localStorage.removeItem(k));
      Storage.seedIfEmpty();
      unlocked = false;
      App.go('kassa');
      Toast.show('Ma\'lumotlar tozalandi', 'success');
    });
  }

  return {
    render, unlock, lock, saveBusiness, changePassword, saveTaxLoyalty,
    saveSheets, testConn, syncNow, exportData, importData, clearData,
    changeBranch, branchForm, branchRemove, saveKpi,
  };
})();
