/* ============================================================
   inventar.js — Modul 2: OMBOR / INVENTAR
   Xizmat/mahsulot bazasi: qo'shish, tahrirlash, o'chirish, import.
   Qoldiq (stok) ixtiyoriy — jismoniy tovar uchun.
   ============================================================ */

const Inventar = (() => {
  function money(n) { return Number(n).toLocaleString('uz-UZ') + ' ' + esc(Storage.getSettings().valyuta); }

  function render() {
    const root = document.getElementById('view-ombor');
    const services = Storage.getServices();

    root.innerHTML = `
      <div class="row-between">
        <h2 class="section-title">📦 Ombor / Xizmatlar</h2>
      </div>
      <div class="toolbar">
        <input class="input" id="omb-search" placeholder="🔎 Qidirish..." />
        <button class="btn btn-primary" style="width:auto" onclick="Inventar.form()">➕ Yangi</button>
        <button class="btn btn-ghost" style="width:auto" onclick="Inventar.importFromSheets()">⬇️ Sheets import</button>
      </div>
      <div id="omb-list"></div>
    `;
    document.getElementById('omb-search').oninput = renderList;
    renderList();
  }

  function renderList() {
    const q = (document.getElementById('omb-search')?.value || '').toLowerCase();
    const list = Storage.getServices().filter(s => s.nom.toLowerCase().includes(q));
    const el = document.getElementById('omb-list');
    if (list.length === 0) { el.innerHTML = `<p class="empty">Hech narsa yo'q. "Yangi" tugmasi orqali qo'shing.</p>`; return; }

    el.innerHTML = list.map(s => `
      <div class="list-item">
        <div>
          <div class="li-main">${esc(s.emoji) || '🏷️'} ${esc(s.nom)}
            <span class="badge ${s.aktiv ? 'on' : 'off'}">${s.aktiv ? 'Aktiv' : 'O\'chiq'}</span>
          </div>
          <div class="li-sub">${money(s.narx)} • ${esc(s.kategoriya)}${
            s.qoldiq != null ? ` • Qoldiq: ${s.qoldiq}` : ''}${s.shtrix ? ` • #${esc(s.shtrix)}` : ''}</div>
        </div>
        <div>
          <button class="icon-btn" title="Tahrirlash" onclick="Inventar.form('${s.id}')">✏️</button>
          <button class="icon-btn" title="O'chirish" onclick="Inventar.remove('${s.id}')">🗑️</button>
        </div>
      </div>`).join('');
  }

  /* ---------- Qo'shish / Tahrirlash formasi ---------- */
  function form(id) {
    const s = id ? Storage.getServices().find(x => x.id === id) : null;
    Modal.open(`
      <h3>${s ? '✏️ Tahrirlash' : '➕ Yangi xizmat'}</h3>
      <div class="field"><label>Nomi *</label>
        <input class="input" id="f-nom" value="${esc(s?.nom)}" placeholder="Masalan: Soch olish"></div>
      <div class="field"><label>Narxi (${esc(Storage.getSettings().valyuta)}) *</label>
        <input class="input" id="f-narx" type="number" inputmode="numeric" value="${s?.narx ?? ''}" placeholder="40000"></div>
      <div class="field"><label>Kategoriya</label>
        <input class="input" id="f-kat" value="${esc(s?.kategoriya)}" placeholder="Sartaroshxona"></div>
      <div class="field"><label>Shtrix-kod (ixtiyoriy)</label>
        <input class="input" id="f-shtrix" inputmode="numeric" value="${esc(s?.shtrix)}" placeholder="skanerlang yoki kiriting"></div>
      <div class="field"><label>Emoji (ixtiyoriy)</label>
        <input class="input" id="f-emoji" value="${esc(s?.emoji)}" placeholder="✂️" maxlength="2"></div>
      <div class="field"><label>Qoldiq (jismoniy tovar bo'lsa, ixtiyoriy)</label>
        <input class="input" id="f-qoldiq" type="number" inputmode="numeric" value="${s?.qoldiq ?? ''}" placeholder="bo'sh = kuzatilmaydi"></div>
      <div class="field"><label>Holati</label>
        <select class="input" id="f-aktiv">
          <option value="true" ${s?.aktiv !== false ? 'selected' : ''}>Aktiv</option>
          <option value="false" ${s?.aktiv === false ? 'selected' : ''}>O'chiq</option>
        </select></div>
      <button class="btn btn-primary" id="f-save">💾 Saqlash</button>
    `);

    document.getElementById('f-save').onclick = () => {
      const nom = document.getElementById('f-nom').value.trim();
      const narx = Number(document.getElementById('f-narx').value);
      if (!nom)  { Toast.show('Nomini kiriting', 'error'); return; }
      if (!narx || narx < 0) { Toast.show('To\'g\'ri narx kiriting', 'error'); return; }
      const qoldiqRaw = document.getElementById('f-qoldiq').value;
      const data = {
        nom, narx,
        kategoriya: document.getElementById('f-kat').value.trim() || 'Boshqa',
        shtrix: document.getElementById('f-shtrix').value.trim(),
        emoji: document.getElementById('f-emoji').value.trim() || '🏷️',
        qoldiq: qoldiqRaw === '' ? null : Number(qoldiqRaw),
        aktiv: document.getElementById('f-aktiv').value === 'true',
      };
      if (s) Storage.updateService(s.id, data);
      else   Storage.addService(data);
      Modal.close();
      renderList();
      Sheets.scheduleSync();
      Toast.show('Saqlandi ✓', 'success');
    };
  }

  function remove(id) {
    const s = Storage.getServices().find(x => x.id === id);
    Modal.confirm(`"${s?.nom}" o'chirilsinmi?`, () => {
      Storage.deleteService(id);
      renderList();
      Sheets.scheduleSync();
      Toast.show('O\'chirildi', 'success');
    });
  }

  /* ---------- Google Sheets'dan import ---------- */
  async function importFromSheets() {
    if (!Sheets.isConfigured()) {
      Toast.show('Avval Admin panelda Google Sheets\'ni sozlang', 'error');
      App.go('admin');
      return;
    }
    Modal.confirm('Sheets\'dagi "Mahsulotlar" varag\'i lokal ro\'yxatni almashtiradi. Davom etilsinmi?', async () => {
      try {
        Toast.show('Import qilinmoqda...');
        const n = await Sheets.importServices();
        render();
        Toast.show(`${n} ta xizmat import qilindi ✓`, 'success');
      } catch (e) {
        Toast.show('Import xatosi: ' + e.message, 'error');
      }
    });
  }

  return { render, form, remove, importFromSheets };
})();
