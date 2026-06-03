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
    let list = Storage.getServices().filter(s => s.nom.toLowerCase().includes(q));
    // Pinlanganlar ro'yxat tepasida
    list = list.slice().sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0));
    const el = document.getElementById('omb-list');
    if (list.length === 0) { el.innerHTML = `<p class="empty">Hech narsa yo'q. "Yangi" tugmasi orqali qo'shing.</p>`; return; }

    el.innerHTML = list.map(s => {
      // Foyda/margin FAQAT "Servis" kategoriyasida ko'rsatiladi
      const servis = s.kategoriya === 'Servis';
      const foyda = (servis && s.tanNarx != null) ? (s.narx - s.tanNarx) : null;
      const margin = (foyda != null && s.narx) ? Math.round(foyda / s.narx * 100) : null;
      const narxText = s.ochiqNarx ? 'Narx: sotuvda' : money(s.narx);
      return `
      <div class="list-item ${s.pin ? 'pinned' : ''}">
        <div>
          <div class="li-main">${s.pin ? '📌 ' : ''}${esc(s.emoji) || '🏷️'} ${esc(s.nom)}
            <span class="badge ${s.aktiv ? 'on' : 'off'}">${s.aktiv ? 'Aktiv' : 'O\'chiq'}</span>
          </div>
          <div class="li-sub">${narxText} • ${esc(s.kategoriya)}${
            s.qoldiq != null ? ` • Qoldiq: ${s.qoldiq}` : ''}${s.shtrix ? ` • #${esc(s.shtrix)}` : ''}${
            foyda != null ? ` • Foyda: ${money(foyda)} (${margin}%)` : ''}</div>
        </div>
        <div>
          <button class="icon-btn pin-tog ${s.pin ? 'active' : ''}" title="Pinga qo'yish" onclick="Inventar.togglePin('${s.id}')">📌</button>
          <button class="icon-btn" title="Tahrirlash" onclick="Inventar.form('${s.id}')">✏️</button>
          <button class="icon-btn" title="O'chirish" onclick="Inventar.remove('${s.id}')">🗑️</button>
        </div>
      </div>`;
    }).join('');
  }

  /* ---------- Qo'shish / Tahrirlash formasi ---------- */
  function form(id) {
    const s = id ? Storage.getServices().find(x => x.id === id) : null;
    // Mavjud kategoriyalar + "Servis" — tanlash uchun datalist
    const cats = [...new Set(Storage.getServices().map(x => x.kategoriya).filter(Boolean))];
    if (!cats.includes('Servis')) cats.push('Servis');
    Modal.open(`
      <h3>${s ? '✏️ Tahrirlash' : '➕ Yangi xizmat'}</h3>
      <div class="field"><label>Nomi *</label>
        <input class="input" id="f-nom" value="${esc(s?.nom)}" placeholder="Masalan: Soch olish"></div>
      <div class="field"><label>Kategoriya</label>
        <input class="input" id="f-kat" list="f-cats" value="${esc(s?.kategoriya)}" placeholder="Sartaroshxona / Servis ...">
        <datalist id="f-cats">${cats.map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist></div>

      <label style="display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:12px">
        <input type="checkbox" id="f-ochiq" ${s?.ochiqNarx ? 'checked' : ''} style="width:auto"> Narx oldindan belgilanmagan (sotuvda so'raladi)</label>

      <div class="field" id="f-narx-wrap"><label>Narxi (${esc(Storage.getSettings().valyuta)}) *</label>
        <input class="input" id="f-narx" type="number" inputmode="numeric" value="${s?.narx ?? ''}" placeholder="40000"></div>

      <!-- Tan narx + foyda/margin FAQAT "Servis" kategoriyasi uchun ko'rinadi -->
      <div id="f-servis" style="display:none">
        <div class="field"><label>Tan narx / cost (${esc(Storage.getSettings().valyuta)})</label>
          <input class="input" id="f-tan" type="number" inputmode="numeric" value="${s?.tanNarx ?? ''}" placeholder="0"></div>
        <div class="profit-box" id="f-foyda">Foyda: —</div>
      </div>

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

    // ----- Dinamik logika: Servis -> tan narx/foyda; ochiq narx -> narx maydonini yashirish -----
    const katEl = document.getElementById('f-kat');
    const narxEl = document.getElementById('f-narx');
    const narxWrap = document.getElementById('f-narx-wrap');
    const tanEl = document.getElementById('f-tan');
    const servisBox = document.getElementById('f-servis');
    const foydaEl = document.getElementById('f-foyda');
    const ochiqEl = document.getElementById('f-ochiq');

    function refresh() {
      // isServis === true bo'lsagina tan narx maydoni va foyda ko'rinadi
      const isServis = katEl.value.trim().toLowerCase() === 'servis';
      servisBox.style.display = isServis ? 'block' : 'none';
      narxWrap.style.display = ochiqEl.checked ? 'none' : 'block';
      if (isServis) {
        const narx = Number(narxEl.value) || 0;
        const tan = Number(tanEl.value) || 0;
        const foyda = narx - tan;                       // foyda = sotish narxi − tan narx
        const margin = narx ? Math.round(foyda / narx * 100) : 0;  // margin = foyda/narx*100
        foydaEl.textContent = `Foyda: ${money(foyda)}  •  Margin: ${margin}%`;
      }
    }
    katEl.oninput = refresh;
    narxEl.oninput = refresh;
    tanEl.oninput = refresh;
    ochiqEl.onchange = refresh;
    refresh();

    document.getElementById('f-save').onclick = () => {
      const nom = document.getElementById('f-nom').value.trim();
      const ochiqNarx = ochiqEl.checked;
      const narx = ochiqNarx ? 0 : Number(narxEl.value);
      if (!nom) { Toast.show('Nomini kiriting', 'error'); return; }
      if (!ochiqNarx && (!narx || narx < 0)) { Toast.show('Narx kiriting yoki "narx belgilanmagan"ni belgilang', 'error'); return; }
      const kategoriya = katEl.value.trim() || 'Boshqa';
      const isServis = kategoriya.toLowerCase() === 'servis';
      const qoldiqRaw = document.getElementById('f-qoldiq').value;
      const data = {
        nom, narx,
        kategoriya,
        ochiqNarx,
        tanNarx: isServis ? (Number(tanEl.value) || 0) : null,  // tan narx faqat Servisda saqlanadi
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

  /* ---------- Pinga qo'yish/olib tashlash (📌) ---------- */
  function togglePin(id) {
    const s = Storage.getServices().find(x => x.id === id);
    if (!s) return;
    Storage.updateService(id, { pin: !s.pin });
    renderList();
    Sheets.scheduleSync();
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

  return { render, form, remove, importFromSheets, togglePin };
})();
