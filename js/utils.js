/* ============================================================
   utils.js — Umumiy yordamchilar (XSS himoyasi, hashlash)
   Bu fayl eng birinchi yuklanadi: boshqa modullar `esc()` va
   `Security` ga tayanadi.
   ============================================================ */

/* ---------- XSS himoyasi ----------
   HTML ichiga foydalanuvchi kiritgan matn qo'yishdan oldin doim
   shu funksiya orqali "tozalanadi". Aks holda mahsulot nomiga
   <img onerror=...> kabi kod qo'yib, ilovani buzish mumkin edi. */
function esc(value) {
  if (value == null) return '';
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

/* ---------- Parol / PIN hashlash ----------
   Maxfiy ma'lumot (admin paroli, xodim PIN-kodi) endi ochiq matnda
   saqlanmaydi. SHA-256 + tasodifiy "salt" ishlatiladi.
   Eslatma: crypto.subtle faqat xavfsiz kontekstda (https yoki
   localhost) ishlaydi — PWA baribir https talab qiladi. */
const Security = (() => {
  const subtle = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto.subtle : null;

  function toHex(buf) {
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  function genSalt(len = 16) {
    const a = new Uint8Array(len);
    crypto.getRandomValues(a);
    return toHex(a.buffer);
  }

  async function hash(text, salt) {
    const data = new TextEncoder().encode(salt + ':' + text);
    if (subtle) return toHex(await subtle.digest('SHA-256', data));
    // Zaxira (xavfsiz bo'lmagan muhit uchun) — kuchsiz, lekin ochiq matndan yaxshi
    let h = 0;
    for (let i = 0; i < data.length; i++) h = (Math.imul(31, h) + data[i]) | 0;
    return 'fallback:' + (h >>> 0).toString(16);
  }

  // Yangi maxfiy yozuv yaratadi: { salt, hash }
  async function make(text) {
    const salt = genSalt();
    return { salt, hash: await hash(text, salt) };
  }

  // Kiritilgan matnni saqlangan yozuv bilan solishtiradi
  async function verify(text, record) {
    if (!record || !record.salt || !record.hash) return false;
    return (await hash(text, record.salt)) === record.hash;
  }

  return { genSalt, hash, make, verify };
})();

// Node test muhiti uchun (brauzerda `module` mavjud emas)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { esc, Security };
}
