/* ============================================================
   kassa.js — Modul 1: KASSA (asosiy ekran)
   Xizmatlarni tanlash -> savat -> chegirma/soliq -> mijoz ->
   to'lov -> chek -> ombor qoldig'i -> Sheets'ga yozish
   ============================================================ */

const Kassa = (() => {
  let cart = [];                          // [{ id, nom, narx, emoji, miqdor }]
  let discount = { type: 'foiz', value: 0 }; // chegirma: foiz | summa
  let customerId = null;                  // tanlangan mijoz
  let pointsRedeem = 0;                    // sarflanadigan sadoqat ballari

  function money(n) { return Number(n).toLocaleString('uz-UZ') + ' ' + esc(Storage.getSettings().valyuta); }

  /* ---------- Narx hisob-kitobi (chegirma, ball, soliq) ---------- */
  function calc() {
    const set = Storage.getSettings();
    const subtotal = cart.reduce((s, c) => s + c.narx * c.miqdor, 0);

    // 1) Chegirma
    let chegirma = discount.type === 'foiz'
      ? Math.round(subtotal * (discount.value || 0) / 100)
      : Math.min(discount.value || 0, subtotal);
    chegirma = Math.max(0, Math.min(chegirma, subtotal));

    // 2) Sadoqat ballari bilan to'lov
    const ballSumma = set.sadoqatYoq ? Math.round((pointsRedeem || 0) * set.ballNarxi) : 0;

    // 3) Soliqdan oldingi baza
    let baza = Math.max(0, subtotal - chegirma - ballSumma);

    // 4) Soliq (QQS)
    let soliq = 0, jami = baza;
    if (set.qqsYoq && set.qqsFoiz > 0) {
      if (set.qqsIchida) {
        // narx ichida — jami o'zgarmaydi, soliq ajratib ko'rsatiladi
        soliq = Math.round(baza - baza / (1 + set.qqsFoiz / 100));
        jami = baza;
      } else {
        soliq = Math.round(baza * set.qqsFoiz / 100);
        jami = baza + soliq;
      }
    }
    return { subtotal, chegirma, ballSumma, baza, soliq, jami };
  }

  function render() {
    const root = document.getElementById('view-kassa');
    const shift = Storage.getActiveShift();

    // Smena ochilmagan bo'lsa — kassani bloklaymiz
    if (!shift) {
      root.innerHTML = `
        <div class="lock-screen">
          <div class="lock-icon">🔒</div>
          <h2 class="section-title">Smena yopiq</h2>
          <p class="muted">Sotuvni boshlash uchun avval smena oching.</p>
          <div style="max-width:280px;margin:18px auto 0">
            <button class="btn btn-primary" onclick="App.go('xodimlar')">👤 Smena ochish</button>
          </div>
        </div>`;
      return;
    }

    const services = Storage.getServices().filter(s => s.aktiv);
    const cats = [...new Set(services.map(s => s.kategoriya))];

    root.innerHTML = `
      <div class="row-between">
        <h2 class="section-title">🛒 Kassa</h2>
        <span class="muted">Kassir: <b>${esc(shift.xodim)}</b></span>
      </div>

      <div class="toolbar">
        <input class="input" id="kassa-search" placeholder="🔎 Qidirish yoki shtrix-kod skaner..." />
        <select class="input" id="kassa-cat" style="max-width:160px">
          <option value="">Barchasi</option>
          ${cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
        </select>
      </div>

      <div class="kassa-layout">
        <div class="grid" id="kassa-grid"></div>
        <aside class="kassa-side"><div id="kassa-cart"></div></aside>
      </div>
      <div id="kassa-floatbar"></div>
    `;

    const searchEl = document.getElementById('kassa-search');
    searchEl.oninput = renderGrid;
    // Shtrix-kod skaner odatda "Enter" yuboradi — to'g'ridan-to'g'ri savatga qo'shamiz
    searchEl.onkeydown = (e) => { if (e.key === 'Enter') scan(); };
    document.getElementById('kassa-cat').onchange = renderGrid;
    renderGrid();
    renderCart();
  }

  function renderGrid() {
    const q = (document.getElementById('kassa-search')?.value || '').toLowerCase();
    const cat = document.getElementById('kassa-cat')?.value || '';
    const services = Storage.getServices()
      .filter(s => s.aktiv)
      .filter(s => !cat || s.kategoriya === cat)
      .filter(s => s.nom.toLowerCase().includes(q) || (s.shtrix || '').includes(q));

    const grid = document.getElementById('kassa-grid');
    if (services.length === 0) {
      grid.innerHTML = `<p class="empty" style="grid-column:1/-1">Xizmat topilmadi. Ombor bo'limidan qo'shing.</p>`;
      return;
    }
    grid.innerHTML = services.map(s => {
      const tugagan = s.qoldiq != null && s.qoldiq <= 0;
      return `
      <div class="service-card ${tugagan ? 'disabled' : ''}" ${tugagan ? '' : `onclick="Kassa.add('${s.id}')"`}>
        <span class="emoji">${esc(s.emoji) || '🏷️'}</span>
        <span class="name">${esc(s.nom)}</span>
        <span class="price">${money(s.narx)}</span>
        <span class="cat">${esc(s.kategoriya)}${s.qoldiq != null ? ` • ${tugagan ? 'tugadi' : 'qoldiq: ' + s.qoldiq}` : ''}</span>
      </div>`;
    }).join('');
  }

  function add(id) {
    const s = Storage.getServices().find(x => x.id === id);
    if (!s) return;
    const item = cart.find(c => c.id === id);
    // Qoldiq kuzatilayotgan bo'lsa — ortiqcha qo'shishni bloklaymiz
    if (s.qoldiq != null) {
      const bor = item ? item.miqdor : 0;
      if (bor >= s.qoldiq) { Toast.show(`"${s.nom}" — omborda yetarli emas (${s.qoldiq})`, 'error'); return; }
    }
    if (item) item.miqdor++;
    else cart.push({ id: s.id, nom: s.nom, narx: s.narx, emoji: s.emoji, miqdor: 1 });
    renderCart();
  }

  // Shtrix-kod skaner / qidiruv maydonidan to'g'ridan-to'g'ri savatga qo'shish
  function scan() {
    const inp = document.getElementById('kassa-search');
    const code = (inp?.value || '').trim();
    if (!code) return;
    const list = Storage.getServices().filter(s => s.aktiv);
    // 1) aniq shtrix-kod mosligi, 2) bo'lmasa nom bo'yicha yagona moslik
    let s = list.find(x => x.shtrix && x.shtrix === code);
    if (!s) {
      const byName = list.filter(x => x.nom.toLowerCase().includes(code.toLowerCase()));
      if (byName.length === 1) s = byName[0];
    }
    if (!s) { Toast.show('Tovar topilmadi: ' + code, 'error'); return; }
    add(s.id);
    inp.value = '';
    renderGrid();
  }

  function changeQty(id, delta) {
    const item = cart.find(c => c.id === id);
    if (!item) return;
    if (delta > 0) {
      const s = Storage.getServices().find(x => x.id === id);
      if (s && s.qoldiq != null && item.miqdor >= s.qoldiq) {
        Toast.show(`Omborda yetarli emas (${s.qoldiq})`, 'error'); return;
      }
    }
    item.miqdor += delta;
    if (item.miqdor <= 0) cart = cart.filter(c => c.id !== id);
    renderCart();
  }

  function total() { return calc().jami; }

  function renderCart() {
    const el = document.getElementById('kassa-cart');
    const fb = document.getElementById('kassa-floatbar');
    if (!el) return;
    if (cart.length === 0) {
      el.innerHTML = '';
      if (fb) fb.innerHTML = '';
      return;
    }

    const c = calc();
    el.innerHTML = `
      <div class="cart">
        <div class="cart-head">🧾 Savat (${cart.length})</div>
        ${cart.map(ci => `
          <div class="cart-item">
            <span>${esc(ci.emoji)}</span>
            <span class="ci-name">${esc(ci.nom)}</span>
            <span class="qty">
              <button onclick="Kassa.changeQty('${ci.id}',-1)">−</button>
              <span>${ci.miqdor}</span>
              <button onclick="Kassa.changeQty('${ci.id}',1)">+</button>
            </span>
            <span class="ci-price">${money(ci.narx * ci.miqdor)}</span>
          </div>`).join('')}
        <div class="cart-total"><span>Jami:</span><span class="val">${money(c.jami)}</span></div>
      </div>
      <div class="btn-row">
        <button class="btn btn-ghost" onclick="Kassa.clear()">🗑️ Tozalash</button>
        <button class="btn btn-primary" onclick="Kassa.checkout()">💳 To'lov (${money(c.jami)})</button>
      </div>
    `;

    // Suzuvchi savat paneli (telefonda) — doim ko'rinadi, aylantirish shart emas
    if (fb) {
      const n = cart.reduce((a, ci) => a + ci.miqdor, 0);
      fb.innerHTML = `
        <div class="cart-fab">
          <button class="cart-fab-info" onclick="Kassa.scrollToCart()">
            🧾 ${n} ta<span class="cart-fab-sum">${money(c.jami)}</span>
          </button>
          <button class="cart-fab-pay" onclick="Kassa.checkout()">💳 To'lov</button>
        </div>`;
    }
  }

  // Suzuvchi paneldan savatga "sakrash"
  function scrollToCart() {
    document.getElementById('kassa-cart')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function clear() {
    cart = [];
    discount = { type: 'foiz', value: 0 };
    customerId = null;
    pointsRedeem = 0;
    renderCart();
  }

  /* ---------- To'lov oynasi ---------- */
  function checkout() {
    if (cart.length === 0) return;
    let pay = 'naqd';
    const set = Storage.getSettings();
    const customers = Storage.getCustomers();

    Modal.open(`
      <h3>💳 To'lovni yakunlash</h3>

      <!-- Mijoz -->
      <div class="field"><label>👤 Mijoz (ixtiyoriy)</label>
        <select class="input" id="co-customer">
          <option value="">— Mijozsiz —</option>
          ${customers.map(c => `<option value="${c.id}" ${c.id === customerId ? 'selected' : ''}>${esc(c.ism)}${c.telefon ? ' • ' + esc(c.telefon) : ''}${set.sadoqatYoq ? ' • ' + (c.ballar || 0) + ' ball' : ''}</option>`).join('')}
        </select>
      </div>
      <div id="co-points-box" style="display:none">
        <div class="field"><label>⭐ Ballarni ishlatish (mavjud: <span id="co-points-have">0</span>)</label>
          <input class="input" id="co-points" type="number" inputmode="numeric" min="0" value="0" placeholder="0"></div>
      </div>

      <!-- Chegirma -->
      <div class="field"><label>🏷️ Chegirma</label>
        <div class="toolbar" style="margin:0">
          <input class="input" id="co-disc-val" type="number" inputmode="numeric" min="0" value="${discount.value || ''}" placeholder="0" style="flex:1">
          <select class="input" id="co-disc-type" style="max-width:110px">
            <option value="foiz" ${discount.type === 'foiz' ? 'selected' : ''}>%</option>
            <option value="summa" ${discount.type === 'summa' ? 'selected' : ''}>${esc(set.valyuta)}</option>
          </select>
        </div>
      </div>

      <!-- Hisob-kitob -->
      <div class="cart" style="margin:10px 0">
        <div style="padding:12px 14px" id="co-summary"></div>
      </div>

      <label class="muted" style="font-weight:600;font-size:13px">To'lov usuli</label>
      <div class="pay-options" id="pay-options">
        <div class="pay-opt selected" data-pay="naqd"><span class="emoji">💵</span>Naqd</div>
        <div class="pay-opt" data-pay="karta"><span class="emoji">💳</span>Karta</div>
        <div class="pay-opt" data-pay="otkazma"><span class="emoji">📲</span>O'tkazma</div>
      </div>
      <button class="btn btn-success" id="confirm-pay">✅ Tasdiqlash va chek</button>
    `);

    const custSel = document.getElementById('co-customer');
    const pointsBox = document.getElementById('co-points-box');
    const pointsInput = document.getElementById('co-points');
    const pointsHave = document.getElementById('co-points-have');

    function refreshPointsUI() {
      customerId = custSel.value || null;
      const cust = customerId ? Storage.getCustomer(customerId) : null;
      if (set.sadoqatYoq && cust) {
        pointsBox.style.display = 'block';
        pointsHave.textContent = cust.ballar || 0;
        pointsInput.max = cust.ballar || 0;
      } else {
        pointsBox.style.display = 'none';
        pointsRedeem = 0;
      }
      updateSummary();
    }
    function updateSummary() {
      // ballarni cheklash
      const cust = customerId ? Storage.getCustomer(customerId) : null;
      let p = Math.max(0, Math.floor(Number(pointsInput?.value) || 0));
      if (cust) p = Math.min(p, cust.ballar || 0);
      pointsRedeem = p;
      discount = {
        type: document.getElementById('co-disc-type').value,
        value: Math.max(0, Number(document.getElementById('co-disc-val').value) || 0),
      };
      const c = calc();
      const rows = [
        ['Oraliq jami', money(c.subtotal)],
        c.chegirma ? ['Chegirma', '− ' + money(c.chegirma)] : null,
        c.ballSumma ? [`Ballar (${pointsRedeem})`, '− ' + money(c.ballSumma)] : null,
        (set.qqsYoq && c.soliq) ? [`QQS ${set.qqsFoiz}%${set.qqsIchida ? ' (ichida)' : ''}`, (set.qqsIchida ? '' : '+ ') + money(c.soliq)] : null,
      ].filter(Boolean);
      document.getElementById('co-summary').innerHTML =
        rows.map(([k, v]) => `<div class="row-between"><span class="muted">${k}</span><span>${v}</span></div>`).join('') +
        `<div class="row-between" style="margin-top:6px;font-weight:800;font-size:18px">
           <span>To'lov</span><span style="color:var(--primary)">${money(c.jami)}</span></div>`;
    }

    custSel.onchange = refreshPointsUI;
    if (pointsInput) pointsInput.oninput = updateSummary;
    document.getElementById('co-disc-val').oninput = updateSummary;
    document.getElementById('co-disc-type').onchange = updateSummary;
    document.querySelectorAll('#pay-options .pay-opt').forEach(opt => {
      opt.onclick = () => {
        document.querySelectorAll('#pay-options .pay-opt').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        pay = opt.dataset.pay;
      };
    });
    document.getElementById('confirm-pay').onclick = () => finishSale(pay);

    refreshPointsUI();
  }

  async function finishSale(pay) {
    const set = Storage.getSettings();
    const shift = Storage.getActiveShift();
    const branch = Storage.getActiveBranch();
    const now = new Date();
    const c = calc();

    // Mijozga beriladigan ballar
    const ballOlindi = (set.sadoqatYoq && customerId)
      ? Math.round(c.jami * (set.sadoqatFoiz || 0) / 100) : 0;
    const cust = customerId ? Storage.getCustomer(customerId) : null;

    const sale = {
      chek_raqami: Storage.nextReceiptNo(),
      sana: now.toLocaleDateString('uz-UZ'),
      vaqt: now.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }),
      xodim: shift.xodim,
      xodimId: shift.xodimId,
      filial: branch ? branch.nom : (shift.filial || ''),
      filialId: branch ? branch.id : (shift.filialId || ''),
      mijozId: customerId,
      mijoz: cust ? cust.ism : '',
      items: cart.map(ci => ({ id: ci.id, nom: ci.nom, narx: ci.narx, miqdor: ci.miqdor })),
      oraliq: c.subtotal,
      chegirma: c.chegirma,
      ballSarflandi: pointsRedeem,
      ballOlindi: ballOlindi,
      soliq: c.soliq,
      jami: c.jami,
      tolov_usuli: pay,
      qaytarilgan: false,
      ts: now.getTime(),
    };

    // 1) Avval lokalga saqlaymiz (offline kafolat)
    Storage.addSale(sale);

    // 2) Ombor qoldig'ini kamaytiramiz
    Storage.decrementStock(sale.items);

    // 3) Mijoz statistikasi va ballari
    if (customerId) {
      if (pointsRedeem) Storage.spendCustomerPoints(customerId, pointsRedeem);
      Storage.recordCustomerPurchase(customerId, c.jami, ballOlindi);
    }

    // 4) Ochiq smena summasini yangilaymiz
    shift.jami_sotuv = (shift.jami_sotuv || 0) + sale.jami;
    shift.sotuvSoni = (shift.sotuvSoni || 0) + 1;
    if (pay === 'naqd') shift.naqdSotuv = (shift.naqdSotuv || 0) + sale.jami;
    Storage.setActiveShift(shift);

    Modal.close();
    const printed = sale.items.slice();
    const saleCopy = { ...sale, ballOlindi };
    clear();
    render();
    printReceipt(saleCopy, printed);

    // 5) Kam qolgan tovar ogohlantirishi
    const low = Storage.lowStock();
    if (low.length) Toast.show(`⚠️ Kam qoldi: ${low.map(s => s.nom).join(', ')}`, 'error');

    // 6) Google Sheets'ga tartibli sinxron (fon rejimida, debounced)
    Sheets.scheduleSync();
    Toast.show('Sotuv saqlandi ✓', 'success');
    App.refreshHeader();
  }

  /* ---------- Chek chiqarish (print / PDF) ---------- */
  function printReceipt(sale, items) {
    const set = Storage.getSettings();
    const win = window.open('', '_blank', 'width=380,height=600');
    if (!win) { Toast.show('Print oynasi bloklandi. Brauzer ruxsatini tekshiring.', 'error'); return; }
    const payLabel = { naqd: 'Naqd', karta: 'Karta', otkazma: "O'tkazma" }[sale.tolov_usuli] || sale.tolov_usuli;
    const extra = [
      sale.chegirma ? `<tr><td>Chegirma:</td><td class="r">− ${sale.chegirma.toLocaleString('uz-UZ')}</td></tr>` : '',
      sale.ballSarflandi ? `<tr><td>Ball ishlatildi:</td><td class="r">${sale.ballSarflandi}</td></tr>` : '',
      (set.qqsYoq && sale.soliq) ? `<tr><td>QQS ${set.qqsFoiz}%:</td><td class="r">${sale.soliq.toLocaleString('uz-UZ')}</td></tr>` : '',
    ].join('');
    win.document.write(`
      <html><head><meta charset="utf-8"><title>Chek #${sale.chek_raqami}</title>
      <style>
        body{font-family:monospace;width:280px;margin:0 auto;padding:10px;color:#000}
        h2{text-align:center;margin:4px 0}
        .center{text-align:center} .line{border-top:1px dashed #000;margin:8px 0}
        table{width:100%;font-size:13px;border-collapse:collapse}
        td{padding:2px 0;vertical-align:top} .r{text-align:right}
        .total{font-size:16px;font-weight:bold}
      </style></head><body onload="window.print()">
        <h2>${esc(set.biznesNomi)}</h2>
        <div class="center">Chek #${sale.chek_raqami}</div>
        <div class="center">${esc(sale.sana)} ${esc(sale.vaqt)}</div>
        <div class="center">Kassir: ${esc(sale.xodim)}</div>
        ${sale.mijoz ? `<div class="center">Mijoz: ${esc(sale.mijoz)}</div>` : ''}
        <div class="line"></div>
        <table>
          ${items.map(c => `
            <tr><td>${esc(c.nom)}</td></tr>
            <tr><td>${c.miqdor} x ${Number(c.narx).toLocaleString('uz-UZ')}</td>
                <td class="r">${(c.narx*c.miqdor).toLocaleString('uz-UZ')}</td></tr>`).join('')}
        </table>
        <div class="line"></div>
        <table>
          ${extra}
          <tr class="total"><td>JAMI:</td>
          <td class="r">${sale.jami.toLocaleString('uz-UZ')} ${esc(set.valyuta)}</td></tr>
          <tr><td>To'lov:</td><td class="r">${payLabel}</td></tr>
          ${sale.ballOlindi ? `<tr><td>Ball qo'shildi:</td><td class="r">+${sale.ballOlindi}</td></tr>` : ''}
        </table>
        <div class="line"></div>
        <div class="center">Rahmat! Yana keling 🙂</div>
      </body></html>`);
    win.document.close();
  }

  return { render, add, scan, changeQty, clear, checkout, scrollToCart };
})();
