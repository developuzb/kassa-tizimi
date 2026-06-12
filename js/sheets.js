/* ============================================================
   sheets.js — Google Sheets integratsiyasi (tartibli snapshot)
   ------------------------------------------------------------
   MODEL: localStorage = asosiy manba. Google Sheets = tartibli
   ko'zgu. Har sinxronda ilova ma'lumotni hisoblab, har bir
   varaqni TO'LIQ qayta yozadi (replace) — shuning uchun Sheets
   doim toza, saralangan va lokal baza bilan bir xil bo'ladi.

   Yoziladigan varaqlar:
     • Mahsulotlar  — ombor holati (kam qolgan tepada)
     • Sotuvlar     — barcha cheklar (eng yangi tepada)
     • Hisobot      — kunlik xulosa (sana + filial bo'yicha)
     • Smenalar     — xodim/smena hisoboti (kamomad/ortiqcha)
     • Mijozlar     — CRM
     • Xodimlar     — xodimlar
     • Filiallar    — filiallar

   Backendsiz yozish uchun Google Apps Script Web App kerak
   (action: "replace"). Kod README.md ichida berilgan.
   Internet bo'lmasa — "dirty" bayrog'i qo'yiladi va ulanish
   tiklanganda avtomatik sinxronlanadi.
   ============================================================ */

const Sheets = (() => {

  function cfg() { return Storage.getSettings(); }

  function isConfigured() {
    const c = cfg();
    return !!(c.appsScriptUrl || (c.apiKey && c.sheetId));
  }
  function canWrite() { return !!cfg().appsScriptUrl; }

  const PAY_LABEL = { naqd: 'Naqd', karta: 'Karta', otkazma: "O'tkazma" };
  function payLabel(p) { return PAY_LABEL[p] || p || ''; }

  // ts -> 'YYYY-MM-DD' (saralash uchun ishonchli kalit)
  function dayKey(ts) {
    const d = new Date(ts);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  /* ---------- Past darajadagi yozish: varaqni qayta yozish ---------- */
  async function replaceSheet(sheet, header, rows) {
    const url = cfg().appsScriptUrl;
    if (!url) throw new Error('Apps Script URL sozlanmagan.');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'replace', sheet, header, rows }),
    });
    if (!res.ok) throw new Error('Sheets javobi: HTTP ' + res.status);
    const data = await res.json().catch(() => ({ ok: true }));
    if (data && data.ok === false) throw new Error(data.error || 'Noma\'lum xato');
    return data;
  }

  /* ---------- O'qish (import uchun) ---------- */
  async function readSheet(sheet) {
    const c = cfg();
    if (c.appsScriptUrl) {
      const u = c.appsScriptUrl + (c.appsScriptUrl.includes('?') ? '&' : '?') +
                'action=read&sheet=' + encodeURIComponent(sheet);
      const res = await fetch(u);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      return data.values || [];
    }
    if (c.apiKey && c.sheetId) {
      const u = `https://sheets.googleapis.com/v4/spreadsheets/${c.sheetId}/values/` +
                `${encodeURIComponent(sheet)}?key=${c.apiKey}`;
      const res = await fetch(u);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || ('HTTP ' + res.status));
      }
      const data = await res.json();
      return data.values || [];
    }
    throw new Error('Google Sheets sozlanmagan.');
  }

  /* ====================================================
     TARTIBLI JADVALLARNI QURISH (har biri {sheet, header, rows})
     ==================================================== */

  // 1) Mahsulotlar — ombor holati (kam qolgan tepada)
  function buildMahsulotlar() {
    const kam = cfg().kamQoldiq || 5;
    const holat = (q) => q == null ? '—' : (q <= 0 ? 'tugadi' : (q <= kam ? 'kam' : 'ok'));
    const rows = Storage.getServices()
      .slice()
      .sort((a, b) => {
        // qoldiq kuzatilayotganlar oldinda, kam qolgan eng tepada
        const qa = a.qoldiq == null ? Infinity : a.qoldiq;
        const qb = b.qoldiq == null ? Infinity : b.qoldiq;
        return qa - qb;
      })
      .map(s => [s.id, s.nom, s.kategoriya || '', s.narx, s.qoldiq ?? '', holat(s.qoldiq), s.aktiv ? 'ha' : 'yoq', s.shtrix || '']);
    return { sheet: 'Mahsulotlar', header: ['id', 'nom', 'kategoriya', 'narx', 'qoldiq', 'holat', 'aktiv', 'shtrix'], rows };
  }

  // 2) Sotuvlar — barcha cheklar, eng yangi tepada
  function buildSotuvlar() {
    const rows = Storage.getSales()
      .slice()
      .sort((a, b) => b.ts - a.ts)
      .map(s => {
        const tovarlar = (s.items || []).map(it => `${it.nom} x${it.miqdor}`).join('; ');
        const dona = (s.items || []).reduce((a, it) => a + it.miqdor, 0);
        return [
          s.chek_raqami, s.sana, s.vaqt, s.filial || '', s.xodim, s.mijoz || '',
          tovarlar, dona, s.oraliq ?? s.jami, s.chegirma || 0, s.soliq || 0,
          s.jami, payLabel(s.tolov_usuli), s.qaytarilgan ? 'QAYTARILGAN' : 'ok',
        ];
      });
    return {
      sheet: 'Sotuvlar',
      header: ['chek', 'sana', 'vaqt', 'filial', 'kassir', 'mijoz', 'tovarlar', 'dona',
               'oraliq', 'chegirma', 'soliq', 'jami', 'tolov', 'holat'],
      rows,
    };
  }

  // 3) Hisobot — kunlik xulosa (sana + filial bo'yicha)
  function buildHisobot() {
    const map = {}; // key: dayKey|filial
    Storage.getSales().forEach(s => {
      const key = dayKey(s.ts) + '|' + (s.filial || '');
      if (!map[key]) map[key] = {
        dk: dayKey(s.ts), sana: s.sana, filial: s.filial || '',
        cheklar: 0, jami: 0, naqd: 0, karta: 0, otkazma: 0, qaytSoni: 0, qaytSumma: 0,
      };
      const r = map[key];
      if (s.qaytarilgan) { r.qaytSoni++; r.qaytSumma += s.jami; return; }
      r.cheklar++; r.jami += s.jami;
      if (s.tolov_usuli === 'naqd') r.naqd += s.jami;
      else if (s.tolov_usuli === 'karta') r.karta += s.jami;
      else if (s.tolov_usuli === 'otkazma') r.otkazma += s.jami;
    });
    const rows = Object.values(map)
      .sort((a, b) => b.dk.localeCompare(a.dk) || a.filial.localeCompare(b.filial))
      .map(r => [r.sana, r.filial, r.cheklar, r.jami, r.naqd, r.karta, r.otkazma, r.qaytSoni, r.qaytSumma]);
    return {
      sheet: 'Hisobot',
      header: ['sana', 'filial', 'cheklar', 'jami_savdo', 'naqd', 'karta', 'otkazma', 'qaytarish_soni', 'qaytarilgan_summa'],
      rows,
    };
  }

  // 4) Smenalar — xodim/smena hisoboti (eng yangi tepada)
  function buildSmenalar() {
    const rows = Storage.getShifts()
      .slice()
      .reverse() // oxirgi yopilgan smena tepada
      .map(sh => [
        sh.sana, sh.filial || '', sh.xodim, sh.sotuvSoni || 0, sh.jami_sotuv || 0,
        sh.naqdSotuv || 0, sh.kartaSotuv || 0, sh.otkazmaSotuv || 0, sh.qarzSotuv || 0,
        sh.boshlandi || '', sh.tugadi || '',
        sh.boshlangichPul || 0, sh.kutilganNaqd ?? '', sh.haqiqiyNaqd ?? '', sh.farq ?? '',
      ]);
    return {
      sheet: 'Smenalar',
      header: ['sana', 'filial', 'xodim', 'cheklar', 'jami_sotuv', 'naqd_sotuv',
               'karta_sotuv', 'otkazma_sotuv', 'qarz_sotuv',
               'boshlandi', 'tugadi', 'boshlangich_pul', 'kutilgan_naqd', 'haqiqiy_naqd', 'farq'],
      rows,
    };
  }

  // 5) Mijozlar
  function buildMijozlar() {
    const rows = Storage.getCustomers()
      .slice()
      .sort((a, b) => (b.jamiXarid || 0) - (a.jamiXarid || 0))
      .map(c => [c.id, c.ism, c.telefon || '', c.ballar || 0, c.jamiXarid || 0, c.xaridSoni || 0, c.izoh || '']);
    return { sheet: 'Mijozlar', header: ['id', 'ism', 'telefon', 'ballar', 'jami_xarid', 'xarid_soni', 'izoh'], rows };
  }

  // 6) Xodimlar
  function buildXodimlar() {
    // PIN-kod maxfiy (hashlangan) — Sheetsga hech qachon chiqarilmaydi
    const rows = Storage.getEmployees().map(e =>
      [e.id, e.ism, e.lavozim || '', e.pinAuth ? '••••' : '', e.aktiv ? 'ha' : 'yoq']);
    return { sheet: 'Xodimlar', header: ['id', 'ism', 'lavozim', 'pin', 'aktiv'], rows };
  }

  // 7) Filiallar
  function buildFiliallar() {
    const rows = Storage.getBranches().map(b =>
      [b.id, b.nom, b.manzil || '', b.aktiv ? 'ha' : 'yoq']);
    return { sheet: 'Filiallar', header: ['id', 'nom', 'manzil', 'aktiv'], rows };
  }

  function buildAll() {
    return [
      buildMahsulotlar(), buildSotuvlar(), buildHisobot(),
      buildSmenalar(), buildMijozlar(), buildXodimlar(), buildFiliallar(),
    ];
  }

  /* ====================================================
     SINXRONLASH
     ==================================================== */

  // Asosiy sinxron: barcha varaqlarni tartibli qayta yozadi
  async function sync() {
    if (!canWrite()) return { ok: false, message: 'Apps Script URL sozlanmagan (yozish kerak).' };
    if (!navigator.onLine) { Storage.markDirty(); return { ok: false, offline: true, message: 'Internet yo\'q — keyin sinxronlanadi.' }; }
    try {
      for (const t of buildAll()) await replaceSheet(t.sheet, t.header, t.rows);
      Storage.clearDirty();
      return { ok: true, message: 'Google Sheets sinxronlandi ✓' };
    } catch (e) {
      Storage.markDirty();
      return { ok: false, message: 'Xato: ' + e.message };
    }
  }

  // Debounced avto-sinxron (sotuv/smena ketma-ket bo'lsa, bittaga jamlaydi)
  let timer = null;
  function scheduleSync() {
    Storage.markDirty();
    if (!cfg().autoSync || !canWrite() || !navigator.onLine) return;
    clearTimeout(timer);
    timer = setTimeout(() => { sync(); }, 1500);
  }

  // Ulanish tiklanganda / ishga tushganda — kerak bo'lsa sinxronlash
  async function syncIfNeeded() {
    if (Storage.isDirty() && navigator.onLine && canWrite()) return sync();
    return { ok: false, skipped: true };
  }

  /* ---------- Ulanishni tekshirish ---------- */
  async function testConnection() {
    if (!isConfigured()) return { ok: false, message: 'Sozlamalar to\'ldirilmagan.' };
    try {
      const rows = await readSheet('Mahsulotlar').catch(() => readSheet('Xizmatlar'));
      return { ok: true, message: `Ulandi ✓ "${rows.length ? 'Mahsulotlar' : ''}" — ${Math.max(rows.length - 1, 0)} ta yozuv.` };
    } catch (e) {
      return { ok: false, message: 'Xato: ' + e.message };
    }
  }

  /* ---------- Mahsulotlarni Sheets'dan import qilish ----------
     "Mahsulotlar" varag'i: id|nom|kategoriya|narx|qoldiq|holat|aktiv
  */
  async function importServices() {
    const rows = await readSheet('Mahsulotlar');
    const body = rows.slice(1);
    const services = body
      .filter(r => r[1]) // nom bo'sh bo'lmasin
      .map(r => ({
        id: String(r[0] || Storage.uid()),
        nom: String(r[1]),
        kategoriya: String(r[2] || 'Boshqa'),
        narx: Number(r[3]) || 0,
        qoldiq: r[4] === '' || r[4] == null ? null : Number(r[4]),
        aktiv: String(r[6]).toLowerCase() !== 'yoq' && String(r[6]).toLowerCase() !== 'false',
        shtrix: String(r[7] || ''),
        emoji: '🏷️',
      }));
    Storage.setServices(services);
    Storage.markDirty();
    return services.length;
  }

  return {
    isConfigured, canWrite, testConnection,
    replaceSheet, readSheet, importServices,
    sync, scheduleSync, syncIfNeeded, buildAll,
  };
})();
