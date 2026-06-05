/* ============================================================
   inventar.js — Modul 2: OMBOR / INVENTAR
   Xizmat/mahsulot bazasi: qo'shish, tahrirlash, o'chirish, import.
   Qoldiq (stok) ixtiyoriy — jismoniy tovar uchun.
   ============================================================ */

const Inventar = (() => {
  function money(n) { return Number(n).toLocaleString('uz-UZ') + ' ' + esc(Storage.getSettings().valyuta); }

  // Tovar "tugagan" (arxivga o'tadigan) — qoldig'i kuzatilib, 0 ga yetgan
  const isTugagan = s => s.qoldiq != null && s.qoldiq <= 0;

  let archiveMode = false;   // false = faol tovarlar, true = arxiv (tugaganlar)

  function render() {
    const root = document.getElementById('view-ombor');
    const arxivSoni = Storage.getServices().filter(isTugagan).length;

    root.innerHTML = `
      <div class="row-between">
        <h2 class="section-title">${archiveMode ? '🗄 Arxiv — tugaganlar' : '📦 Ombor / Xizmatlar'}</h2>
      </div>
      <div class="toolbar">
        <input class="input" id="omb-search" placeholder="🔎 Qidirish..." />
        ${archiveMode
          ? `<button class="btn btn-primary" style="width:auto" onclick="Inventar.toggleArchive()">← Faol tovarlar</button>`
          : `<button class="btn btn-primary" style="width:auto" onclick="Inventar.form()">➕ Yangi</button>
             <button class="btn btn-ghost" style="width:auto" onclick="Inventar.excelImport()">📥 Excel</button>
             <button class="btn btn-ghost" style="width:auto" onclick="Inventar.importFromSheets()">⬇️ Sheets</button>
             <button class="btn btn-ghost" style="width:auto" onclick="Yorliq.open()">🏷️ Yorliq</button>
             <button class="btn btn-ghost" style="width:auto" onclick="Inventar.toggleArchive()">🗄 Arxiv${arxivSoni ? ` (${arxivSoni})` : ''}</button>`}
      </div>
      ${archiveMode ? '' : renderStats()}
      <div id="omb-list"></div>
    `;
    document.getElementById('omb-search').oninput = renderList;
    renderList();
  }

  // Ombor qiymati: qoldiqli tovarlar bo'yicha sotuv qiymati, tan narx qiymati, taxminiy foyda
  function renderStats() {
    let sotuvVal = 0, tanVal = 0, foydaVal = 0, dona = 0, turlar = 0, foydaNoma = 0;
    Storage.getServices().forEach(s => {
      if (s.qoldiq == null || s.qoldiq <= 0) return;   // faqat qoldiqdagi tovarlar
      const q = s.qoldiq;
      dona += q; turlar++;
      sotuvVal += q * (s.narx || 0);
      if (s.tanNarx != null) { tanVal += q * s.tanNarx; foydaVal += q * ((s.narx || 0) - s.tanNarx); }
      else foydaNoma++;   // tan narx kiritilmagan tovarlar soni
    });
    if (turlar === 0) return '';
    const note = foydaNoma ? `<div class="muted" style="font-size:12px;margin:-4px 0 12px;padding:0 2px">
      ⚠️ ${foydaNoma} ta tovarda tan narx kiritilmagan — ular foyda/tan narx hisobiga kirmaydi.</div>` : '';
    return `
      <div class="stats" style="margin-bottom:10px">
        <div class="stat-card"><div class="label">💰 Tovar qiymati (sotuv)</div><div class="value">${money(sotuvVal)}</div></div>
        <div class="stat-card"><div class="label">🏷 Tan narxda qiymati</div><div class="value">${money(tanVal)}</div></div>
        <div class="stat-card"><div class="label">📈 Taxminiy foyda</div><div class="value">${money(foydaVal)}</div></div>
        <div class="stat-card"><div class="label">📦 Qoldiq (${turlar} tur)</div><div class="value">${dona} dona</div></div>
      </div>${note}`;
  }

  function toggleArchive() { archiveMode = !archiveMode; render(); }

  function renderList() {
    const q = (document.getElementById('omb-search')?.value || '').toLowerCase();
    let list = Storage.getServices()
      .filter(s => archiveMode ? isTugagan(s) : !isTugagan(s))   // arxiv yoki faol
      .filter(s => s.nom.toLowerCase().includes(q));
    // Pinlanganlar ro'yxat tepasida
    list = list.slice().sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0));
    const el = document.getElementById('omb-list');
    if (list.length === 0) {
      el.innerHTML = archiveMode
        ? `<p class="empty">Arxiv bo'sh — tugagan tovar yo'q. 🎉</p>`
        : `<p class="empty">Hech narsa yo'q. "Yangi" tugmasi orqali qo'shing.</p>`;
      return;
    }

    el.innerHTML = list.map(s => {
      // Foyda/margin — tan narx kiritilgan oddiy tovarlarda (Servis/Paynet sotuvda)
      const foyda = (s.tanNarx != null && s.narx) ? (s.narx - s.tanNarx) : null;
      const margin = (foyda != null && s.narx) ? Math.round(foyda / s.narx * 100) : null;
      const narxText = s.isPaynet ? '💸 Tan + xizmat narxi (sotuvda)'
        : s.kategoriya === 'Servis' ? '🛠 Narx/foyda sotuvda'
        : s.ochiqNarx ? 'Narx: sotuvda'
        : money(s.narx);
      const tugagan = isTugagan(s);
      return `
      <div class="list-item ${s.pin ? 'pinned' : ''}${tugagan ? ' tugagan' : ''}">
        <div>
          <div class="li-main">${s.pin ? '📌 ' : ''}${esc(s.emoji) || '🏷️'} ${esc(s.nom)}
            ${tugagan ? '<span class="badge off">Tugagan</span>'
              : `<span class="badge ${s.aktiv ? 'on' : 'off'}">${s.aktiv ? 'Aktiv' : 'O\'chiq'}</span>`}
          </div>
          <div class="li-sub">${narxText} • ${esc(s.kategoriya)}${
            s.qoldiq != null ? ` • Qoldiq: ${s.qoldiq}` : ''}${s.shtrix ? ` • #${esc(s.shtrix)}` : ''}${
            foyda != null ? ` • Foyda: ${money(foyda)} (${margin}%)` : ''}</div>
        </div>
        <div>
          ${tugagan
            ? `<button class="icon-btn" title="Qoldiqni to'ldirib tiklash" onclick="Inventar.restock('${s.id}')">♻️</button>`
            : `<button class="icon-btn pin-tog ${s.pin ? 'active' : ''}" title="Pinga qo'yish" onclick="Inventar.togglePin('${s.id}')">📌</button>
               <button class="icon-btn" title="Yorliq chop etish" onclick="Yorliq.open('${s.id}')">🏷️</button>`}
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

      <label style="display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:8px">
        <input type="checkbox" id="f-paynet" ${s?.isPaynet ? 'checked' : ''} style="width:auto"> 💸 Paynet / to'lov xizmati (har safar tan narx va komissiya so'raladi)</label>

      <label style="display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:12px">
        <input type="checkbox" id="f-ochiq" ${s?.ochiqNarx && !s?.isPaynet ? 'checked' : ''} style="width:auto"> Narx oldindan belgilanmagan (sotuvda so'raladi)</label>

      <div class="field" id="f-narx-wrap"><label>Sotuv narxi (${esc(Storage.getSettings().valyuta)}) *</label>
        <input class="input" id="f-narx" type="number" inputmode="numeric" value="${s?.narx ?? ''}" placeholder="40000"></div>

      <div class="field" id="f-tannarx-wrap"><label>Tan narx (ixtiyoriy — foyda hisobi uchun)</label>
        <input class="input" id="f-tannarx" type="number" inputmode="numeric" value="${s?.tanNarx ?? ''}" placeholder="masalan: 30000"></div>

      <!-- "Servis": narx, tan narx va foyda SOTUV PAYTIDA kiritiladi (katalogda emas) -->
      <div id="f-servis-note" class="profit-box" style="display:none;background:var(--accent-soft);color:var(--primary)">
        🛠 Servis: narx, tan narx va foyda har <b>sotuvda</b> kiritiladi.
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

    // ----- Dinamik logika: Servis/Paynet -> narx sotuvda; ochiq narx -> narx yashirinadi -----
    const katEl = document.getElementById('f-kat');
    const narxEl = document.getElementById('f-narx');
    const narxWrap = document.getElementById('f-narx-wrap');
    const tanWrap = document.getElementById('f-tannarx-wrap');
    const servisNote = document.getElementById('f-servis-note');
    const ochiqEl = document.getElementById('f-ochiq');
    const paynetEl = document.getElementById('f-paynet');

    function refresh() {
      const isPaynet = paynetEl.checked;
      const isServis = katEl.value.trim().toLowerCase() === 'servis';
      // Servis ham, Paynet ham — narx (va tan narx/foyda) SOTUV PAYTIDA kiritiladi
      const atSale = isPaynet || isServis || ochiqEl.checked;
      narxWrap.style.display = atSale ? 'none' : 'block';
      tanWrap.style.display = atSale ? 'none' : 'block';   // tan narx faqat oddiy tovarda
      servisNote.style.display = (isServis && !isPaynet) ? 'block' : 'none';
      // Paynet tanlansa ochiqNarx avtomatik o'chiriladi (bir-birini istisno qiladi)
      if (isPaynet) ochiqEl.checked = false;
    }
    paynetEl.onchange = refresh;
    katEl.oninput = refresh;
    narxEl.oninput = refresh;
    ochiqEl.onchange = refresh;
    refresh();

    document.getElementById('f-save').onclick = () => {
      const nom = document.getElementById('f-nom').value.trim();
      const isPaynet = paynetEl.checked;
      const kategoriya = katEl.value.trim() || 'Boshqa';
      const isServis = kategoriya.toLowerCase() === 'servis';
      const ochiqNarx = isPaynet ? false : ochiqEl.checked;
      // Servis/Paynet/ochiqNarx -> narx (va tan narx/foyda) sotuv paytida kiritiladi
      const narxAtSale = isPaynet || isServis || ochiqNarx;
      const narx = narxAtSale ? 0 : Number(narxEl.value);
      if (!nom) { Toast.show('Nomini kiriting', 'error'); return; }
      if (!narxAtSale && (!narx || narx < 0)) { Toast.show('Narx kiriting yoki "narx belgilanmagan"ni belgilang', 'error'); return; }
      const qoldiqRaw = document.getElementById('f-qoldiq').value;
      const tanRaw = document.getElementById('f-tannarx').value;
      const data = {
        nom, narx,
        kategoriya,
        ochiqNarx,
        isPaynet,
        // Oddiy tovarda tan narx (foyda hisobi uchun); Servis/Paynet'da sotuv paytida
        tanNarx: narxAtSale ? null : (tanRaw === '' ? null : Number(tanRaw)),
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

  /* ---------- Arxivdan tiklash: qoldiqni to'ldirish (♻️) ---------- */
  function restock(id) {
    const s = Storage.getServices().find(x => x.id === id);
    if (!s) return;
    Modal.open(`
      <h3>♻️ Qoldiqni to'ldirish</h3>
      <p style="margin-bottom:12px"><b>${esc(s.nom)}</b> — hozir qoldiq: ${s.qoldiq ?? 0}</p>
      <div class="field"><label>Yangi qoldiq (dona)</label>
        <input class="input" id="rs-qty" type="number" inputmode="numeric" min="1" value="10" autofocus></div>
      <div class="btn-row">
        <button class="btn btn-ghost" onclick="Modal.close()">Bekor</button>
        <button class="btn btn-primary" id="rs-save">💾 Tiklash</button>
      </div>
    `);
    document.getElementById('rs-save').onclick = () => {
      const qty = Number(document.getElementById('rs-qty').value);
      if (!qty || qty <= 0) { Toast.show('Musbat son kiriting', 'error'); return; }
      Storage.updateService(id, { qoldiq: qty, aktiv: true });
      Modal.close();
      render();   // tiklangach tovar faol ro'yxatga qaytadi
      Sheets.scheduleSync();
      Toast.show(`"${s.nom}" tiklandi (${qty} dona) ✓`, 'success');
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

  /* ============================================================
     EXCEL (.xlsx / .csv) IMPORT + NAMUNA
     ============================================================ */

  // SheetJS (XLSX) kerak bo'lganda yuklaydi — agar index.html'dagi skript
  // (eski kesh/sekin tarmoq sabab) yuklanmagan bo'lsa, shu yerda yuklab olamiz.
  function ensureXLSX() {
    return new Promise((resolve, reject) => {
      if (typeof XLSX !== 'undefined') return resolve();
      const srcs = [
        'js/vendor/xlsx.full.min.js',
        'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
      ];
      let i = 0;
      (function tryNext() {
        if (typeof XLSX !== 'undefined') return resolve();
        if (i >= srcs.length) return reject(new Error('Excel kutubxonasini yuklab bo\'lmadi (internet kerak bo\'lishi mumkin)'));
        const sc = document.createElement('script');
        sc.src = srcs[i++];
        sc.onload = () => (typeof XLSX !== 'undefined' ? resolve() : tryNext());
        sc.onerror = tryNext;
        document.head.appendChild(sc);
      })();
    });
  }

  // Ustun sarlavhalarini moslash (uz/ru/en variantlari)
  const COL_MAP = {
    nom:       ['nom', 'nomi', 'mahsulot', 'tovar', 'name', 'наименование', 'товар', 'название'],
    narx:      ['narx', 'narxi', 'sotuv narxi', 'price', 'цена', 'narx somda', "narx so'm"],
    tanNarx:   ['tan narx', 'tannarx', 'tan narxi', 'cost', 'себестоимость', 'закуп', 'kelish narxi'],
    kategoriya:['kategoriya', 'kat', 'category', 'категория', 'tur', 'turi', 'guruh'],
    qoldiq:    ['qoldiq', 'qoldiq soni', 'soni', 'stock', 'ostatok', 'остаток', 'количество', 'miqdor'],
    shtrix:    ['shtrix', 'shtrix-kod', 'shtrixkod', 'barcode', 'штрих', 'штрихкод', 'штрих-код', 'kod'],
    emoji:     ['emoji', 'ikonka', 'belgi'],
    aktiv:     ['holat', 'aktiv', 'status', 'active', 'статус', 'holati'],
  };

  function normHeader(h) { return String(h || '').trim().toLowerCase().replace(/\s+/g, ' '); }

  function mapHeaders(headerRow) {
    const idx = {};
    headerRow.forEach((h, i) => {
      const n = normHeader(h);
      for (const field in COL_MAP) {
        if (COL_MAP[field].includes(n)) { idx[field] = i; break; }
      }
    });
    return idx;
  }

  // "12 000 so'm", "12,000", 12000 -> 12000
  function parseNum(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v;
    const s = String(v).replace(/[^\d.,-]/g, '').replace(/\s/g, '').replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? null : Math.round(n);
  }

  function parseAktiv(v) {
    const s = String(v ?? '').trim().toLowerCase();
    if (['', 'aktiv', 'faol', 'active', '1', 'true', 'ha', 'да', 'on', 'bor'].includes(s)) return true;
    if (["o'chiq", 'ochiq', 'off', '0', 'false', "yo'q", 'yoq', 'нет', 'нет '].includes(s)) return false;
    return true; // standart — aktiv
  }

  /* ---------- Namuna .xlsx yuklab olish ---------- */
  async function downloadTemplate() {
    try { await ensureXLSX(); }
    catch (e) { Toast.show(e.message, 'error'); return; }
    const headers = ['Nomi', 'Narx', 'Tan narx', 'Kategoriya', 'Qoldiq', 'Shtrix', 'Emoji', 'Holat'];
    const rows = [
      ['Coca-Cola 1L', 12000, 8000, 'Ichimlik', 24, '', '🥤', 'Aktiv'],
      ['Non', 3000, 2000, 'Oziq-ovqat', 30, '', '🍞', 'Aktiv'],
      ['Ucell 70 000', 70000, 67000, 'Ucell', '', '', '📱', 'Aktiv'],
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 8 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Mahsulotlar');
    XLSX.writeFile(wb, 'mahsulotlar-namuna.xlsx');
    Toast.show('Namuna yuklab olindi 📄', 'success');
  }

  /* ---------- Import oynasi ---------- */
  function excelImport() {
    Modal.open(`
      <h3>📥 Excel orqali import</h3>
      <p class="muted" style="font-size:13px;margin-bottom:12px">
        Excel (.xlsx) yoki .csv fayldan tovarlarni omborga qo'shing. Ustunlar:
        <b>Nomi, Narx, Tan narx, Kategoriya, Qoldiq, Shtrix, Emoji, Holat</b>. Faqat <b>Nomi</b> va <b>Narx</b> majburiy.
      </p>
      <button class="btn btn-ghost" style="margin-bottom:12px" onclick="Inventar.downloadTemplate()">📄 Namuna faylni yuklab olish</button>

      <div class="field"><label>Faylni tanlang (.xlsx, .xls, .csv)</label>
        <input class="input" id="xl-file" type="file" accept=".xlsx,.xls,.csv" style="padding:9px"></div>

      <div id="xl-preview"></div>
    `);
    // Kutubxonani oldindan (fon rejimida) yuklab qo'yamiz — fayl tanlanguncha tayyor bo'ladi
    ensureXLSX().catch(() => {});
    document.getElementById('xl-file').onchange = onFile;
  }

  // Tahlil natijasini saqlash (Tasdiqlash uchun)
  let _parsed = null;

  function onFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const box = document.getElementById('xl-preview');
    box.innerHTML = `<p class="muted" style="padding:10px">⏳ O'qilmoqda...</p>`;
    ensureXLSX().then(() => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const wb = XLSX.read(ev.target.result, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
          analyze(rows);
        } catch (err) {
          box.innerHTML = `<p class="empty" style="color:var(--danger)">Faylni o'qib bo'lmadi: ${esc(err.message)}</p>`;
        }
      };
      reader.readAsArrayBuffer(file);
    }).catch(err => {
      box.innerHTML = `<p class="empty" style="color:var(--danger)">${esc(err.message)}</p>`;
    });
  }

  // Qatorlarni tahlil qilib, qo'shiladigan/yangilanadigan/xato sonlarini ko'rsatadi
  function analyze(rows) {
    const box = document.getElementById('xl-preview');
    if (!rows || rows.length < 2) {
      box.innerHTML = `<p class="empty" style="color:var(--danger)">Faylda ma'lumot topilmadi (sarlavha + kamida 1 qator kerak).</p>`;
      return;
    }
    const idx = mapHeaders(rows[0]);
    if (idx.nom == null || idx.narx == null) {
      box.innerHTML = `<p class="empty" style="color:var(--danger)">"Nomi" va "Narx" ustunlari topilmadi. Namuna faylga qarang.</p>`;
      return;
    }

    const existing = Storage.getServices();
    const byShtrix = new Map(existing.filter(s => s.shtrix).map(s => [String(s.shtrix), s]));
    const byNom = new Map(existing.map(s => [s.nom.trim().toLowerCase(), s]));

    const items = [];   // { data, match, ok, err }
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.every(c => c === '' || c == null)) continue;
      const nom = String(row[idx.nom] ?? '').trim();
      const narx = parseNum(row[idx.narx]);
      const shtrix = idx.shtrix != null ? String(row[idx.shtrix] ?? '').trim() : '';
      const qoldiqRaw = idx.qoldiq != null ? row[idx.qoldiq] : '';
      const qoldiq = (qoldiqRaw === '' || qoldiqRaw == null) ? null : parseNum(qoldiqRaw);

      let err = '';
      if (!nom) err = 'Nomi yo\'q';
      else if (narx == null || narx < 0) err = 'Narx xato';

      const data = {
        nom, narx: narx || 0,
        kategoriya: (idx.kategoriya != null ? String(row[idx.kategoriya] ?? '').trim() : '') || 'Boshqa',
        ochiqNarx: false, isPaynet: false,
        shtrix,
        emoji: (idx.emoji != null ? String(row[idx.emoji] ?? '').trim() : '') || '🏷️',
        qoldiq,
        aktiv: idx.aktiv != null ? parseAktiv(row[idx.aktiv]) : true,
      };
      // Tan narx faqat ustun mavjud bo'lsa yoziladi (aks holda eski qiymat saqlanadi)
      if (idx.tanNarx != null) data.tanNarx = parseNum(row[idx.tanNarx]);
      // Mavjudini topish: avval shtrix, keyin nom bo'yicha
      const match = (shtrix && byShtrix.get(shtrix)) || byNom.get(nom.toLowerCase()) || null;
      items.push({ data, match, ok: !err, err });
    }

    _parsed = items.filter(i => i.ok);
    const yangi = _parsed.filter(i => !i.match).length;
    const yangilanadi = _parsed.filter(i => i.match).length;
    const xato = items.filter(i => !i.ok);

    const sample = items.slice(0, 8).map(i => `
      <div class="cart-item" style="${i.ok ? '' : 'opacity:.6'}">
        <span>${i.ok ? (i.match ? '♻️' : '🆕') : '⚠️'}</span>
        <span class="ci-name">${esc(i.data.nom || '—')}
          <span class="muted" style="font-weight:400">• ${esc(i.data.kategoriya)}</span></span>
        <span class="ci-price">${i.ok ? money(i.data.narx) : esc(i.err)}</span>
      </div>`).join('');

    box.innerHTML = `
      <div class="stats" style="margin:6px 0 12px">
        <div class="stat-card"><div class="label">🆕 Yangi</div><div class="value">${yangi}</div></div>
        <div class="stat-card"><div class="label">♻️ Yangilanadi</div><div class="value">${yangilanadi}</div></div>
        <div class="stat-card"><div class="label">⚠️ Xato</div><div class="value">${xato.length}</div></div>
      </div>
      <div class="cart" style="margin-bottom:12px">
        <div class="cart-head">Ko'rib chiqish (dastlabki ${Math.min(8, items.length)})</div>
        ${sample}
      </div>
      <div class="btn-row">
        <button class="btn btn-ghost" onclick="Modal.close()">Bekor</button>
        <button class="btn btn-primary" id="xl-apply" ${_parsed.length ? '' : 'disabled'}>
          ✅ ${_parsed.length} ta tovarni import qilish</button>
      </div>`;
    const applyBtn = document.getElementById('xl-apply');
    if (applyBtn) applyBtn.onclick = applyImport;
  }

  function applyImport() {
    if (!_parsed || !_parsed.length) return;
    let added = 0, updated = 0;
    _parsed.forEach(i => {
      if (i.match) { Storage.updateService(i.match.id, i.data); updated++; }
      else { Storage.addService(i.data); added++; }
    });
    _parsed = null;
    Modal.close();
    render();
    Sheets.scheduleSync();
    Toast.show(`Import: ${added} yangi, ${updated} yangilandi ✓`, 'success');
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

  return { render, form, remove, importFromSheets, togglePin, excelImport, downloadTemplate, toggleArchive, restock };
})();
