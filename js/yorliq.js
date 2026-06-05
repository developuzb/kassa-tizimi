/* ============================================================
   yorliq.js — SHTRIX-KOD / NARX YORLIQLARI (A4 samokleyka)
   ------------------------------------------------------------
   • Mahsulot tanlanadi + miqdor -> A4 varaqqa o'shancha yorliq
   • Ko'p xalqaro format: CODE128, EAN-13, EAN-8, UPC-A, CODE39,
     ITF-14, Codabar (JsBarcode orqali)
   • Chegirma rejimi -> rangli "sale" yorlig'i (eski narx + yangi
     narx + chegirma foizi/summasi)
   • Shtrix yo'q mahsulotga avtomatik kod generatsiya qilinadi
   Chop etish window.print() orqali (printReceipt uslubida).
   ============================================================ */

const Yorliq = (() => {
  function cur() { return Storage.getSettings().valyuta; }
  function money(n) { return Number(n).toLocaleString('uz-UZ') + ' ' + cur(); }

  // Qo'llab-quvvatlanadigan formatlar (JsBarcode)
  const FORMATS = [
    { v: 'CODE128', t: 'CODE128 (universal)' },
    { v: 'EAN13',   t: 'EAN-13' },
    { v: 'EAN8',    t: 'EAN-8' },
    { v: 'UPC',     t: 'UPC-A' },
    { v: 'CODE39',  t: 'CODE39' },
    { v: 'ITF14',   t: 'ITF-14' },
    { v: 'codabar', t: 'Codabar' },
  ];
  // Faqat raqamli formatlar uchun kerakli uzunlik
  const DIGITS_NEEDED = { EAN13: 12, EAN8: 7, UPC: 11, ITF14: 13 };

  // Tanlangan format uchun yaroqli shtrix qiymatini qaytaradi (kerak bo'lsa generatsiya)
  function ensureValue(s, format) {
    const raw = (s.shtrix || '').trim();
    const digits = raw.replace(/\D/g, '');
    const need = DIGITS_NEEDED[format];
    if (need) {
      if (digits.length >= need) return digits.slice(0, need);
      // generatsiya: vaqt asosida raqamli kod
      let gen = (Date.now() + Math.floor(Math.random() * 1e6)).toString().slice(-need);
      return gen.padStart(need, '0');
    }
    return raw || String(s.id || s.nom);
  }

  // JsBarcode -> SVG matni (xato bo'lsa CODE128 ga tushadi)
  function barcodeSVG(value, format) {
    if (typeof JsBarcode === 'undefined') return '<div style="color:#c00">JsBarcode yuklanmadi</div>';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const opt = { width: 2, height: 40, fontSize: 13, margin: 2, displayValue: true };
    try { JsBarcode(svg, String(value), { ...opt, format }); }
    catch (_) {
      try { JsBarcode(svg, String(value), { ...opt, format: 'CODE128' }); }
      catch (e) { return '<div style="color:#c00;font-size:9pt">kod xato</div>'; }
    }
    return svg.outerHTML;
  }

  /* ---------- Yorliq quruvchi oyna ---------- */
  function open(prefillId) {
    const services = Storage.getServices().filter(s => s.aktiv !== false);
    if (!services.length) { Toast.show('Avval mahsulot qo\'shing', 'error'); return; }
    const sel = prefillId || services[0].id;

    Modal.open(`
      <h3>🏷️ Shtrix / narx yorlig'i</h3>
      <div class="field"><label>Mahsulot</label>
        <select class="input" id="y-prod">
          ${services.map(s => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.nom)} — ${money(s.narx)}</option>`).join('')}
        </select></div>

      <div class="toolbar" style="margin:0 0 14px">
        <div class="field" style="flex:1;margin:0"><label>Miqdor (nechta yorliq)</label>
          <input class="input" id="y-qty" type="number" inputmode="numeric" min="1" value="1"></div>
        <div class="field" style="flex:1;margin:0"><label>Ustun (A4)</label>
          <select class="input" id="y-cols">
            <option value="2">2</option><option value="3" selected>3</option>
            <option value="4">4</option><option value="5">5</option>
          </select></div>
      </div>

      <div class="field"><label>Shtrix format</label>
        <select class="input" id="y-fmt">
          ${FORMATS.map(f => `<option value="${f.v}">${f.t}</option>`).join('')}
        </select></div>

      <label style="display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:10px">
        <input type="checkbox" id="y-price" checked style="width:auto"> Narx ko'rsatilsin</label>

      <label style="display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:10px">
        <input type="checkbox" id="y-disc" style="width:auto"> 🔖 Chegirma yorlig'i (sale)</label>

      <div id="y-disc-box" style="display:none">
        <div class="toolbar" style="margin:0 0 14px">
          <div class="field" style="flex:1;margin:0"><label>Chegirma qiymati</label>
            <input class="input" id="y-disc-val" type="number" inputmode="numeric" min="0" value="0"></div>
          <div class="field" style="flex:1;margin:0"><label>Turi</label>
            <select class="input" id="y-disc-type">
              <option value="foiz">% (foiz)</option>
              <option value="summa">${esc(cur())} (summa)</option>
            </select></div>
        </div>
      </div>

      <div class="btn-row">
        <button class="btn btn-ghost" onclick="Modal.close()">Bekor</button>
        <button class="btn btn-primary" id="y-print">🖨️ Chop etish</button>
      </div>
    `);

    const discChk = document.getElementById('y-disc');
    discChk.onchange = () => {
      document.getElementById('y-disc-box').style.display = discChk.checked ? 'block' : 'none';
    };
    document.getElementById('y-print').onclick = doPrint;
  }

  /* ---------- Chop etish ---------- */
  function doPrint() {
    const id = document.getElementById('y-prod').value;
    const s = Storage.getServices().find(x => x.id === id);
    if (!s) return;
    const qty = Math.max(1, Math.min(500, Number(document.getElementById('y-qty').value) || 1));
    const cols = Number(document.getElementById('y-cols').value) || 3;
    const format = document.getElementById('y-fmt').value;
    const showPrice = document.getElementById('y-price').checked;
    const isDisc = document.getElementById('y-disc').checked;

    // Shtrix qiymati (yo'q bo'lsa generatsiya qilib mahsulotga ham saqlaymiz)
    const value = ensureValue(s, format);
    if (!s.shtrix) { Storage.updateService(s.id, { shtrix: value }); Sheets.scheduleSync(); }
    const svg = barcodeSVG(value, format);

    // Narx / chegirma hisobi
    const eski = s.narx;
    let yangi = eski, badge = '';
    if (isDisc) {
      const dv = Number(document.getElementById('y-disc-val').value) || 0;
      const dtype = document.getElementById('y-disc-type').value;
      if (dtype === 'foiz') { yangi = Math.round(eski * (1 - dv / 100)); badge = `−${dv}%`; }
      else { yangi = Math.max(0, eski - dv); badge = `−${money(dv)}`; }
    }

    // Bitta yorliq HTML
    function labelHTML() {
      if (isDisc) {
        return `
          <div class="lbl sale">
            <div class="shop">${esc(Storage.getSettings().biznesNomi || '')}</div>
            <div class="nom">${esc(s.nom)}</div>
            <div class="prices">
              <span class="old">${money(eski)}</span>
              <span class="badge">${badge}</span>
            </div>
            <div class="new">${money(yangi)}</div>
            <div class="bc">${svg}</div>
          </div>`;
      }
      return `
        <div class="lbl">
          <div class="shop">${esc(Storage.getSettings().biznesNomi || '')}</div>
          <div class="nom">${esc(s.nom)}</div>
          ${showPrice ? `<div class="price">${money(s.narx)}</div>` : ''}
          <div class="bc">${svg}</div>
        </div>`;
    }
    const labels = Array.from({ length: qty }, labelHTML).join('');

    const html = `<!DOCTYPE html><html lang="uz"><head><meta charset="UTF-8">
      <title>Yorliqlar — ${esc(s.nom)}</title>
      <style>
        @page { size: A4; margin: 8mm; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body { font-family: Arial, sans-serif; margin: 0; }
        .sheet { display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 3mm; }
        .lbl { border: 1px dashed #bbb; border-radius: 4px; padding: 3mm 2mm; text-align: center;
               page-break-inside: avoid; display: flex; flex-direction: column; align-items: center;
               justify-content: center; gap: 1mm; min-height: 30mm; }
        .lbl .shop { font-size: 7pt; color: #666; }
        .lbl .nom { font-size: 10pt; font-weight: 700; line-height: 1.1; }
        .lbl .price { font-size: 14pt; font-weight: 800; }
        .lbl .bc svg { max-width: 100%; height: auto; }
        /* chegirma (sale) */
        .lbl.sale { border: 2px solid #e11d48; }
        .sale .prices { display: flex; align-items: center; gap: 6px; justify-content: center; }
        .sale .old { text-decoration: line-through; color: #888; font-size: 9pt; }
        .sale .badge { background: #e11d48; color: #fff; font-weight: 800; font-size: 9pt;
                       border-radius: 5px; padding: 1px 6px; }
        .sale .new { color: #e11d48; font-size: 16pt; font-weight: 900; }
      </style></head>
      <body>
        <div class="sheet">${labels}</div>
        <script>window.onload=function(){window.focus();window.print();};<\/script>
      </body></html>`;

    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) { Toast.show('Print oynasi bloklandi. Brauzer ruxsatini tekshiring.', 'error'); return; }
    w.document.write(html);
    w.document.close();
    Modal.close();
    Toast.show(`${qty} ta yorliq tayyorlandi 🖨️`, 'success');
  }

  return { open };
})();
