/* ============================================================
   yorliq.js — SHTRIX-KOD / NARX YORLIQLARI (A4 samokleyka)
   ------------------------------------------------------------
   3 maqsadli o'lcham — har biri alohida DIZAYN bilan:
     • rasta  — javon/rasta narxchasi: ixcham, tez o'qiladigan
     • orta   — mahsulot yorlig'i: brend sarlavhali, muvozanatli
     • keng   — savdo afishasi: diqqatni tortib savdoni oshiruvchi
                yirik chegirma/aksiya posteri
   Xususiyatlar:
     • Ko'p xalqaro format: CODE128, EAN-13/8, UPC-A, CODE39, ITF-14, Codabar
     • Chegirma rejimi -> rangli "sale" yorlig'i (eski/yangi narx, tejam)
     • Shtrix yo'q mahsulotga avtomatik kod generatsiya qilinadi
     • Jonli NAMUNA (live preview) chop etishdan oldin
   Chop etish window.print() orqali.
   ============================================================ */

const Yorliq = (() => {
  function cur() { return Storage.getSettings().valyuta; }
  function money(n) { return Number(n).toLocaleString('uz-UZ') + ' ' + cur(); }
  function shopName() { return Storage.getSettings().biznesNomi || ''; }

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
  const DIGITS_NEEDED = { EAN13: 12, EAN8: 7, UPC: 11, ITF14: 13 };

  // 3 maqsadli o'lcham. cols — A4'da ustunlar; pw — namuna kengligi; bcH — shtrix balandligi
  const SIZES = {
    rasta: { t: 'Narxcha — rasta',          desc: "Javon/rastada narxni tez ko'rsatish uchun ixcham yorliq", cols: 4, pw: '46mm', minH: '30mm', bcH: 24 },
    orta:  { t: "O'rtacha — mahsulot yorlig'i", desc: 'Mahsulotni belgilash uchun brend sarlavhali muvozanatli yorliq', cols: 3, pw: '62mm', minH: '44mm', bcH: 38 },
    keng:  { t: 'Katta — savdo afishasi',   desc: "Diqqatni tortib savdoni oshiruvchi yirik chegirma/aksiya yorlig'i", cols: 2, pw: '96mm', minH: '74mm', bcH: 54 },
  };

  // Tanlangan format uchun yaroqli shtrix qiymatini qaytaradi (kerak bo'lsa generatsiya)
  function ensureValue(s, format) {
    const raw = (s.shtrix || '').trim();
    const digits = raw.replace(/\D/g, '');
    const need = DIGITS_NEEDED[format];
    if (need) {
      if (digits.length >= need) return digits.slice(0, need);
      let gen = (Date.now() + Math.floor(Math.random() * 1e6)).toString().slice(-need);
      return gen.padStart(need, '0');
    }
    return raw || String(s.id || s.nom);
  }

  // JsBarcode -> SVG matni (xato bo'lsa CODE128 ga tushadi)
  function barcodeSVG(value, format, height) {
    if (typeof JsBarcode === 'undefined') return '<div style="color:#c00;font-size:8pt">JsBarcode yuklanmadi</div>';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const opt = { width: 2, height: height || 40, fontSize: 12, margin: 2, displayValue: true };
    try { JsBarcode(svg, String(value), { ...opt, format }); }
    catch (_) {
      try { JsBarcode(svg, String(value), { ...opt, format: 'CODE128' }); }
      catch (e) { return '<div style="color:#c00;font-size:8pt">kod xato</div>'; }
    }
    return svg.outerHTML;
  }

  /* ============================================================
     YORLIQ SHABLONLARI — har o'lcham o'z maqsadiga muvofiq dizayn
     d = { shop, nom, narxStr, eskiStr, yangiStr, savingStr, badge,
           isDisc, showPrice, svg, minH }
     Barcha uslublar inline — namuna ham, chop etish ham bir xil chiqadi.
     ============================================================ */

  // 1) RASTA NARXCHASI — ixcham, tez o'qiladigan javon yorlig'i
  function tplRasta(d) {
    const accent = d.isDisc ? '#e11d48' : '#4f46e5';
    const head = `<div style="background:${accent};color:#fff;font-size:6pt;font-weight:800;letter-spacing:.4px;text-transform:uppercase;padding:1.4mm 1mm;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d.shop || 'NARX')}</div>`;
    const price = d.isDisc
      ? `<div style="display:flex;align-items:baseline;gap:4px;justify-content:center;flex-wrap:wrap">
           <span style="text-decoration:line-through;color:#9ca3af;font-size:8pt">${d.eskiStr}</span>
           <span style="background:#e11d48;color:#fff;font-weight:900;font-size:7pt;border-radius:4px;padding:0 4px">${d.badge}</span>
         </div>
         <div style="color:#e11d48;font-size:15pt;font-weight:900;line-height:1;margin-top:.5mm">${d.yangiStr}</div>`
      : (d.showPrice ? `<div style="font-size:15pt;font-weight:900;color:#0f172a;line-height:1">${d.narxStr}</div>` : '');
    return `<div style="min-height:${d.minH};display:flex;flex-direction:column;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;font-family:Arial,sans-serif;background:#fff">
      ${head}
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1mm;padding:1.5mm 1.5mm 1mm">
        <div style="font-size:8pt;font-weight:700;line-height:1.1;color:#111;text-align:center">${esc(d.nom)}</div>
        ${price}
        <div style="width:100%;margin-top:auto">${d.svg}</div>
      </div>
    </div>`;
  }

  // 2) O'RTACHA — brend sarlavhali, muvozanatli mahsulot yorlig'i
  function tplOrta(d) {
    const grad = d.isDisc ? '#e11d48,#f59e0b' : '#4f46e5,#7c3aed';
    const head = `<div style="background:linear-gradient(135deg,${grad});color:#fff;font-size:8pt;font-weight:800;letter-spacing:.5px;text-transform:uppercase;padding:2mm;text-align:center">${esc(d.shop || '')}</div>`;
    const price = d.isDisc
      ? `<div style="display:flex;align-items:center;gap:6px;justify-content:center">
           <span style="text-decoration:line-through;color:#94a3b8;font-size:10pt">${d.eskiStr}</span>
           <span style="background:#e11d48;color:#fff;font-weight:900;font-size:9pt;border-radius:6px;padding:1px 7px">${d.badge}</span>
         </div>
         <div style="color:#e11d48;font-size:20pt;font-weight:900;line-height:1.05">${d.yangiStr}</div>`
      : (d.showPrice ? `<div style="font-size:20pt;font-weight:900;color:#0f172a;line-height:1.05">${d.narxStr}</div>` : '');
    return `<div style="min-height:${d.minH};display:flex;flex-direction:column;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;font-family:Arial,sans-serif;background:#fff">
      ${head}
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.5mm;padding:2.5mm">
        <div style="font-size:11pt;font-weight:800;line-height:1.15;color:#0f172a;text-align:center">${esc(d.nom)}</div>
        ${price}
        <div style="width:100%;margin-top:auto">${d.svg}</div>
      </div>
    </div>`;
  }

  // 3) KENG — SAVDO AFISHASI: diqqatni tortib sotuvni oshiruvchi poster
  function tplKeng(d) {
    if (d.isDisc) {
      return `<div style="min-height:${d.minH};display:flex;flex-direction:column;border:3px solid #e11d48;border-radius:12px;overflow:hidden;font-family:Arial,sans-serif;background:#fff;box-shadow:inset 0 0 0 1px #fff">
        <div style="background:linear-gradient(135deg,#e11d48,#f59e0b);color:#fff;padding:3mm 2mm;text-align:center">
          <div style="font-size:15pt;font-weight:900;letter-spacing:2px;line-height:1">🔥 CHEGIRMA</div>
          ${d.shop ? `<div style="font-size:7pt;font-weight:700;opacity:.92;margin-top:1mm;letter-spacing:.5px;text-transform:uppercase">${esc(d.shop)}</div>` : ''}
        </div>
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2mm;padding:3mm 3mm 2mm">
          <div style="font-size:15pt;font-weight:800;line-height:1.15;color:#0f172a;text-align:center">${esc(d.nom)}</div>
          <div style="display:flex;align-items:center;gap:10px;justify-content:center">
            <span style="text-decoration:line-through;color:#94a3b8;font-size:14pt;font-weight:700">${d.eskiStr}</span>
            <span style="background:#e11d48;color:#fff;font-weight:900;font-size:13pt;border-radius:999px;padding:2px 11px;line-height:1.3">${d.badge}</span>
          </div>
          <div style="color:#e11d48;font-size:30pt;font-weight:900;line-height:1">${d.yangiStr}</div>
          <div style="background:#fef3c7;color:#b45309;font-weight:800;font-size:9pt;border-radius:999px;padding:2px 12px">💰 Tejaysiz: ${d.savingStr}</div>
          <div style="width:100%;margin-top:auto">${d.svg}</div>
        </div>
      </div>`;
    }
    return `<div style="min-height:${d.minH};display:flex;flex-direction:column;border:2px solid #e0e7ff;border-radius:12px;overflow:hidden;font-family:Arial,sans-serif;background:#fff">
      <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;padding:3mm 2mm;text-align:center">
        <div style="font-size:11pt;font-weight:900;letter-spacing:1px;text-transform:uppercase;line-height:1.1">${esc(d.shop || 'NARX')}</div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2mm;padding:3mm">
        <div style="font-size:16pt;font-weight:800;line-height:1.15;color:#0f172a;text-align:center">${esc(d.nom)}</div>
        ${d.showPrice ? `<div style="font-size:8pt;font-weight:700;color:#64748b;letter-spacing:2px;text-transform:uppercase">Narx</div>
        <div style="color:#4f46e5;font-size:28pt;font-weight:900;line-height:1">${d.narxStr}</div>` : ''}
        <div style="width:100%;margin-top:auto">${d.svg}</div>
      </div>
    </div>`;
  }

  const TEMPLATES = { rasta: tplRasta, orta: tplOrta, keng: tplKeng };

  // Joriy form holatidan yorliq ma'lumotini quradi (namuna ham, chop etish ham)
  function buildData(genBarcode) {
    const id = document.getElementById('y-prod').value;
    const s = Storage.getServices().find(x => x.id === id);
    if (!s) return null;
    const sizeKey = document.getElementById('y-size').value;
    const Z = SIZES[sizeKey] || SIZES.orta;
    const format = document.getElementById('y-fmt').value;
    const showPrice = document.getElementById('y-price').checked;
    const isDisc = document.getElementById('y-disc').checked;

    const eski = s.narx;
    let yangi = eski, badge = '';
    if (isDisc) {
      const dv = Number(document.getElementById('y-disc-val').value) || 0;
      const dtype = document.getElementById('y-disc-type').value;
      if (dtype === 'foiz') { yangi = Math.round(eski * (1 - dv / 100)); badge = `−${dv}%`; }
      else { yangi = Math.max(0, eski - dv); badge = `−${money(dv)}`; }
    }

    const value = ensureValue(s, format);
    const svg = genBarcode ? barcodeSVG(value, format, Z.bcH) : '';

    return {
      s, sizeKey, Z, format, value, showPrice, isDisc,
      shop: shopName(), nom: s.nom,
      narxStr: money(s.narx), eskiStr: money(eski), yangiStr: money(yangi),
      savingStr: money(Math.max(0, eski - yangi)), badge,
      minH: Z.minH, svg,
    };
  }

  function renderOne(d) { return (TEMPLATES[d.sizeKey] || tplOrta)(d); }

  /* ---------- Jonli namuna ---------- */
  function renderPreview() {
    const box = document.getElementById('y-preview');
    if (!box) return;
    const d = buildData(true);
    if (!d) { box.innerHTML = ''; return; }
    box.innerHTML = `<div style="width:${d.Z.pw};max-width:100%;margin:0 auto">${renderOne(d)}</div>`;
  }

  /* ---------- Yorliq quruvchi oyna ---------- */
  function open(prefillId) {
    const services = Storage.getServices().filter(s => s.aktiv !== false);
    if (!services.length) { Toast.show('Avval mahsulot qo\'shing', 'error'); return; }
    const sel = prefillId || services[0].id;

    Modal.open(`
      <h3>🏷️ Yorliq / narx etiketkasi</h3>

      <div class="field"><label>Mahsulot</label>
        <select class="input" id="y-prod">
          ${services.map(s => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.nom)} — ${money(s.narx)}</option>`).join('')}
        </select></div>

      <div class="field"><label>Maqsad / o'lcham</label>
        <select class="input" id="y-size">
          ${Object.entries(SIZES).map(([k, z]) => `<option value="${k}" ${k === 'orta' ? 'selected' : ''}>${z.t}</option>`).join('')}
        </select>
        <div class="muted" id="y-size-desc" style="font-size:12px;margin-top:5px"></div>
      </div>

      <div class="toolbar" style="margin:0 0 12px">
        <div class="field" style="flex:1;margin:0"><label>Miqdor (nechta)</label>
          <input class="input" id="y-qty" type="number" inputmode="numeric" min="1" value="1"></div>
        <div class="field" style="flex:1;margin:0"><label>Shtrix format</label>
          <select class="input" id="y-fmt">
            ${FORMATS.map(f => `<option value="${f.v}">${f.t}</option>`).join('')}
          </select></div>
      </div>

      <label style="display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:10px">
        <input type="checkbox" id="y-price" checked style="width:auto"> Narx ko'rsatilsin</label>

      <label style="display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:10px">
        <input type="checkbox" id="y-disc" style="width:auto"> 🔖 Chegirma / aksiya yorlig'i</label>

      <div id="y-disc-box" style="display:none">
        <div class="toolbar" style="margin:0 0 12px">
          <div class="field" style="flex:1;margin:0"><label>Chegirma qiymati</label>
            <input class="input" id="y-disc-val" type="number" inputmode="numeric" min="0" value="0"></div>
          <div class="field" style="flex:1;margin:0"><label>Turi</label>
            <select class="input" id="y-disc-type">
              <option value="foiz">% (foiz)</option>
              <option value="summa">${esc(cur())} (summa)</option>
            </select></div>
        </div>
      </div>

      <div class="field" style="margin-bottom:14px"><label>👁️ Namuna</label>
        <div id="y-preview" style="background:#f1f5f9;border:1px solid var(--border);border-radius:12px;padding:14px;overflow:auto;max-height:320px;display:flex;justify-content:center"></div>
      </div>

      <div class="btn-row">
        <button class="btn btn-ghost" onclick="Modal.close()">Bekor</button>
        <button class="btn btn-primary" id="y-print">🖨️ Chop etish</button>
      </div>
    `);

    const sizeDesc = () => { document.getElementById('y-size-desc').textContent = (SIZES[document.getElementById('y-size').value] || {}).desc || ''; };
    const discChk = document.getElementById('y-disc');
    discChk.onchange = () => {
      document.getElementById('y-disc-box').style.display = discChk.checked ? 'block' : 'none';
      renderPreview();
    };
    // Har bir o'zgarishda namunani yangilaymiz
    ['y-prod', 'y-size', 'y-fmt', 'y-price', 'y-disc-val', 'y-disc-type'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.oninput = renderPreview; el.onchange = () => { if (id === 'y-size') sizeDesc(); renderPreview(); }; }
    });
    document.getElementById('y-price').onchange = renderPreview;
    document.getElementById('y-print').onclick = doPrint;

    sizeDesc();
    renderPreview();
  }

  /* ---------- Chop etish ---------- */
  function doPrint() {
    const d = buildData(true);
    if (!d) return;
    const qty = Math.max(1, Math.min(500, Number(document.getElementById('y-qty').value) || 1));

    // Shtrix yo'q bo'lsa generatsiya qilib mahsulotga saqlaymiz
    if (!d.s.shtrix) { Storage.updateService(d.s.id, { shtrix: d.value }); Sheets.scheduleSync(); }

    const one = renderOne(d);
    const labels = Array.from({ length: qty }, () => one).join('');

    const html = `<!DOCTYPE html><html lang="uz"><head><meta charset="UTF-8">
      <title>Yorliqlar — ${esc(d.nom)}</title>
      <style>
        @page { size: A4; margin: 8mm; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body { font-family: Arial, sans-serif; margin: 0; }
        .sheet { display: grid; grid-template-columns: repeat(${d.Z.cols}, 1fr); gap: 3mm; }
        .sheet > div { page-break-inside: avoid; }
        .sheet svg { max-width: 100%; height: auto; display: block; margin: 0 auto; }
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
