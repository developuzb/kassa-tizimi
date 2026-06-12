/* ============================================================
   tavsiyalar.js — Xodimga savdo va KPI tavsiyalari
   ------------------------------------------------------------
   Kassa ekranining pastida aylanib turadigan maslahatlar paneli.
   Maqsad: xodimni ish davomida savdoni va KPI (ish haqi)ni oshirishga
   undash. Tavsiyalar 2 manbadan keladi:
     • STATIK — umumiy savdo/KPI maslahatlari (~14 ta)
     • kontekst() — joriy holatga moslashgan (kam qoldiq, KPI kategoriyalari,
       sadoqat dasturi, smena progressi) maslahatlar
   ============================================================ */

const Tavsiyalar = (() => {
  let timer = null;
  let idx = 0;
  const INTERVAL = 9000;   // har ~9 soniyada keyingi maslahatga o'tadi

  // Umumiy savdo + KPI tavsiyalari
  const STATIK = [
    '🤝 Mijozni samimiy kuting — qaytib kelish ehtimoli oshadi.',
    '➕ Har sotuvda qo\'shimcha mahsulot taklif qiling — o\'rtacha chek ortadi.',
    '📦 To\'plam (komplekt) taklif qiling: "Buni ham olasizmi?"',
    '🔝 Yuqori foydali (KPI) mahsulotlarni birinchi bo\'lib taklif qiling.',
    '⭐ Sadoqat ballarini eslating: "Ball to\'plab, keyingi xaridda chegirma".',
    '💳 Karta va o\'tkazma ham qabul qilinadi — mijozga qulaylikni ayting.',
    '😊 Tabassum bilan xizmat — eng arzon va kuchli reklama.',
    '🆕 Yangi kelgan mahsulotlarni ko\'rsating — qiziqish uyg\'oting.',
    '📞 Mijoz telefonini oling — aksiyalardan xabardor qiling.',
    '🎁 Aksiya yoki chegirma bo\'lsa — albatta aytib o\'ting.',
    '⏱️ Tez xizmat qiling — navbat va kutishni kamaytiring.',
    '🔄 Qaytarish o\'rniga almashtirish yoki tuzatishni taklif qiling.',
    '🧾 Chekni doim taklif qiling — ishonch va tartib belgisi.',
    '💬 "Yana nima kerak edi?" — bitta savol qo\'shimcha savdo ochadi.',
  ];

  // Joriy holatga qarab moslashgan tavsiyalar (eng foydalilari oldinda)
  function kontekst() {
    const out = [];
    try {
      const set = Storage.getSettings();
      const shift = Storage.getActiveShift();

      const low = Storage.lowStock(set.kamQoldiq || 5).filter(s => s.qoldiq > 0);
      if (low.length) {
        out.push(`⚠️ Kam qoldi: ${low.slice(0, 3).map(s => s.nom).join(', ')} — sotuvda e'tibor bering yoki to'ldiring.`);
      }

      const kats = Object.keys(Storage.getKpiConfig());
      if (kats.length) {
        out.push(`💰 Bonusli (KPI) kategoriyalar: ${kats.slice(0, 4).join(', ')} — ko'proq soting, ish haqingiz oshadi!`);
      }

      if (set.sadoqatYoq) {
        out.push('⭐ Sadoqat dasturi yoqilgan — har mijozga ball berishni unutmang.');
      }

      if (shift) {
        const n = shift.sotuvSoni || 0;
        out.push(`📈 Bugun ${n} ta sotuv. Har mijozga bitta qo'shimcha taklif — KPI yuqoriroq!`);
      }
    } catch (_) { /* Storage tayyor bo'lmasa — faqat statik tavsiyalar */ }
    return out;
  }

  function tips() {
    return kontekst().concat(STATIK);
  }

  // Joriy maslahatni chizadi. Panel topilmasa (boshqa ekran) — to'xtaydi.
  function paint(list) {
    const el = document.getElementById('kassa-tips');
    if (!el) { stop(); return false; }
    if (!list.length) { el.innerHTML = ''; return true; }
    if (idx >= list.length) idx = 0;
    el.innerHTML = `
      <div class="tip-banner" onclick="Tavsiyalar.next()" title="Keyingi maslahat">
        <span class="tip-label">💡 TAVSIYA</span>
        <span class="tip-text">${esc(list[idx])}</span>
      </div>`;
    return true;
  }

  function next() {
    const list = tips();
    idx = (idx + 1) % list.length;
    paint(list);
  }

  function start() {
    stop();
    timer = setInterval(() => {
      const list = tips();
      idx = (idx + 1) % list.length;
      paint(list);
    }, INTERVAL);
  }

  // Kassa ekrani render qilinganda chaqiriladi (idx saqlanadi — uzluksiz aylanish)
  function mount() {
    if (paint(tips())) start();
  }

  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  return { mount, next, stop };
})();
