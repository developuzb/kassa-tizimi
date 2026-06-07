/* ============================================================
   xodimlar.js — Modul 3: XODIMLAR VA SMENALAR
   • Xodimlar ro'yxati (ism, lavozim, PIN)
   • Smena ochish (PIN bilan) / yopish
   • Har bir xodimning sotuvlari
   • Smena yopilganda hisobot Google Sheets'ga yoziladi
   ============================================================ */

const Xodimlar = (() => {
  function money(n) { return Number(n).toLocaleString('uz-UZ') + ' ' + esc(Storage.getSettings().valyuta); }

  // Kassada bo'lishi kerak bo'lgan naqd pul
  function expectedCash(shift) {
    return (shift.boshlangichPul || 0) + (shift.naqdSotuv || 0)
         + (shift.naqdKirim || 0) - (shift.naqdChiqim || 0);
  }

  function render() {
    const root = document.getElementById('view-xodimlar');
    const shift = Storage.getActiveShift();

    root.innerHTML = `
      <h2 class="section-title">👥 Xodimlar va Smenalar</h2>
      <div id="shift-box"></div>
      <div class="row-between" style="margin:18px 0 10px">
        <b>Xodimlar ro'yxati</b>
        <button class="btn btn-primary" style="width:auto" onclick="Xodimlar.form()">➕ Xodim</button>
      </div>
      <div id="emp-list"></div>
    `;
    renderShiftBox();
    renderList();
  }

  /* ---------- Smena bloki ---------- */
  function renderShiftBox() {
    const box = document.getElementById('shift-box');
    const shift = Storage.getActiveShift();
    if (shift) {
      const kutilganNaqd = expectedCash(shift);
      box.innerHTML = `
        <div class="cart">
          <div class="cart-head">🟢 Ochiq smena</div>
          <div style="padding:14px">
            <div class="row-between"><span class="muted">Xodim:</span><b>${esc(shift.xodim)}</b></div>
            <div class="row-between"><span class="muted">Boshlandi:</span><b>${esc(shift.boshlandi)}</b></div>
            <div class="row-between"><span class="muted">Sotuvlar soni:</span><b>${shift.sotuvSoni || 0}</b></div>
            <div class="row-between"><span class="muted">Jami summa:</span><b style="color:var(--primary)">${money(shift.jami_sotuv || 0)}</b></div>
            <div class="row-between"><span class="muted">💰 Ish haqi (KPI):</span><b style="color:var(--success)">${money(shift.ishHaqi || 0)}</b></div>
            <div style="border-top:1px solid var(--hairline);margin:10px 0"></div>
            <div class="row-between"><span class="muted">Boshlang'ich pul:</span><b>${money(shift.boshlangichPul || 0)}</b></div>
            <div class="row-between"><span class="muted">Naqd sotuv:</span><b>${money(shift.naqdSotuv || 0)}</b></div>
            <div class="row-between"><span class="muted">Kassa kirim/chiqim:</span><b>+${money(shift.naqdKirim || 0)} / −${money(shift.naqdChiqim || 0)}</b></div>
            <div class="row-between"><span class="muted">Kassada bo'lishi kerak:</span><b style="color:var(--primary)">${money(kutilganNaqd)}</b></div>
            <div class="btn-row" style="margin-top:12px">
              <button class="btn btn-ghost" style="width:auto" onclick="Xodimlar.cashMove('kirim')">➕ Kassaga pul</button>
              <button class="btn btn-ghost" style="width:auto" onclick="Xodimlar.cashMove('chiqim')">➖ Kassadan pul</button>
            </div>
            <button class="btn btn-danger" style="margin-top:10px" onclick="Xodimlar.closeShift()">🔴 Smenani yopish</button>
          </div>
        </div>`;
    } else {
      box.innerHTML = `
        <div class="list-item">
          <div><div class="li-main">⚪ Smena yopiq</div>
            <div class="li-sub">Kassada ishlash uchun smena oching</div></div>
          <button class="btn btn-success" style="width:auto" onclick="Xodimlar.openShift()">▶️ Ochish</button>
        </div>`;
    }
  }

  /* ---------- Smena ochish (PIN tekshiruvi bilan) ---------- */
  function openShift() {
    const emps = Storage.getEmployees().filter(e => e.aktiv);
    if (emps.length === 0) { Toast.show('Avval xodim qo\'shing', 'error'); return; }
    Modal.open(`
      <h3>▶️ Smena ochish</h3>
      <div class="field"><label>Xodim</label>
        <select class="input" id="sh-emp">
          ${emps.map(e => `<option value="${e.id}">${esc(e.ism)} — ${esc(e.lavozim)}</option>`).join('')}
        </select></div>
      <div class="field"><label>PIN-kod</label>
        <input class="input" id="sh-pin" type="password" inputmode="numeric" placeholder="****"></div>
      <div class="field"><label>Boshlang'ich kassa puli (ixtiyoriy)</label>
        <input class="input" id="sh-cash" type="number" inputmode="numeric" min="0" placeholder="0"></div>
      <button class="btn btn-success" id="sh-go">Smenani boshlash</button>
    `);
    document.getElementById('sh-go').onclick = async () => {
      const id = document.getElementById('sh-emp').value;
      const pin = document.getElementById('sh-pin').value.trim();
      const emp = Storage.getEmployees().find(e => e.id === id);
      if (!emp || !(await Security.verify(pin, emp.pinAuth))) { Toast.show('PIN noto\'g\'ri', 'error'); return; }
      const now = new Date();
      const branch = Storage.getActiveBranch();
      Storage.setActiveShift({
        xodim: emp.ism, xodimId: emp.id,
        filial: branch ? branch.nom : '', filialId: branch ? branch.id : '',
        sana: now.toLocaleDateString('uz-UZ'),
        boshlandi: now.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }),
        jami_sotuv: 0, sotuvSoni: 0, startTs: now.getTime(),
        boshlangichPul: Math.max(0, Number(document.getElementById('sh-cash').value) || 0),
        naqdSotuv: 0, naqdKirim: 0, naqdChiqim: 0,
        ishHaqi: 0,
      });
      Modal.close();
      render();
      App.refreshHeader();
      Toast.show(`Smena ochildi: ${emp.ism}`, 'success');
    };
  }

  /* ---------- Kassaga pul kirim/chiqim ---------- */
  function cashMove(turi) {
    const shift = Storage.getActiveShift();
    if (!shift) return;
    const kirim = turi === 'kirim';
    Modal.open(`
      <h3>${kirim ? '➕ Kassaga pul qo\'shish' : '➖ Kassadan pul olish'}</h3>
      <div class="field"><label>Summa (${esc(Storage.getSettings().valyuta)})</label>
        <input class="input" id="cm-sum" type="number" inputmode="numeric" min="0" placeholder="0"></div>
      <div class="field"><label>Izoh (ixtiyoriy)</label>
        <input class="input" id="cm-note" placeholder="${kirim ? 'masalan: ust pul' : 'masalan: ta\'minotchiga'}"></div>
      <button class="btn btn-primary" id="cm-go">Saqlash</button>
    `);
    document.getElementById('cm-go').onclick = () => {
      const sum = Math.max(0, Number(document.getElementById('cm-sum').value) || 0);
      if (!sum) { Toast.show('Summani kiriting', 'error'); return; }
      if (kirim) shift.naqdKirim = (shift.naqdKirim || 0) + sum;
      else       shift.naqdChiqim = (shift.naqdChiqim || 0) + sum;
      Storage.setActiveShift(shift);
      Modal.close();
      renderShiftBox();
      Toast.show('Saqlandi ✓', 'success');
    };
  }

  /* ---------- Smena yopish (kassa hisob-kitobi bilan) ---------- */
  function closeShift() {
    const shift = Storage.getActiveShift();
    if (!shift) return;
    const kutilgan = expectedCash(shift);
    Modal.open(`
      <h3>🔴 Smenani yopish</h3>
      <div class="cart" style="margin-bottom:12px"><div style="padding:12px 14px">
        <div class="row-between"><span class="muted">Jami sotuv:</span><b>${money(shift.jami_sotuv || 0)}</b></div>
        <div class="row-between"><span class="muted">Sotuvlar soni:</span><b>${shift.sotuvSoni || 0}</b></div>
        <div class="row-between"><span class="muted">Ish haqi (KPI):</span><b style="color:var(--success)">${money(shift.ishHaqi || 0)}</b></div>
        <div class="row-between"><span class="muted">Kassada bo'lishi kerak (naqd):</span><b style="color:var(--primary)">${money(kutilgan)}</b></div>
      </div></div>
      <div class="field"><label>Kassadagi haqiqiy naqd pul (sanang)</label>
        <input class="input" id="cs-real" type="number" inputmode="numeric" min="0" value="${kutilgan}"></div>
      <div id="cs-diff" class="muted" style="margin-bottom:10px;font-size:13px"></div>
      <button class="btn btn-danger" id="cs-go">Smenani yopish va hisobot</button>
    `);
    const realInput = document.getElementById('cs-real');
    const diffEl = document.getElementById('cs-diff');
    function showDiff() {
      const real = Number(realInput.value) || 0;
      const farq = real - kutilgan;
      diffEl.textContent = farq === 0 ? '✅ Mos keldi' :
        (farq > 0 ? `▲ Ortiqcha: ${money(farq)}` : `▼ Kamomad: ${money(-farq)}`);
      diffEl.style.color = farq === 0 ? 'var(--success)' : 'var(--danger)';
    }
    realInput.oninput = showDiff; showDiff();

    document.getElementById('cs-go').onclick = async () => {
      const now = new Date();
      const haqiqiy = Number(realInput.value) || 0;
      const record = {
        sana: shift.sana,
        xodim: shift.xodim,
        filial: shift.filial || '', filialId: shift.filialId || '',
        boshlandi: shift.boshlandi,
        tugadi: now.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }),
        jami_sotuv: shift.jami_sotuv || 0,
        sotuvSoni: shift.sotuvSoni || 0,
        boshlangichPul: shift.boshlangichPul || 0,
        naqdSotuv: shift.naqdSotuv || 0,
        naqdKirim: shift.naqdKirim || 0,
        naqdChiqim: shift.naqdChiqim || 0,
        ishHaqi: shift.ishHaqi || 0,
        kutilganNaqd: kutilgan,
        haqiqiyNaqd: haqiqiy,
        farq: haqiqiy - kutilgan,
      };
      Storage.addShift(record);
      Storage.clearActiveShift();
      Modal.close();
      render();
      App.refreshHeader();

      // Smena hisobotini Sheets'ga tartibli sinxron qilamiz
      Sheets.scheduleSync();
      Toast.show('Smena yopildi ✓', 'success');
    };
  }

  /* ---------- Xodimlar ro'yxati ---------- */
  function renderList() {
    const el = document.getElementById('emp-list');
    const emps = Storage.getEmployees();
    if (emps.length === 0) { el.innerHTML = `<p class="empty">Xodim yo'q.</p>`; return; }

    // Har bir xodimning bugungi sotuvlari
    const today = new Date().toLocaleDateString('uz-UZ');
    const sales = Storage.getSales();

    el.innerHTML = emps.map(e => {
      const todaySum = sales
        .filter(s => s.xodimId === e.id && s.sana === today)
        .reduce((a, s) => a + s.jami, 0);
      return `
      <div class="list-item">
        <div>
          <div class="li-main">👤 ${esc(e.ism)}
            <span class="badge ${e.aktiv ? 'on' : 'off'}">${e.aktiv ? 'Aktiv' : 'O\'chiq'}</span>
          </div>
          <div class="li-sub">${esc(e.lavozim)} • Bugun: ${money(todaySum)}</div>
        </div>
        <div>
          <button class="icon-btn" onclick="Xodimlar.form('${e.id}')">✏️</button>
          <button class="icon-btn" onclick="Xodimlar.remove('${e.id}')">🗑️</button>
        </div>
      </div>`;
    }).join('');
  }

  /* ---------- Xodim qo'shish/tahrirlash ---------- */
  function form(id) {
    const e = id ? Storage.getEmployees().find(x => x.id === id) : null;
    Modal.open(`
      <h3>${e ? '✏️ Xodimni tahrirlash' : '➕ Yangi xodim'}</h3>
      <div class="field"><label>Ism *</label>
        <input class="input" id="e-ism" value="${esc(e?.ism)}" placeholder="Aziz Karimov"></div>
      <div class="field"><label>Lavozim</label>
        <input class="input" id="e-lav" value="${esc(e?.lavozim)}" placeholder="Kassir"></div>
      <div class="field"><label>PIN-kod (4-6 raqam)${e ? '' : ' *'}</label>
        <input class="input" id="e-pin" type="password" inputmode="numeric" maxlength="6" placeholder="${e ? 'o\'zgartirmaslik uchun bo\'sh qoldiring' : '1234'}"></div>
      <div class="field"><label>Holati</label>
        <select class="input" id="e-aktiv">
          <option value="true" ${e?.aktiv !== false ? 'selected' : ''}>Aktiv</option>
          <option value="false" ${e?.aktiv === false ? 'selected' : ''}>O'chiq</option>
        </select></div>
      <button class="btn btn-primary" id="e-save">💾 Saqlash</button>
    `);
    document.getElementById('e-save').onclick = async () => {
      const ism = document.getElementById('e-ism').value.trim();
      const pin = document.getElementById('e-pin').value.trim();
      if (!ism) { Toast.show('Ismni kiriting', 'error'); return; }
      // Yangi xodimga PIN majburiy; tahrirlashda bo'sh = eski PIN saqlanadi
      if (!e && pin.length < 4) { Toast.show('PIN kamida 4 raqam', 'error'); return; }
      if (pin && pin.length < 4) { Toast.show('PIN kamida 4 raqam', 'error'); return; }
      const data = {
        ism,
        lavozim: document.getElementById('e-lav').value.trim() || 'Xodim',
        aktiv: document.getElementById('e-aktiv').value === 'true',
      };
      if (pin) data.pinAuth = await Security.make(pin);
      if (e) Storage.updateEmployee(e.id, data);
      else   Storage.addEmployee(data);
      Modal.close();
      renderList();
      Sheets.scheduleSync();
      Toast.show('Saqlandi ✓', 'success');
    };
  }

  function remove(id) {
    const e = Storage.getEmployees().find(x => x.id === id);
    Modal.confirm(`"${e?.ism}" o'chirilsinmi?`, () => {
      Storage.deleteEmployee(id);
      renderList();
      Sheets.scheduleSync();
      Toast.show('O\'chirildi', 'success');
    });
  }

  return { render, openShift, closeShift, cashMove, form, remove };
})();
