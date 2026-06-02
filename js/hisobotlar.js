/* ============================================================
   hisobotlar.js — Modul 4: HISOBOTLAR
   • Kunlik / haftalik / oylik jami
   • Eng ko'p sotilgan xizmatlar
   • Xodimlar bo'yicha statistika
   • Chart.js grafiklari (offline bo'lsa — jadval)
   ============================================================ */

const Hisobotlar = (() => {
  let chartRef = null;
  let period = 'kun'; // kun | hafta | oy

  function money(n) { return Number(n).toLocaleString('uz-UZ') + ' ' + esc(Storage.getSettings().valyuta); }

  // Berilgan davr boshlanish vaqtini (ms) qaytaradi
  function startOf(p) {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    if (p === 'hafta') d.setDate(d.getDate() - 6);
    if (p === 'oy')    d.setDate(d.getDate() - 29);
    return d.getTime();
  }

  function render() {
    const root = document.getElementById('view-hisobot');
    root.innerHTML = `
      <h2 class="section-title">📊 Hisobotlar</h2>
      <div class="toolbar">
        <select class="input" id="rep-period" style="max-width:200px">
          <option value="kun">Bugun</option>
          <option value="hafta">So'nggi 7 kun</option>
          <option value="oy">So'nggi 30 kun</option>
        </select>
      </div>
      <div id="rep-body"></div>
    `;
    document.getElementById('rep-period').value = period;
    document.getElementById('rep-period').onchange = (e) => { period = e.target.value; renderBody(); };
    renderBody();
  }

  function renderBody() {
    const from = startOf(period);
    const allSales = Storage.getSales().filter(s => s.ts >= from);
    // Statistika faqat qaytarilmagan cheklardan
    const sales = allSales.filter(s => !s.qaytarilgan);

    const jami = sales.reduce((a, s) => a + s.jami, 0);
    const soni = sales.length;
    const ortacha = soni ? Math.round(jami / soni) : 0;

    // To'lov usullari bo'yicha
    const byPay = { naqd: 0, karta: 0, otkazma: 0 };
    sales.forEach(s => byPay[s.tolov_usuli] = (byPay[s.tolov_usuli] || 0) + s.jami);

    // Eng ko'p sotilgan xizmatlar
    const byService = {};
    sales.forEach(s => s.items.forEach(it => {
      byService[it.nom] = (byService[it.nom] || 0) + it.miqdor;
    }));
    const topServices = Object.entries(byService).sort((a, b) => b[1] - a[1]).slice(0, 7);

    // Xodimlar bo'yicha
    const byEmp = {};
    sales.forEach(s => byEmp[s.xodim] = (byEmp[s.xodim] || 0) + s.jami);
    const empStats = Object.entries(byEmp).sort((a, b) => b[1] - a[1]);

    // Kunlik dinamika (grafik uchun)
    const daily = dailySeries(sales, period);

    document.getElementById('rep-body').innerHTML = `
      <div class="stats">
        <div class="stat-card"><div class="label">Jami savdo</div><div class="value">${money(jami)}</div></div>
        <div class="stat-card"><div class="label">Cheklar soni</div><div class="value">${soni}</div></div>
        <div class="stat-card"><div class="label">O'rtacha chek</div><div class="value">${money(ortacha)}</div></div>
        <div class="stat-card"><div class="label">💵/💳/📲</div>
          <div class="value" style="font-size:14px">
            ${money(byPay.naqd)}<br>${money(byPay.karta)}<br>${money(byPay.otkazma)}</div></div>
      </div>

      <div class="cart" style="margin-bottom:16px">
        <div class="cart-head">📈 Savdo dinamikasi</div>
        <div style="padding:14px"><canvas id="rep-chart" height="160"></canvas><div id="chart-fallback"></div></div>
      </div>

      <div class="cart" style="margin-bottom:16px">
        <div class="cart-head">🏆 Eng ko'p sotilgan xizmatlar</div>
        ${topServices.length ? topServices.map(([nom, qty], i) => `
          <div class="cart-item"><span>${['🥇','🥈','🥉'][i] || '▫️'}</span>
            <span class="ci-name">${esc(nom)}</span><span class="ci-price">${qty} dona</span></div>`).join('')
          : '<p class="empty">Ma\'lumot yo\'q</p>'}
      </div>

      <div class="cart" style="margin-bottom:16px">
        <div class="cart-head">👥 Xodimlar statistikasi</div>
        ${empStats.length ? empStats.map(([nom, sum]) => `
          <div class="cart-item"><span>👤</span>
            <span class="ci-name">${esc(nom)}</span><span class="ci-price">${money(sum)}</span></div>`).join('')
          : '<p class="empty">Ma\'lumot yo\'q</p>'}
      </div>

      <div class="cart">
        <div class="cart-head">🧾 Sotuvlar tarixi (qaytarish)</div>
        ${[...allSales].sort((a, b) => b.ts - a.ts).slice(0, 50).map(s => `
          <div class="cart-item" style="${s.qaytarilgan ? 'opacity:.5' : ''}">
            <span>${s.qaytarilgan ? '↩️' : '🧾'}</span>
            <span class="ci-name">#${s.chek_raqami} • ${esc(s.vaqt)}${s.mijoz ? ' • ' + esc(s.mijoz) : ''}
              ${s.qaytarilgan ? '<b>(qaytarilgan)</b>' : ''}</span>
            <span class="ci-price">${money(s.jami)}</span>
            ${s.qaytarilgan ? '' : `<button class="icon-btn" title="Qaytarish" onclick="Hisobotlar.refund(${s.chek_raqami})">↩️</button>`}
          </div>`).join('') || '<p class="empty">Sotuvlar yo\'q</p>'}
      </div>
    `;

    drawChart(daily);
  }

  /* ---------- Qaytarish (refund) ---------- */
  function refund(chekRaqami) {
    const sale = Storage.getSales().find(s => s.chek_raqami === chekRaqami);
    if (!sale || sale.qaytarilgan) return;
    Modal.confirm(`Chek #${chekRaqami} (${money(sale.jami)}) qaytarilsinmi?\nTovar qoldig'i tiklanadi.`, async () => {
      // 1) Belgilash
      Storage.updateSale(chekRaqami, { qaytarilgan: true, qaytarishTs: Date.now() });
      // 2) Ombor qoldig'ini tiklash
      Storage.incrementStock(sale.items || []);
      // 3) Mijoz statistikasi va ballarini teskari hisoblash
      if (sale.mijozId) {
        const c = Storage.getCustomer(sale.mijozId);
        if (c) {
          Storage.updateCustomer(sale.mijozId, {
            jamiXarid: Math.max(0, (c.jamiXarid || 0) - sale.jami),
            xaridSoni: Math.max(0, (c.xaridSoni || 0) - 1),
            // olingan ballar olib tashlanadi, sarflangan ballar qaytariladi
            ballar: Math.max(0, (c.ballar || 0) - (sale.ballOlindi || 0) + (sale.ballSarflandi || 0)),
          });
        }
      }
      renderBody();
      Toast.show(`Chek #${chekRaqami} qaytarildi ✓`, 'success');
      // 4) Google Sheets'ni tartibli qayta sinxronlash
      Sheets.scheduleSync();
    });
  }

  // Davr bo'yicha kunlik summalar massivini tuzadi
  function dailySeries(sales, p) {
    const days = p === 'kun' ? 1 : p === 'hafta' ? 7 : 30;
    const labels = [], data = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      const next = d.getTime() + 86400000;
      const sum = sales.filter(s => s.ts >= d.getTime() && s.ts < next).reduce((a, s) => a + s.jami, 0);
      labels.push(d.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit' }));
      data.push(sum);
    }
    return { labels, data };
  }

  function drawChart({ labels, data }) {
    const canvas = document.getElementById('rep-chart');
    const fallback = document.getElementById('chart-fallback');
    // Chart.js yuklanmagan bo'lsa (offline) — oddiy jadval ko'rsatamiz
    if (typeof Chart === 'undefined') {
      if (canvas) canvas.style.display = 'none';
      fallback.innerHTML = `<table style="width:100%"><tr><th>Sana</th><th>Savdo</th></tr>${
        labels.map((l, i) => `<tr><td>${l}</td><td>${money(data[i])}</td></tr>`).join('')}</table>`;
      return;
    }
    if (chartRef) chartRef.destroy();
    chartRef = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Savdo', data, backgroundColor: '#3949ab', borderRadius: 6 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { ticks: { callback: v => (v / 1000) + 'k' } } },
      },
    });
  }

  return { render, refund };
})();
