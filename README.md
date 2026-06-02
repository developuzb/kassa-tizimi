# 💳 Kassa Tizimi — Web-based POS

Xizmat ko'rsatish biznesi uchun **offline ishlaydigan**, **Google Sheets bilan integratsiyalashgan** kassa tizimi.
Hech qanday server kerak emas — toza HTML + CSS + JavaScript. Telefon, planshet va kompyuterda ishlaydi.

---

## 📂 Tuzilma

```
CLAUDE PROYEKT/
├── index.html          # Asosiy sahifa
├── manifest.json       # PWA manifesti (o'rnatiladigan ilova)
├── sw.js               # Service worker (offline kesh)
├── icon.svg            # Ilova ikonkasi
├── css/style.css       # Dizayn
├── js/
│   ├── utils.js        # XSS himoyasi (esc) + parol/PIN hashlash (Security)
│   ├── storage.js      # LocalStorage (offline baza)
│   ├── sheets.js       # Google Sheets integratsiya
│   ├── kassa.js        # Kassa: chegirma, QQS, mijoz, chek
│   ├── inventar.js     # Ombor moduli (qoldiq kuzatuvi)
│   ├── mijozlar.js     # Mijozlar (CRM) + sadoqat ballari
│   ├── xodimlar.js     # Xodimlar, smenalar, kassa pul boshqaruvi
│   ├── hisobotlar.js   # Hisobotlar + grafiklar + qaytarish
│   ├── admin.js        # Admin panel (soliq/sadoqat, Sheets)
│   └── app.js          # Navigatsiya va init
└── README.md
```

## ✨ Asosiy imkoniyatlar

- 🛒 **Kassa** — savat, **chegirma** (% yoki summa), **QQS/soliq**, **mijoz biriktirish**, chek (print/PDF), **shtrix-kod skaner** (qidiruv maydoniga skanerlab Enter).
- 📦 **Ombor** — xizmat/tovar bazasi, **shtrix-kod**, **qoldiq avtomatik kamayadi**, tugagan tovar bloklanadi, kam qolganda ogohlantiradi.
- 🙋 **Mijozlar (CRM)** — telefon, **sadoqat ballari**, xarid tarixi va statistikasi.
- 👥 **Xodimlar va smena** — PIN bilan smena, **kassa pul boshqaruvi** (boshlang'ich pul, kirim/chiqim, yopilishda kamomad/ortiqcha hisobi).
- 📊 **Hisobotlar** — kunlik/haftalik/oylik, top xizmatlar, xodimlar, grafik + **sotuvlar tarixi va qaytarish (refund)**.
- 🏬 **Filiallar** — admin paneldan qo'shish/tahrirlash, faol filialni tanlash; har bir sotuv va smena filialga bog'lanadi.
- 🔐 **Admin** — parol (xavfsiz hashlangan), QQS va sadoqat sozlamalari, Filiallar, Google Sheets ulanishi, **zaxira (eksport) va tiklash (import)**.
- 📴 **Offline + PWA** — internetsiz ishlaydi, telefon/kompyuterga **ilova sifatida o'rnatiladi**.

## 🚀 Tez boshlash (lokalda)

1. Papkani oching va `index.html` ni brauzerda oching.
   > Eng yaxshisi — kichik server orqali oching (ba'zi brauzerlar `file://` da cheklov qo'yadi):
   > ```bash
   > # Python o'rnatilgan bo'lsa:
   > python -m http.server 8000
   > # so'ng brauzerda: http://localhost:8000
   > ```
2. Tizim **demo ma'lumotlar** bilan ochiladi (6 ta xizmat, 1 ta admin xodim).
3. **Admin panel** standart paroli: `admin123` — birinchi kirishdan keyin **albatta o'zgartiring**.
4. Standart xodim PIN-kodi: `1234` (smena ochish uchun).

---

## 🔌 Google Sheets integratsiyasi (bosqichma-bosqich)

> **Muhim:** Google Sheets API faqat API kalit bilan **yozish**ga ruxsat bermaydi
> (yozish OAuth talab qiladi). Backendsiz **o'qish + yozish** uchun eng ishonchli yo'l —
> **Google Apps Script Web App**. Quyida shu usul tushuntirilgan.

### 1-qadam. Google Sheet yaratish

1. [sheets.google.com](https://sheets.google.com) → yangi jadval yarating.
2. **Varaqlarni qo'lda yaratish shart emas!** Tizim "tartibli ko'zgu" rejimida
   ishlaydi: lokal baza asosiy manba, har sinxronda ilova quyidagi varaqlarni
   **avtomatik yaratadi va to'liq tartiblab qayta yozadi** (eskisini almashtiradi):

   | Varaq | Mazmuni | Ustunlar |
   |---|---|---|
   | **Mahsulotlar** | Ombor holati (kam qolgani tepada) | id, nom, kategoriya, narx, qoldiq, holat, aktiv, shtrix |
   | **Sotuvlar** | Barcha cheklar (eng yangi tepada) | chek, sana, vaqt, filial, kassir, mijoz, tovarlar, dona, oraliq, chegirma, soliq, jami, tolov, holat |
   | **Hisobot** | Kunlik xulosa (sana + filial) | sana, filial, cheklar, jami_savdo, naqd, karta, otkazma, qaytarish_soni, qaytarilgan_summa |
   | **Smenalar** | Xodim/smena hisoboti | sana, filial, xodim, cheklar, jami_sotuv, naqd_sotuv, boshlandi, tugadi, boshlangich_pul, kutilgan_naqd, haqiqiy_naqd, farq |
   | **Mijozlar** | CRM | id, ism, telefon, ballar, jami_xarid, xarid_soni, izoh |
   | **Xodimlar** | Xodimlar | id, ism, lavozim, pin (`••••` — maxfiy, hech qachon chiqarilmaydi), aktiv |
   | **Filiallar** | Filiallar | id, nom, manzil, aktiv |

   > Ya'ni Sheets'da ma'lumot **doim toza, saralangan va lokal baza bilan bir xil**
   > bo'ladi. Qo'lda tahrirlamang — keyingi sinxronda almashtiriladi.

3. URL'dan **Sheet ID** ni oling:
   `https://docs.google.com/spreadsheets/d/`**`1AbC...XYZ`**`/edit` → qalin qism Sheet ID.

### 2-qadam. Apps Script Web App (o'qish + yozish)

1. O'sha jadvalda menyu: **Extensions → Apps Script**.
2. Hamma kodni o'chirib, quyidagini joylang:

```javascript
// ===== Google Apps Script — Kassa backend =====
function doGet(e) {
  try {
    var sheetName = e.parameter.sheet;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return json({ ok: false, error: 'Varaq topilmadi: ' + sheetName });
    var values = sh.getDataRange().getValues();
    return json({ ok: true, values: values });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(body.sheet);

    // append/replace uchun varaq bo'lmasa — avtomatik yaratamiz
    if (!sh && (body.action === 'append' || body.action === 'replace')) {
      sh = ss.insertSheet(body.sheet);
    }
    if (!sh) return json({ ok: false, error: 'Varaq topilmadi: ' + body.sheet });

    if (body.action === 'append') {
      sh.appendRow(body.values);   // bitta qator qo'shadi (tranzaksiya: sotuv/smena)
      return json({ ok: true });
    }
    if (body.action === 'replace') {
      // butun varaqni qayta yozadi (master jadvallar: Xizmatlar/Xodimlar/Mijozlar)
      sh.clearContents();
      var all = [body.header].concat(body.rows || []);
      sh.getRange(1, 1, all.length, body.header.length).setValues(all);
      return json({ ok: true });
    }
    return json({ ok: false, error: 'Noma\'lum action' });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

3. **Deploy → New deployment**:
   - ⚙️ (gear) → **Web app**
   - *Execute as*: **Me**
   - *Who has access*: **Anyone**  ← (muhim, aks holda fetch ishlamaydi)
   - **Deploy** → ruxsatlarni tasdiqlang (Google hisobingiz bilan).
4. Chiqqan **Web app URL** ni nusxa oling
   (`https://script.google.com/macros/s/..../exec`).

### 3-qadam. Tizimga ulash

1. Ilovada **Admin panel** → parol kiriting.
2. **Google Sheets ulanishi** bo'limiga:
   - **Apps Script Web App URL** — 2-qadamdagi URL.
   - **Sheet ID** — 1-qadamdagi ID (ixtiyoriy, o'qish uchun).
3. **💾 Saqlash** → **🔌 Tekshirish**. "Ulandi ✓" chiqsa — tayyor!
4. Endi har bir sotuv avtomatik **Sotuvlar** varag'iga, smena yopilganda **Smenalar** varag'iga yoziladi.

### (Ixtiyoriy) Faqat o'qish — API key usuli
Agar faqat xizmatlarni **o'qib import qilish** kerak bo'lsa:
1. Sheet'ni **Anyone with the link → Viewer** qiling.
2. [Google Cloud Console](https://console.cloud.google.com) → API key yarating, **Google Sheets API** ni yoqing.
3. Admin panelga **API key** + **Sheet ID** kiriting. (Bu usul bilan **yozib bo'lmaydi**.)

---

## 📴 Offline rejim

- Barcha ma'lumot avval **LocalStorage**'ga yoziladi — internet bo'lmasa ham kassa ishlayveradi.
- Internet yo'q paytdagi sotuvlar **navbatga** (queue) tushadi.
- Internet tiklanganda **avtomatik** Google Sheets'ga yuboriladi
  (yoki Admin panel → "🔄 Navbatni sinxronlash").
- Header'dagi nuqta: 🟢 onlayn / 🔴 oflayn.

---

## 🌐 Deployment (bepul hosting)

### Variant A — GitHub Pages
1. GitHub'da yangi **repository** yarating, fayllarni yuklang (yoki `git push`).
2. **Settings → Pages → Source: `main` branch / root** → Save.
3. Bir necha daqiqada sayt tayyor: `https://username.github.io/repo-nomi/`

```bash
git init
git add .
git commit -m "Kassa tizimi"
git branch -M main
git remote add origin https://github.com/USERNAME/REPO.git
git push -u origin main
```

### Variant B — Netlify (eng oson)
1. [netlify.com](https://netlify.com) → **Add new site → Deploy manually**.
2. Loyiha papkasini brauzerga **drag & drop** qiling.
3. Tayyor — `https://random-name.netlify.app` manzili beriladi.
   (Yoki GitHub repo'ni ulаб, har push'da avtomatik yangilanadi.)

> **Eslatma:** Google Apps Script URL HTTPS bo'lgani uchun saytni ham HTTPS'da
> joylash kerak (GitHub Pages va Netlify avtomatik HTTPS beradi).

---

## 📲 Ilova sifatida o'rnatish (PWA)

Sayt HTTPS'da joylangach (yoki `localhost`), uni **haqiqiy ilovadek** o'rnatish mumkin:

- **Telefon (Android/iOS):** brauzer menyusi → **"Bosh ekranga qo'shish" / "Add to Home Screen"**.
- **Kompyuter (Chrome/Edge):** manzil satridagi **⊕ (Install)** belgisi → **O'rnatish**.

O'rnatilgandan keyin ilova **alohida oynada**, **offline** ham ochiladi (service worker barcha fayllarni keshlaydi).

---

## 🔒 Xavfsizlik bo'yicha maslahatlar

- Admin parolini darrov o'zgartiring (`admin123` emas).
- Apps Script "Anyone" bo'lgani uchun URL'ni maxfiy saqlang.
- Muhim sotuv ma'lumotlarini vaqti-vaqti bilan **Admin → Zaxira (JSON)** orqali yuklab oling.

## 🛠 Texnik xususiyatlar
- Mobile-first, responsive (CSS Grid), iOS uslubidagi "liquid glass" dizayn.
- **PWA** — `manifest.json` + `sw.js` (service worker) orqali o'rnatiladi va offline ishlaydi.
- Kutubxonalar: faqat **Chart.js** — `js/vendor/chart.umd.min.js` da **lokal** saqlangan
  (CDN'ga bog'liq emas, internet/proxy cheklovi bo'lsa ham ishlaydi, to'liq offline).
- Emoji ikonkalari — qo'shimcha kutubxona yo'q.
- Barcha matnlar va xato xabarlari o'zbek tilida.
- Google Sheets sinxron — **"tartibli ko'zgu"** modeli: localStorage asosiy manba,
  har sinxronda barcha varaqlar `replace` bilan to'liq qayta yoziladi (saralangan,
  jamlangan). Offline bo'lsa "dirty" bayrog'i qo'yiladi, internet tiklanganda avtomatik yuboriladi.
