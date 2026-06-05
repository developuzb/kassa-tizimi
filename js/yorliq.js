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
    rasta: { name: 'Rasta narxchasi', purpose: "Javonda tez o'qiladigan ixcham narx", cols: 4, pw: '46mm', minH: '30mm', bcH: 24 },
    orta:  { name: "O'rtacha yorliq",  purpose: 'Mahsulotni belgilash uchun standart',  cols: 3, pw: '62mm', minH: '44mm', bcH: 38 },
    keng:  { name: 'Savdo afishasi',   purpose: "Diqqatni tortuvchi yirik aksiya",      cols: 2, pw: '96mm', minH: '74mm', bcH: 54 },
  };

  /* ---------- Toza SVG ikonkalar (emoji o'rniga — kompyuterda ham aniq) ---------- */
  const I = (p) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-4px">${p}</svg>`;
  const ICONS = {
    tag:   I('<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>'),
    eye:   I('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
    print: I('<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>'),
    dl:    I('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
    pct:   I('<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>'),
  };

  // Har o'lcham uchun mini-eskiz (kartada ko'rsatish uchun) — kenglik bilan maqsadni bildiradi
  const GLYPHS = {
    rasta: `<svg viewBox="0 0 48 48" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
      <rect x="17" y="6" width="14" height="36" rx="2.5"/><line x1="21" y1="13" x2="27" y2="13"/>
      <rect x="20" y="19" width="8" height="7" rx="1.5" fill="currentColor" stroke="none"/>
      <rect x="20" y="32" width="8" height="5" rx="1" fill="currentColor" stroke="none" opacity=".35"/></svg>`,
    orta: `<svg viewBox="0 0 48 48" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
      <rect x="9" y="9" width="30" height="30" rx="3"/><rect x="9" y="9" width="30" height="7" rx="3" fill="currentColor" stroke="none"/>
      <line x1="15" y1="23" x2="33" y2="23"/><rect x="15" y="27" width="18" height="6" rx="1.5" fill="currentColor" stroke="none"/>
      <rect x="15" y="35" width="18" height="2.5" fill="currentColor" stroke="none" opacity=".35"/></svg>`,
    keng: `<svg viewBox="0 0 48 48" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round">
      <rect x="4" y="9" width="40" height="30" rx="3"/><rect x="4" y="9" width="40" height="9" rx="3" fill="currentColor" stroke="none"/>
      <rect x="11" y="22" width="26" height="9" rx="2" fill="currentColor" stroke="none"/>
      <rect x="11" y="34" width="26" height="2.5" fill="currentColor" stroke="none" opacity=".35"/></svg>`,
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
          <div style="font-size:16pt;font-weight:900;letter-spacing:4px;line-height:1">CHEGIRMA</div>
          ${d.shop ? `<div style="font-size:7pt;font-weight:700;opacity:.92;margin-top:1.2mm;letter-spacing:.5px;text-transform:uppercase">${esc(d.shop)}</div>` : ''}
        </div>
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2mm;padding:3mm 3mm 2mm">
          <div style="font-size:15pt;font-weight:800;line-height:1.15;color:#0f172a;text-align:center">${esc(d.nom)}</div>
          <div style="display:flex;align-items:center;gap:10px;justify-content:center">
            <span style="text-decoration:line-through;color:#94a3b8;font-size:14pt;font-weight:700">${d.eskiStr}</span>
            <span style="background:#e11d48;color:#fff;font-weight:900;font-size:13pt;border-radius:999px;padding:2px 11px;line-height:1.3">${d.badge}</span>
          </div>
          <div style="color:#e11d48;font-size:30pt;font-weight:900;line-height:1">${d.yangiStr}</div>
          <div style="background:#fff7ed;color:#b45309;font-weight:800;font-size:9pt;border-radius:999px;padding:2px 13px;border:1px solid #fed7aa;letter-spacing:.3px">Tejaysiz: ${d.savingStr}</div>
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
      <h3>${ICONS.tag} Yorliq / narx etiketkasi</h3>

      <div class="field"><label>Mahsulot</label>
        <select class="input" id="y-prod">
          ${services.map(s => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.nom)} — ${money(s.narx)}</option>`).join('')}
        </select></div>

      <div class="field"><label>Maqsad va o'lcham</label>
        <div class="size-picker" id="y-sizes">
          ${Object.entries(SIZES).map(([k, z]) => `
            <button type="button" class="size-card ${k === 'orta' ? 'active' : ''}" data-k="${k}">
              <span class="sc-glyph">${GLYPHS[k]}</span>
              <span class="sc-meta">
                <span class="sc-title">${esc(z.name)}</span>
                <span class="sc-sub">${esc(z.purpose)}</span>
                <span class="sc-dim">${z.cols} ustun · ${z.pw}</span>
              </span>
            </button>`).join('')}
        </div>
        <input type="hidden" id="y-size" value="orta">
      </div>

      <div class="toolbar" style="margin:0 0 12px">
        <div class="field" style="flex:1;margin:0"><label>Miqdor (nechta)</label>
          <input class="input" id="y-qty" type="number" inputmode="numeric" min="1" value="1"></div>
        <div class="field" style="flex:1;margin:0"><label>Shtrix format</label>
          <select class="input" id="y-fmt">
            ${FORMATS.map(f => `<option value="${f.v}">${f.t}</option>`).join('')}
          </select></div>
      </div>

      <label class="opt-toggle on" id="y-price-lbl">
        <input type="checkbox" id="y-price" checked>
        <span class="ot-ico">${ICONS.tag}</span><span>Narx ko'rsatilsin</span></label>

      <label class="opt-toggle" id="y-disc-lbl">
        <input type="checkbox" id="y-disc">
        <span class="ot-ico">${ICONS.pct}</span><span>Chegirma / aksiya yorlig'i</span></label>

      <div id="y-disc-box" style="display:none">
        <div class="toolbar" style="margin:8px 0 12px">
          <div class="field" style="flex:1;margin:0"><label>Chegirma qiymati</label>
            <input class="input" id="y-disc-val" type="number" inputmode="numeric" min="0" value="0"></div>
          <div class="field" style="flex:1;margin:0"><label>Turi</label>
            <select class="input" id="y-disc-type">
              <option value="foiz">% (foiz)</option>
              <option value="summa">${esc(cur())} (summa)</option>
            </select></div>
        </div>
      </div>

      <div class="field" style="margin-bottom:14px"><label>${ICONS.eye} Namuna</label>
        <div id="y-preview" style="background:var(--fill);border:1px solid var(--card-border);border-radius:14px;padding:16px;overflow:auto;max-height:340px;display:flex;justify-content:center"></div>
      </div>

      <div class="btn-row">
        <button class="btn btn-ghost" onclick="Modal.close()">Bekor</button>
        <button class="btn btn-primary" id="y-print">${ICONS.print} Chop etish</button>
      </div>
    `);

    // Karta tanlash — o'lchamni hidden input'ga yozadi
    document.querySelectorAll('#y-sizes .size-card').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('#y-sizes .size-card').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('y-size').value = btn.dataset.k;
        renderPreview();
      };
    });

    // Toggle'lar (narx / chegirma) — vizual holatni yangilaydi
    const priceChk = document.getElementById('y-price');
    priceChk.onchange = () => { document.getElementById('y-price-lbl').classList.toggle('on', priceChk.checked); renderPreview(); };
    const discChk = document.getElementById('y-disc');
    discChk.onchange = () => {
      document.getElementById('y-disc-lbl').classList.toggle('on', discChk.checked);
      document.getElementById('y-disc-box').style.display = discChk.checked ? 'block' : 'none';
      renderPreview();
    };
    // Boshqa o'zgarishlarda namunani yangilaymiz
    ['y-prod', 'y-fmt', 'y-disc-val', 'y-disc-type'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.oninput = renderPreview; el.onchange = renderPreview; }
    });
    document.getElementById('y-print').onclick = doPrint;

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
    Toast.show(`${qty} ta yorliq tayyorlandi`, 'success');
  }

  return { open };
})();
