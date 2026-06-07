/* ============================================================
   hisobotlar.js — SUPERDASHBOARD (to'liq boshqaruv paneli)
   • Davr/sana boshqaruvi: Bugun / 7 / 30 kun + ixtiyoriy sana oralig'i
   • Tablar: Umumiy / Moliya / Ombor / Xodim / Mijoz / Qarzdorlar / KPI
   • Professional tavsiyalar (qoidaga asoslangan)
   • Tezkor amallar: restock, refund, "To'landi", bo'limga o'tish
   • Xodim KPI (kategoriya ulushi) va smena ish haqi ko'rsatkichlari
   ============================================================ */

const Hisobotlar = (() => {
  let chartRef = null;
  let tab = 'umumiy';                 // umumiy|moliya|ombor|xodim|mijoz|qarz|kpi
  let debtArchive = false;            // Qarzdorlar: arxiv ko'rinishi
  // Davr: mode (kun|hafta|oy|oraliq) + ixtiyoriy sana oralig'i
  let period = { mode: 'kun', fromStr: '', toStr: '' };

  function money(n) { return Number(n || 0).toLocaleString('uz-UZ') + ' ' + esc(Storage.getSettings().valyuta); }
  function k(n) { return Math.round((n || 0) / 1000) + 'k'; }

  /* ---------------- Davr (sana oralig'i) ---------------- */
  function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function dayStartMs(str) { const [y, m, d] = str.split('-').map(Number); return new Date(y, m - 1, d, 0, 0, 0, 0).getTime(); }
  function toInput(ms) { const d = new Date(ms); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }

  function rangeOf() {
    const now = Date.now();
    if (period.mode === 'oraliq' && period.fromStr && period.toStr) {
      const a = dayStartMs(period.fromStr), b = dayStartMs(period.toStr) + 86399999;
      return { from: Math.min(a, b), to: Math.max(a, b) };
    }
    const today0 = startOfDay(new Date()).getTime();
    if (period.mode === 'hafta') return { from: today0 - 6 * 86400000, to: now };
    if (period.mode === 'oy')    return { from: today0 - 29 * 86400000, to: now };
    return { from: today0, to: now }; // kun (bugun)
  }
  function rangeLabel() {
    const { from, to } = rangeOf();
    const f = new Date(from).toLocaleDateString('uz-UZ');
    const t = new Date(to).toLocaleDateString('uz-UZ');
    return f === t ? f : `${f} — ${t}`;
  }

  /* ---------------- Umumiy yordamchilar ---------------- */
  const itemsOf = s => Array.isArray(s.items) ? s.items : [];
  const foydaOf = s => itemsOf(s).reduce((b, it) => b + (it.komissiya != null ? it.komissiya * (it.miqdor || 1) : 0), 0);
  function salesInRange() {
    const { from, to } = rangeOf();
    return Storage.getSales().filter(s => s.ts >= from && s.ts <= to);
  }
  const PAY = { naqd: ['💵', 'Naqd'], karta: ['💳', 'Karta'], otkazma: ['📲', "O'tkazma"], qarz: ['📝', 'Qarz'] };
  function daysAgo(ts) {
    const d = Math.floor((Date.now() - ts) / 86400000);
    return d <= 0 ? 'bugun' : d === 1 ? 'kecha' : `${d} kun oldin`;
  }
  // Item -> baza xizmat kategoriyasi (dinamik narx id "serviceId~ts" bo'lsa kesamiz)
  function catOf(it) {
    const svc = Storage.getServices().find(x => x.id === String(it.id).split('~')[0]);
    return svc ? svc.kategoriya : 'Boshqa';
  }

  // Amal muddati yaqinlashgan/o'tgan tovarlar (sotuv item.amalGacha bo'yicha)
  function expiringSoon(days = 30) {
    const now = Date.now();
    const limit = now + days * 86400000;
    const res = [];
    Storage.getSales().forEach(s => {
      if (s.qaytarilgan) return;
      (s.items || []).forEach(it => {
        if (it.amalGacha && it.amalGacha <= limit) {
          res.push({ amalGacha: it.amalGacha, nom: it.nom, mijoz: s.mijoz || '', chek: s.chek_raqami,
            seriya: (it.seriyalar || []).join(', '), otgan: it.amalGacha < now });
        }
      });
    });
    return res.sort((a, b) => a.amalGacha - b.amalGacha);
  }
  let serialQ = '';

  /* ============================================================
     ASOSIY RENDER (qobiq)
     ============================================================ */
  function render() {
    const root = document.getElementById('view-hisobot');
    const r = rangeOf();
    const TABS = [
      ['umumiy', '🏠 Umumiy'], ['moliya', '📈 Moliya'], ['ombor', '📦 Ombor'],
      ['xodim', '👥 Xodim'], ['mijoz', '🙋 Mijoz'], ['qarz', '📝 Qarzdorlar'], ['kpi', '⚙️ KPI'],
    ];
    root.innerHTML = `
      <h2 class="section-title">📊 Boshqaruv paneli</h2>

      <div class="dash-period">
        <div class="seg">
          ${[['kun', 'Bugun'], ['hafta', '7 kun'], ['oy', '30 kun']].map(([m, t]) =>
            `<button class="seg-btn ${period.mode === m ? 'active' : ''}" onclick="Hisobotlar.setMode('${m}')">${t}</button>`).join('')}
        </div>
        <div class="dash-range">
          <input class="input" type="date" id="dash-from" value="${esc(period.fromStr || toInput(r.from))}">
          <span class="muted">—</span>
          <input class="input" type="date" id="dash-to" value="${esc(period.toStr || toInput(r.to))}">
          <button class="btn btn-ghost" style="width:auto" onclick="Hisobotlar.applyRange()">Ko'rish</button>
        </div>
      </div>
      <div class="muted" style="font-size:12.5px;margin:-4px 2px 12px">📅 ${rangeLabel()}</div>

      <div class="cat-tabs" id="dash-tabs">
        ${TABS.map(([key, label]) =>
          `<button class="cat-tab ${tab === key ? 'active' : ''}" onclick="Hisobotlar.setTab('${key}')">${label}</button>`).join('')}
      </div>

      <div id="dash-body"></div>
    `;
    renderBody();
  }

  function setMode(m) { period.mode = m; period.fromStr = ''; period.toStr = ''; render(); }
  function applyRange() {
    const f = document.getElementById('dash-from')?.value;
    const t = document.getElementById('dash-to')?.value;
    if (!f || !t) { Toast.show('Ikkala sanani tanlang', 'error'); return; }
    period.mode = 'oraliq'; period.fromStr = f; period.toStr = t; render();
  }
  function setTab(t) { tab = t; render(); }

  function renderBody() {
    const body = document.getElementById('dash-body');
    if (!body) return;
    if (tab === 'umumiy')      body.innerHTML = tabUmumiy();
    else if (tab === 'moliya') { body.innerHTML = tabMoliya(); drawChart(dailySeries()); }
    else if (tab === 'ombor')  body.innerHTML = tabOmbor();
    else if (tab === 'xodim')  body.innerHTML = tabXodim();
    else if (tab === 'mijoz')  body.innerHTML = tabMijoz();
    else if (tab === 'qarz')   body.innerHTML = tabQarz();
    else if (tab === 'kpi')    body.innerHTML = tabKpi();
  }

  /* ============================================================
     TAVSIYALAR (qoidaga asoslangan, offline)
     ============================================================ */
  function recommendations() {
    const set = Storage.getSettings();
    const out = [];
    const allSales = Storage.getSales().filter(s => !s.qaytarilgan);
    // Bugun vs kecha
    const t0 = startOfDay(new Date()).getTime();
    const y0 = t0 - 86400000;
    const sum = (a, b) => allSales.filter(s => s.ts >= a && s.ts < b).reduce((x, s) => x + s.jami, 0);
    const bugun = sum(t0, t0 + 86400000), kecha = sum(y0, t0);
    if (kecha > 0) {
      const diff = Math.round((bugun - kecha) / kecha * 100);
      if (diff <= -15) out.push({ ic: '📉', txt: `Bugungi savdo kechagidan <b>${Math.abs(diff)}%</b> past. Aksiya yorlig'i bilan rag'batlantiring.`, act: ['Aksiya', "App.go('ombor')"] });
      else if (diff >= 15) out.push({ ic: '🚀', txt: `Bugungi savdo kechagidan <b>${diff}%</b> yuqori. Zo'r ketyapti!` });
    }
    // Ombor
    const low = Storage.lowStock(set.kamQoldiq || 5);
    const out0 = Storage.getServices().filter(s => s.qoldiq != null && s.qoldiq <= 0);
    if (out0.length) out.push({ ic: '🛑', txt: `<b>${out0.length}</b> ta tovar tugagan. Tezda to'ldiring.`, act: ['Ombor', "Hisobotlar.setTab('ombor')"] });
    else if (low.length) out.push({ ic: '⚠️', txt: `<b>${low.length}</b> ta tovar kam qoldi (≤${set.kamQoldiq || 5}).`, act: ['Ko\'rish', "Hisobotlar.setTab('ombor')"] });
    // Qarz
    const debts = Storage.getDebts(true);
    if (debts.length) {
      const total = debts.reduce((a, s) => a + s.jami, 0);
      out.push({ ic: '📝', txt: `To'lanmagan qarz: <b>${money(total)}</b> (${debts.length} ta). Undirishni boshlang.`, act: ['Qarzdorlar', "Hisobotlar.setTab('qarz')"] });
    }
    // Oxirgi smena kamomadi
    const shifts = Storage.getShifts();
    const last = shifts[shifts.length - 1];
    if (last && last.farq < 0) out.push({ ic: '💸', txt: `Oxirgi smenada kamomad: <b>${money(-last.farq)}</b> (${esc(last.xodim)}).`, act: ['Xodim', "Hisobotlar.setTab('xodim')"] });
    // KPI sozlanmagan bo'lsa
    const kpi = Storage.getKpiConfig();
    if (!Object.keys(kpi).length && Storage.getSales().length > 3)
      out.push({ ic: '⚙️', txt: `Xodim KPI hali sozlanmagan. Har kategoriyaga ulush belgilang.`, act: ['Sozlash', "Hisobotlar.setTab('kpi')"] });
    // Eng foydali kategoriya (oraliqda)
    const byCatProfit = {};
    salesInRange().filter(s => !s.qaytarilgan).forEach(s => itemsOf(s).forEach(it => {
      if (it.komissiya != null) byCatProfit[catOf(it)] = (byCatProfit[catOf(it)] || 0) + it.komissiya * (it.miqdor || 1);
    }));
    const topCat = Object.entries(byCatProfit).sort((a, b) => b[1] - a[1])[0];
    if (topCat && topCat[1] > 0) out.push({ ic: '🏆', txt: `Eng ko'p foyda: <b>${esc(topCat[0])}</b> (${money(topCat[1])}). Bu yo'nalishni kengaytiring.` });

    if (!out.length) out.push({ ic: '✅', txt: 'Hammasi joyida. Ko\'rsatkichlar barqaror.' });
    return out;
  }

  function recoHTML() {
    return `<div class="reco">
      ${recommendations().map(r => `
        <div class="reco-item">
          <span class="reco-ic">${r.ic}</span>
          <span class="reco-txt">${r.txt}</span>
          ${r.act ? `<button class="reco-btn" onclick="${r.act[1]}">${esc(r.act[0])}</button>` : ''}
        </div>`).join('')}
    </div>`;
  }

  /* ============================================================
     TAB: UMUMIY
     ============================================================ */
  function statCards() {
    const sales = salesInRange().filter(s => !s.qaytarilgan);
    const jami = sales.reduce((a, s) => a + s.jami, 0);
    const foyda = sales.reduce((a, s) => a + foydaOf(s), 0);
    const soni = sales.length;
    const ortacha = soni ? Math.round(jami / soni) : 0;
    const qarz = Storage.getDebts(true).reduce((a, s) => a + s.jami, 0);
    return `
      <div class="stats">
        <div class="stat-card"><div class="label">Savdo</div><div class="value">${money(jami)}</div></div>
        <div class="stat-card"><div class="label">Foyda</div><div class="value">${money(foyda)}</div></div>
        <div class="stat-card"><div class="label">Cheklar</div><div class="value">${soni}</div></div>
        <div class="stat-card"><div class="label">O'rtacha chek</div><div class="value">${money(ortacha)}</div></div>
        <div class="stat-card"><div class="label">To'lanmagan qarz</div><div class="value">${money(qarz)}</div></div>
      </div>`;
  }

  function tabUmumiy() {
    const set = Storage.getSettings();
    const low = Storage.lowStock(set.kamQoldiq || 5);
    const out0 = Storage.getServices().filter(s => s.qoldiq != null && s.qoldiq <= 0);
    const debts = Storage.getDebts(true);
    const shifts = Storage.getShifts();
    const last = shifts[shifts.length - 1];
    const exp = expiringSoon(30);
    const alerts = [
      out0.length ? ['🛑', `${out0.length} ta tovar tugagan`, "Hisobotlar.setTab('ombor')", 'Ombor'] : null,
      low.length ? ['⚠️', `${low.length} ta tovar kam qoldi`, "Hisobotlar.setTab('ombor')", 'Ko\'rish'] : null,
      exp.length ? ['📆', `${exp.length} ta muddati tugayotgan (30 kun)`, "Hisobotlar.setTab('ombor')", 'Ko\'rish'] : null,
      debts.length ? ['📝', `${debts.length} ta ochiq qarz`, "Hisobotlar.setTab('qarz')", 'Qarzdorlar'] : null,
      (last && last.farq !== 0) ? [last.farq < 0 ? '🔻' : '🔺', `Oxirgi smena farqi: ${money(last.farq)}`, "Hisobotlar.setTab('xodim')", 'Xodim'] : null,
    ].filter(Boolean);
    return `
      ${recoHTML()}
      ${statCards()}
      <div class="cart" style="margin-bottom:16px">
        <div class="cart-head">🔔 Ogohlantirishlar</div>
        ${alerts.length ? alerts.map(a => `
          <div class="cart-item">
            <span>${a[0]}</span>
            <span class="ci-name">${a[1]}</span>
            <button class="btn btn-ghost" style="width:auto;padding:7px 12px" onclick="${a[2]}">${a[3]}</button>
          </div>`).join('') : '<p class="empty" style="padding:22px">Ogohlantirish yo\'q ✅</p>'}
      </div>`;
  }

  /* ============================================================
     TAB: MOLIYA
     ============================================================ */
  function tabMoliya() {
    const sales = salesInRange().filter(s => !s.qaytarilgan);
    const all = salesInRange();
    const byPay = { naqd: 0, karta: 0, otkazma: 0, qarz: 0 };
    sales.forEach(s => { byPay[s.tolov_usuli] = (byPay[s.tolov_usuli] || 0) + s.jami; });
    const payMax = Math.max(byPay.naqd, byPay.karta, byPay.otkazma, byPay.qarz, 1);
    const refunds = all.filter(s => s.qaytarilgan);
    const refundSum = refunds.reduce((a, s) => a + s.jami, 0);
    // Foyda taqsimoti (kategoriya)
    const byCat = {};
    sales.forEach(s => itemsOf(s).forEach(it => {
      if (it.komissiya != null) byCat[catOf(it)] = (byCat[catOf(it)] || 0) + it.komissiya * (it.miqdor || 1);
    }));
    const topCat = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
    return `
      ${statCards()}
      <div class="cart" style="margin-bottom:16px">
        <div class="cart-head">📈 Savdo dinamikasi</div>
        <div style="padding:14px"><canvas id="dash-chart" height="170"></canvas><div id="chart-fallback"></div></div>
      </div>
      <div class="cart" style="margin-bottom:16px">
        <div class="cart-head">💳 To'lov usullari</div>
        <div style="padding:14px;display:flex;flex-direction:column;gap:13px">
          ${['naqd', 'karta', 'otkazma', 'qarz'].map(key => `
            <div>
              <div class="row-between" style="margin-bottom:5px">
                <span style="font-weight:600">${PAY[key][0]} ${PAY[key][1]}</span><b>${money(byPay[key])}</b>
              </div>
              <div style="height:7px;border-radius:6px;background:var(--fill);overflow:hidden">
                <div style="height:100%;width:${Math.round(byPay[key] / payMax * 100)}%;background:var(--accent-grad)"></div>
              </div>
            </div>`).join('')}
        </div>
      </div>
      ${topCat.length ? `
      <div class="cart" style="margin-bottom:16px">
        <div class="cart-head">🏆 Kategoriya bo'yicha foyda</div>
        ${topCat.map(([kat, f]) => `<div class="cart-item"><span>📂</span>
          <span class="ci-name">${esc(kat)}</span><span class="ci-price">${money(f)}</span></div>`).join('')}
      </div>` : ''}
      ${refunds.length ? `
      <div class="cart" style="border-color:var(--danger)">
        <div class="cart-head">↩️ Qaytarishlar</div>
        <div class="row-between" style="padding:14px"><span class="muted">${refunds.length} ta chek</span>
          <b style="color:var(--danger)">−${money(refundSum)}</b></div>
      </div>` : ''}`;
  }

  /* ============================================================
     TAB: OMBOR
     ============================================================ */
  function tabOmbor() {
    const set = Storage.getSettings();
    const services = Storage.getServices();
    // Ombor qiymati
    let sotuvVal = 0, tanVal = 0, foydaVal = 0, dona = 0;
    services.forEach(s => {
      if (s.qoldiq == null || s.qoldiq <= 0) return;
      const q = s.qoldiq; dona += q; sotuvVal += q * (s.narx || 0);
      if (s.tanNarx != null) { tanVal += q * s.tanNarx; foydaVal += q * ((s.narx || 0) - s.tanNarx); }
    });
    const out0 = services.filter(s => s.qoldiq != null && s.qoldiq <= 0);
    const low = Storage.lowStock(set.kamQoldiq || 5).filter(s => s.qoldiq > 0);
    // Sotuv reytingi (oraliq)
    const sales = salesInRange().filter(s => !s.qaytarilgan);
    const byService = {};
    sales.forEach(s => itemsOf(s).forEach(it => { byService[it.nom] = (byService[it.nom] || 0) + (it.miqdor || 1); }));
    const top = Object.entries(byService).sort((a, b) => b[1] - a[1]).slice(0, 7);
    const sotilgan = new Set(Object.keys(byService));
    const sotilmagan = services.filter(s => s.aktiv !== false && !sotilgan.has(s.nom)).slice(0, 8);

    return `
      <div class="stats">
        <div class="stat-card"><div class="label">Tovar qiymati (sotuv)</div><div class="value">${money(sotuvVal)}</div></div>
        <div class="stat-card"><div class="label">Tan narxda</div><div class="value">${money(tanVal)}</div></div>
        <div class="stat-card"><div class="label">Taxminiy foyda</div><div class="value">${money(foydaVal)}</div></div>
        <div class="stat-card"><div class="label">Qoldiq (dona)</div><div class="value">${dona}</div></div>
      </div>

      <div class="cart" style="margin-bottom:16px">
        <div class="cart-head">🔢 Seriya / IMEI qidirish</div>
        <div style="padding:12px 14px">
          <input class="input" id="dash-serial" placeholder="seriya/IMEI/polis raqamini kiriting" value="${esc(serialQ)}" oninput="Hisobotlar.searchSerial(this.value)">
          <div id="dash-serial-res" style="margin-top:10px">${serialResultsHTML()}</div>
        </div>
      </div>

      ${expiringBlockHTML()}

      ${(out0.length || low.length) ? `
      <div class="cart" style="margin-bottom:16px;border-color:var(--danger)">
        <div class="cart-head">⚠️ To'ldirish kerak</div>
        ${out0.concat(low).map(s => `
          <div class="cart-item">
            <span>${s.qoldiq <= 0 ? '🛑' : '⚠️'}</span>
            <span class="ci-name">${esc(s.nom)} <span class="muted" style="font-weight:400">• qoldiq: ${s.qoldiq}</span></span>
            <button class="btn btn-ghost" style="width:auto;padding:7px 12px" onclick="Hisobotlar.restock('${s.id}')">♻️ To'ldirish</button>
          </div>`).join('')}
      </div>` : ''}
      <div class="cart" style="margin-bottom:16px">
        <div class="cart-head">🏆 Eng ko'p sotilgan</div>
        ${top.length ? top.map(([nom, q], i) => `<div class="cart-item"><span>${['🥇', '🥈', '🥉'][i] || '▫️'}</span>
          <span class="ci-name">${esc(nom)}</span><span class="ci-price">${q} dona</span></div>`).join('')
          : '<p class="empty" style="padding:22px">Ma\'lumot yo\'q</p>'}
      </div>
      ${sotilmagan.length ? `
      <div class="cart">
        <div class="cart-head">😴 Sotilmagan tovarlar (aksiya kerak)</div>
        ${sotilmagan.map(s => `<div class="cart-item"><span>📦</span>
          <span class="ci-name">${esc(s.nom)}</span>
          <button class="btn btn-ghost" style="width:auto;padding:7px 12px" onclick="Yorliq.open('${s.id}')">🏷️ Aksiya yorlig'i</button></div>`).join('')}
      </div>` : ''}`;
  }

  function serialResultsHTML() {
    const q = serialQ.trim();
    if (!q) return '<p class="muted" style="font-size:12.5px">Raqam kiriting — qaysi chek/mijozga sotilgani topiladi.</p>';
    const found = Storage.findBySerial(q);
    if (!found.length) return '<p class="muted" style="font-size:12.5px">Topilmadi.</p>';
    return found.slice(0, 10).map(s => {
      const its = (s.items || []).filter(it => (it.seriyalar || []).some(x => String(x).toLowerCase().includes(q.toLowerCase())));
      return `<div class="cart-item"><span>🔢</span>
        <div class="ci-name" style="flex:1;min-width:0">
          <div style="font-weight:700">${esc(its.map(i => i.nom).join(', '))}</div>
          <div class="muted" style="font-size:12px">#${s.chek_raqami} • ${esc(s.sana)} • ${esc(s.mijoz || 'mijozsiz')} • ${esc(s.xodim)}</div>
        </div></div>`;
    }).join('');
  }

  function searchSerial(v) {
    serialQ = v || '';
    const el = document.getElementById('dash-serial-res');
    if (el) el.innerHTML = serialResultsHTML();
  }

  function expiringBlockHTML() {
    const exp = expiringSoon(30);
    if (!exp.length) return '';
    return `<div class="cart" style="margin-bottom:16px;border-color:var(--accent-soft-2)">
      <div class="cart-head">📆 Muddati tugayotgan (30 kun)</div>
      ${exp.slice(0, 12).map(e => {
        const kun = Math.ceil((e.amalGacha - Date.now()) / 86400000);
        return `<div class="cart-item"><span>${e.otgan ? '🔴' : '🟡'}</span>
          <div class="ci-name" style="flex:1;min-width:0">
            <div style="font-weight:700">${esc(e.nom)} ${e.mijoz ? `<span class="muted" style="font-weight:400;font-size:12px">• ${esc(e.mijoz)}</span>` : ''}</div>
            <div class="muted" style="font-size:12px">${e.seriya ? esc(e.seriya) + ' • ' : ''}#${e.chek}</div>
          </div>
          <span class="ci-price" style="color:${e.otgan ? 'var(--danger)' : 'var(--text)'}">${e.otgan ? 'muddati o\'tgan' : kun + ' kun'}</span></div>`;
      }).join('')}
    </div>`;
  }

  /* ============================================================
     TAB: XODIM / SMENA
     ============================================================ */
  function tabXodim() {
    const sales = salesInRange().filter(s => !s.qaytarilgan);
    const byEmp = {};
    sales.forEach(s => {
      const e = byEmp[s.xodim] = byEmp[s.xodim] || { sum: 0, n: 0, kpi: 0 };
      e.sum += s.jami; e.n += 1; e.kpi += (s.xodimKpi || 0);
    });
    const emps = Object.entries(byEmp).sort((a, b) => b[1].sum - a[1].sum);
    const shift = Storage.getActiveShift();
    const shifts = Storage.getShifts().slice(-5).reverse();
    return `
      <div class="cart" style="margin-bottom:16px">
        <div class="cart-head">🟢 Ochiq smena</div>
        ${shift ? `<div style="padding:14px">
          <div class="row-between"><span class="muted">Xodim:</span><b>${esc(shift.xodim)}</b></div>
          <div class="row-between"><span class="muted">Sotuvlar:</span><b>${shift.sotuvSoni || 0} • ${money(shift.jami_sotuv || 0)}</b></div>
          <div class="row-between"><span class="muted">Naqd kassada:</span><b>${money((shift.boshlangichPul || 0) + (shift.naqdSotuv || 0) + (shift.naqdKirim || 0) - (shift.naqdChiqim || 0))}</b></div>
          <div class="row-between"><span class="muted">💰 Ish haqi (KPI):</span><b style="color:var(--success)">${money(shift.ishHaqi || 0)}</b></div>
        </div>` : '<p class="empty" style="padding:22px">Smena yopiq</p>'}
      </div>
      <div class="cart" style="margin-bottom:16px">
        <div class="cart-head">👥 Xodimlar reytingi (davr bo'yicha)</div>
        ${emps.length ? emps.map(([nom, e], i) => `
          <div class="cart-item"><span>${['🥇', '🥈', '🥉'][i] || '👤'}</span>
            <span class="ci-name">${esc(nom)} <span class="muted" style="font-weight:400">• ${e.n} chek${e.kpi ? ' • KPI ' + money(e.kpi) : ''}</span></span>
            <span class="ci-price">${money(e.sum)}</span></div>`).join('')
          : '<p class="empty" style="padding:22px">Ma\'lumot yo\'q</p>'}
      </div>
      <div class="cart">
        <div class="cart-head">🧾 Oxirgi smenalar</div>
        ${shifts.length ? shifts.map(s => `
          <div class="cart-item"><span>${s.farq < 0 ? '🔻' : s.farq > 0 ? '🔺' : '✅'}</span>
            <div class="ci-name" style="flex:1;min-width:0">
              <div style="font-weight:700">${esc(s.xodim)} <span class="muted" style="font-weight:400;font-size:12px">${esc(s.sana)} ${esc(s.boshlandi)}–${esc(s.tugadi)}</span></div>
              <div class="muted" style="font-size:12px">Savdo ${money(s.jami_sotuv)} • Ish haqi ${money(s.ishHaqi || 0)} • Farq ${money(s.farq)}</div>
            </div></div>`).join('')
          : '<p class="empty" style="padding:22px">Yopilgan smena yo\'q</p>'}
      </div>`;
  }

  /* ============================================================
     TAB: MIJOZ (CRM)
     ============================================================ */
  function tabMijoz() {
    const customers = Storage.getCustomers();
    const top = customers.slice().sort((a, b) => (b.jamiXarid || 0) - (a.jamiXarid || 0)).slice(0, 8);
    const ballJami = customers.reduce((a, c) => a + (c.ballar || 0), 0);
    // Eng katta qarzdorlar
    const debts = Storage.getDebts(true);
    const byCust = {};
    debts.forEach(s => { const key = s.mijoz || '—'; byCust[key] = (byCust[key] || 0) + s.jami; });
    const debtors = Object.entries(byCust).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return `
      <div class="stats">
        <div class="stat-card"><div class="label">Mijozlar</div><div class="value">${customers.length}</div></div>
        <div class="stat-card"><div class="label">Jami ballar</div><div class="value">${ballJami}</div></div>
        <div class="stat-card"><div class="label">Qarzdorlar</div><div class="value">${debtors.length}</div></div>
      </div>
      <div class="cart" style="margin-bottom:16px">
        <div class="cart-head">⭐ Eng faol mijozlar</div>
        ${top.length ? top.map((c, i) => `<div class="cart-item"><span>${['🥇', '🥈', '🥉'][i] || '🙋'}</span>
          <span class="ci-name">${esc(c.ism)} <span class="muted" style="font-weight:400">• ${c.xaridSoni || 0} xarid</span></span>
          <span class="ci-price">${money(c.jamiXarid || 0)}</span></div>`).join('')
          : '<p class="empty" style="padding:22px">Mijoz yo\'q</p>'}
      </div>
      ${debtors.length ? `
      <div class="cart">
        <div class="cart-head">📝 Eng katta qarzdorlar</div>
        ${debtors.map(([nom, sum]) => `<div class="cart-item"><span>📝</span>
          <span class="ci-name">${esc(nom)}</span><span class="ci-price" style="color:var(--danger)">${money(sum)}</span></div>`).join('')}
      </div>` : ''}`;
  }

  /* ============================================================
     TAB: QARZDORLAR
     ============================================================ */
  function tabQarz() {
    const list = Storage.getSales()
      .filter(s => s.qarz && !s.qaytarilgan && (debtArchive ? s.qarzStatus === 'tolangan' : s.qarzStatus === 'ochiq'))
      .sort((a, b) => debtArchive ? (b.qarzTolanganTs || 0) - (a.qarzTolanganTs || 0) : a.ts - b.ts);
    const ochiq = Storage.getDebts(true);
    const total = ochiq.reduce((a, s) => a + s.jami, 0);
    return `
      <div class="stats">
        <div class="stat-card"><div class="label">Ochiq qarz</div><div class="value">${money(total)}</div></div>
        <div class="stat-card"><div class="label">Qarzdor cheklar</div><div class="value">${ochiq.length}</div></div>
      </div>
      <div class="toolbar">
        <button class="btn ${debtArchive ? 'btn-ghost' : 'btn-primary'}" style="width:auto" onclick="Hisobotlar.setDebtView(false)">Ochiq</button>
        <button class="btn ${debtArchive ? 'btn-primary' : 'btn-ghost'}" style="width:auto" onclick="Hisobotlar.setDebtView(true)">🗄 Arxiv (to'langan)</button>
      </div>
      <div class="cart">
        <div class="cart-head">${debtArchive ? '🗄 To\'langan qarzlar' : '📝 Qarzdorlar'}</div>
        ${list.length ? list.map(s => `
          <div class="cart-item" style="${debtArchive ? 'opacity:.7' : ''}">
            <span>${debtArchive ? '✅' : '📝'}</span>
            <div class="ci-name" style="flex:1;min-width:0">
              <div style="font-weight:700">${esc(s.mijoz || '—')} <span class="muted" style="font-weight:400;font-size:12px">#${s.chek_raqami}</span></div>
              <div class="muted" style="font-size:12px">${esc(s.sana)} • ${daysAgo(s.ts)} • ${esc(s.xodim)}${debtArchive && s.qarzTolanganTs ? ' • to\'landi ' + new Date(s.qarzTolanganTs).toLocaleDateString('uz-UZ') : ''}</div>
            </div>
            <span class="ci-price">${money(s.jami)}</span>
            ${debtArchive ? '' : `<button class="btn btn-success" style="width:auto;padding:7px 12px" onclick="Hisobotlar.markPaid(${s.chek_raqami})">To'landi</button>`}
          </div>`).join('') : `<p class="empty" style="padding:22px">${debtArchive ? 'To\'langan qarz yo\'q' : 'Ochiq qarz yo\'q ✅'}</p>`}
      </div>`;
  }

  function setDebtView(arx) { debtArchive = arx; renderBody(); }
  function markPaid(chek) {
    const s = Storage.getSales().find(x => x.chek_raqami === chek);
    if (!s) return;
    Modal.confirm(`#${chek} — ${esc(s.mijoz || '')} (${money(s.jami)}) to'landi deb belgilansinmi?`, () => {
      Storage.markDebtPaid(chek);
      renderBody();
      Toast.show('Qarz to\'landi ✓', 'success');
      Sheets.scheduleSync();
    });
  }

  /* ============================================================
     TAB: KPI SOZLAMASI
     ============================================================ */
  function tabKpi() {
    const cats = Storage.categoriesList();
    const cfg = Storage.getKpiConfig();
    return `
      <div class="cart" style="margin-bottom:14px">
        <div class="cart-head">⚙️ Xodim KPI (kategoriya ulushi)</div>
        <div style="padding:14px">
          <p class="muted" style="font-size:13px;margin-bottom:12px">Har kategoriya uchun xodimga beriladigan ulush — <b>foiz</b> (sotuv narxidan %) yoki <b>summa</b> (har dona uchun so'm). Tovar sotilganda ochiq smenadagi xodim ish haqiga qo'shiladi.</p>
          ${cats.length ? cats.map(c => {
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
          }).join('') : '<p class="empty">Avval Omborga tovar/kategoriya qo\'shing</p>'}
          ${cats.length ? '<button class="btn btn-primary" style="margin-top:14px" onclick="Hisobotlar.saveKpi()">💾 KPI saqlash</button>' : ''}
        </div>
      </div>`;
  }

  function saveKpi() {
    const map = {};
    document.querySelectorAll('#dash-body .kpi-row').forEach(row => {
      const kat = row.dataset.kat;
      const tur = row.querySelector('.kpi-tur').value;
      const qiymat = Math.max(0, Number(row.querySelector('.kpi-val').value) || 0);
      if (qiymat > 0) map[kat] = { tur, qiymat };
    });
    Storage.setKpiConfig(map);
    Toast.show('KPI saqlandi ✓', 'success');
    Sheets.scheduleSync();
  }

  /* ============================================================
     TEZKOR AMAL: Restock (♻️)
     ============================================================ */
  function restock(id) {
    const s = Storage.getServices().find(x => x.id === id);
    if (!s) return;
    Modal.open(`
      <h3>♻️ Qoldiqni to'ldirish</h3>
      <p style="margin-bottom:12px"><b>${esc(s.nom)}</b> — hozir: ${s.qoldiq ?? 0}</p>
      <div class="field"><label>Yangi qoldiq (dona)</label>
        <input class="input" id="ds-rs" type="number" inputmode="numeric" min="1" value="10" autofocus></div>
      <div class="btn-row">
        <button class="btn btn-ghost" onclick="Modal.close()">Bekor</button>
        <button class="btn btn-primary" id="ds-rs-go">💾 Saqlash</button>
      </div>`);
    document.getElementById('ds-rs-go').onclick = () => {
      const q = Number(document.getElementById('ds-rs').value);
      if (!q || q <= 0) { Toast.show('Musbat son kiriting', 'error'); return; }
      Storage.updateService(id, { qoldiq: q, aktiv: true });
      Modal.close(); renderBody(); Sheets.scheduleSync();
      Toast.show(`"${s.nom}" to'ldirildi ✓`, 'success');
    };
  }

  /* ============================================================
     QAYTARISH (refund) — mavjud mantiq
     ============================================================ */
  function refund(chekRaqami) {
    const sale = Storage.getSales().find(s => s.chek_raqami === chekRaqami);
    if (!sale || sale.qaytarilgan) return;
    Modal.confirm(`Chek #${chekRaqami} (${money(sale.jami)}) qaytarilsinmi?\nTovar qoldig'i tiklanadi.`, async () => {
      Storage.updateSale(chekRaqami, { qaytarilgan: true, qaytarishTs: Date.now() });
      Storage.incrementStock(sale.items || []);
      if (sale.mijozId) {
        const c = Storage.getCustomer(sale.mijozId);
        if (c) Storage.updateCustomer(sale.mijozId, {
          jamiXarid: Math.max(0, (c.jamiXarid || 0) - sale.jami),
          xaridSoni: Math.max(0, (c.xaridSoni || 0) - 1),
          ballar: Math.max(0, (c.ballar || 0) - (sale.ballOlindi || 0) + (sale.ballSarflandi || 0)),
        });
      }
      renderBody();
      Toast.show(`Chek #${chekRaqami} qaytarildi ✓`, 'success');
      Sheets.scheduleSync();
    });
  }

  /* ============================================================
     GRAFIK
     ============================================================ */
  function dailySeries() {
    const { from, to } = rangeOf();
    const start = startOfDay(from).getTime();
    const days = Math.min(92, Math.max(1, Math.ceil((to - start) / 86400000)));
    const sales = Storage.getSales().filter(s => !s.qaytarilgan);
    const labels = [], data = [];
    for (let i = 0; i < days; i++) {
      const d0 = start + i * 86400000, d1 = d0 + 86400000;
      const sum = sales.filter(s => s.ts >= d0 && s.ts < d1).reduce((a, s) => a + s.jami, 0);
      labels.push(new Date(d0).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit' }));
      data.push(sum);
    }
    return { labels, data };
  }

  function drawChart({ labels, data }) {
    const canvas = document.getElementById('dash-chart');
    const fallback = document.getElementById('chart-fallback');
    if (!canvas) return;
    if (typeof Chart === 'undefined') {
      canvas.style.display = 'none';
      if (fallback) fallback.innerHTML = `<table style="width:100%"><tr><th>Sana</th><th>Savdo</th></tr>${
        labels.map((l, i) => `<tr><td>${l}</td><td>${money(data[i])}</td></tr>`).join('')}</table>`;
      return;
    }
    if (chartRef) chartRef.destroy();
    chartRef = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Savdo', data, backgroundColor: '#6366f1', borderRadius: 8, maxBarThickness: 46 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { ticks: { callback: v => k(v) } } },
      },
    });
  }

  return { render, refund, setMode, applyRange, setTab, setDebtView, markPaid, saveKpi, restock, searchSerial };
})();
