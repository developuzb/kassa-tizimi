/* ============================================================
   mijozlar.js — Modul 6: MIJOZLAR (CRM)
   • Mijozlar ro'yxati (ism, telefon, izoh)
   • Sadoqat ballari (loyalty)
   • Xarid tarixi va statistikasi
   ============================================================ */

const Mijozlar = (() => {
  function money(n) { return Number(n).toLocaleString('uz-UZ') + ' ' + esc(Storage.getSettings().valyuta); }

  function render() {
    const root = document.getElementById('view-mijoz');
    root.innerHTML = `
      <h2 class="section-title">🙋 Mijozlar</h2>
      <div class="toolbar">
        <input class="input" id="mij-search" placeholder="🔎 Ism yoki telefon..." />
        <button class="btn btn-primary" style="width:auto" onclick="Mijozlar.form()">➕ Mijoz</button>
      </div>
      <div id="mij-list"></div>
    `;
    document.getElementById('mij-search').oninput = renderList;
    renderList();
  }

  function renderList() {
    const q = (document.getElementById('mij-search')?.value || '').toLowerCase();
    const set = Storage.getSettings();
    const list = Storage.getCustomers().filter(c =>
      c.ism.toLowerCase().includes(q) || (c.telefon || '').includes(q));
    const el = document.getElementById('mij-list');
    if (list.length === 0) { el.innerHTML = `<p class="empty">Mijoz yo'q. "Mijoz" tugmasi orqali qo'shing.</p>`; return; }

    // Eng ko'p xarid qilganlar yuqorida
    list.sort((a, b) => (b.jamiXarid || 0) - (a.jamiXarid || 0));

    el.innerHTML = list.map(c => `
      <div class="list-item">
        <div>
          <div class="li-main">🙋 ${esc(c.ism)}
            ${set.sadoqatYoq ? `<span class="badge on">⭐ ${c.ballar || 0} ball</span>` : ''}
          </div>
          <div class="li-sub">${esc(c.telefon) || 'telefon yo\'q'} • ${c.xaridSoni || 0} ta xarid • ${money(c.jamiXarid || 0)}</div>
        </div>
        <div>
          <button class="icon-btn" title="Tarix" onclick="Mijozlar.history('${c.id}')">📜</button>
          <button class="icon-btn" title="Tahrirlash" onclick="Mijozlar.form('${c.id}')">✏️</button>
          <button class="icon-btn" title="O'chirish" onclick="Mijozlar.remove('${c.id}')">🗑️</button>
        </div>
      </div>`).join('');
  }

  /* ---------- Qo'shish / Tahrirlash ---------- */
  function form(id) {
    const c = id ? Storage.getCustomer(id) : null;
    Modal.open(`
      <h3>${c ? '✏️ Mijozni tahrirlash' : '➕ Yangi mijoz'}</h3>
      <div class="field"><label>Ism *</label>
        <input class="input" id="m-ism" value="${esc(c?.ism)}" placeholder="Dilnoza Karimova"></div>
      <div class="field"><label>Telefon</label>
        <input class="input" id="m-tel" inputmode="tel" value="${esc(c?.telefon)}" placeholder="+998 90 123 45 67"></div>
      <div class="field"><label>Izoh (ixtiyoriy)</label>
        <input class="input" id="m-izoh" value="${esc(c?.izoh)}" placeholder="masalan: doimiy mijoz"></div>
      ${c ? `<div class="field"><label>Sadoqat ballari</label>
        <input class="input" id="m-ball" type="number" inputmode="numeric" value="${c.ballar || 0}"></div>` : ''}
      <button class="btn btn-primary" id="m-save">💾 Saqlash</button>
    `);
    document.getElementById('m-save').onclick = () => {
      const ism = document.getElementById('m-ism').value.trim();
      if (!ism) { Toast.show('Ismni kiriting', 'error'); return; }
      const data = {
        ism,
        telefon: document.getElementById('m-tel').value.trim(),
        izoh: document.getElementById('m-izoh').value.trim(),
      };
      if (c) {
        data.ballar = Math.max(0, Number(document.getElementById('m-ball').value) || 0);
        Storage.updateCustomer(c.id, data);
      } else {
        Storage.addCustomer(data);
      }
      Modal.close();
      renderList();
      Sheets.scheduleSync();
      Toast.show('Saqlandi ✓', 'success');
    };
  }

  function remove(id) {
    const c = Storage.getCustomer(id);
    Modal.confirm(`"${c?.ism}" o'chirilsinmi?`, () => {
      Storage.deleteCustomer(id);
      renderList();
      Sheets.scheduleSync();
      Toast.show('O\'chirildi', 'success');
    });
  }

  /* ---------- Xarid tarixi ---------- */
  function history(id) {
    const c = Storage.getCustomer(id);
    if (!c) return;
    const sales = Storage.getSales()
      .filter(s => s.mijozId === id)
      .sort((a, b) => b.ts - a.ts);
    Modal.open(`
      <h3>📜 ${esc(c.ism)}</h3>
      <div class="cart" style="margin-bottom:12px"><div style="padding:12px 14px">
        <div class="row-between"><span class="muted">Telefon:</span><b>${esc(c.telefon) || '—'}</b></div>
        <div class="row-between"><span class="muted">Jami xarid:</span><b>${money(c.jamiXarid || 0)}</b></div>
        <div class="row-between"><span class="muted">Xaridlar soni:</span><b>${c.xaridSoni || 0}</b></div>
        <div class="row-between"><span class="muted">Ballar:</span><b style="color:var(--primary)">⭐ ${c.ballar || 0}</b></div>
      </div></div>
      <div style="max-height:300px;overflow:auto">
        ${sales.length ? sales.map(s => `
          <div class="cart-item" style="${s.qaytarilgan ? 'opacity:.5' : ''}">
            <span>${s.qaytarilgan ? '↩️' : '🧾'}</span>
            <span class="ci-name">#${s.chek_raqami} • ${s.sana} ${s.vaqt}${s.qaytarilgan ? ' (qaytarilgan)' : ''}</span>
            <span class="ci-price">${money(s.jami)}</span>
          </div>`).join('') : '<p class="empty">Xaridlar yo\'q</p>'}
      </div>
    `);
  }

  return { render, form, remove, history };
})();
