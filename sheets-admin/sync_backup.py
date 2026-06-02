#!/usr/bin/env python3
# ============================================================
# sync_backup.py — Admin panel zaxirasini (JSON) Google Sheets'ga sinxronlash
# ------------------------------------------------------------
# Ilovaning sheets.js -> buildAll() mantig'ini server tarafida takrorlaydi:
# localStorage zaxirasini o'qiydi va 7 ta varaqni to'liq qayta yozadi.
#
# Foydalanish:
#   python sync_backup.py "<zaxira.json yo'li>"
# Yo'l berilmasa, eng so'nggi kassa-zaxira-*.json Downloads'dan olinadi.
# ============================================================

import glob
import json
import os
import sys

import gspread
from google.oauth2.service_account import Credentials

# Windows konsolida unicode (✓) chiqishi uchun
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]


def load_config():
    with open(os.path.join(HERE, "config.json"), "r", encoding="utf-8") as f:
        cfg = json.load(f)
    key = cfg.get("key_file", "service-account.json")
    if not os.path.isabs(key):
        key = os.path.join(HERE, key)
    return cfg["sheet_id"], key


def load_backup(path):
    """Zaxira faylini o'qiydi. Qiymatlar JSON-string (yoki null)."""
    with open(path, "r", encoding="utf-8") as f:
        raw = json.load(f)

    def parse(key):
        v = raw.get(key)
        if not v:
            return []
        return json.loads(v) if isinstance(v, str) else v

    def parse_obj(key):
        v = raw.get(key)
        if not v:
            return {}
        return json.loads(v) if isinstance(v, str) else v

    return {
        "services": parse("kassa_services"),
        "sales": parse("kassa_sales"),
        "employees": parse("kassa_employees"),
        "customers": parse("kassa_customers"),
        "branches": parse("kassa_branches"),
        "shifts": parse("kassa_shifts"),
        "settings": parse_obj("kassa_settings"),
    }


# ---------- Varaqlarni qurish (sheets.js bilan bir xil) ----------

def build_mahsulotlar(d):
    kam = (d["settings"] or {}).get("kamQoldiq", 5)

    def holat(q):
        if q is None:
            return "—"
        if q <= 0:
            return "tugadi"
        return "kam" if q <= kam else "ok"

    services = sorted(
        d["services"],
        key=lambda s: s.get("qoldiq") if s.get("qoldiq") is not None else float("inf"),
    )
    rows = [
        [s.get("id", ""), s.get("nom", ""), s.get("kategoriya", ""), s.get("narx", 0),
         s.get("qoldiq", "") if s.get("qoldiq") is not None else "",
         holat(s.get("qoldiq")), "ha" if s.get("aktiv") else "yoq"]
        for s in services
    ]
    return "Mahsulotlar", ["id", "nom", "kategoriya", "narx", "qoldiq", "holat", "aktiv"], rows


PAY = {"naqd": "Naqd", "karta": "Karta", "otkazma": "O'tkazma"}


def build_sotuvlar(d):
    sales = sorted(d["sales"], key=lambda s: s.get("ts", 0), reverse=True)
    rows = []
    for s in sales:
        items = s.get("items", []) or []
        tovarlar = "; ".join(f"{it.get('nom')} x{it.get('miqdor')}" for it in items)
        dona = sum(it.get("miqdor", 0) for it in items)
        rows.append([
            s.get("chek_raqami", ""), s.get("sana", ""), s.get("vaqt", ""), s.get("filial", ""),
            s.get("xodim", ""), s.get("mijoz", ""), tovarlar, dona,
            s.get("oraliq", s.get("jami", 0)), s.get("chegirma", 0), s.get("soliq", 0),
            s.get("jami", 0), PAY.get(s.get("tolov_usuli"), s.get("tolov_usuli", "")),
            "QAYTARILGAN" if s.get("qaytarilgan") else "ok",
        ])
    header = ["chek", "sana", "vaqt", "filial", "kassir", "mijoz", "tovarlar", "dona",
              "oraliq", "chegirma", "soliq", "jami", "tolov", "holat"]
    return "Sotuvlar", header, rows


def day_key(ts):
    import datetime
    d = datetime.datetime.fromtimestamp(ts / 1000)
    return f"{d.year:04d}-{d.month:02d}-{d.day:02d}"


def build_hisobot(d):
    agg = {}
    for s in d["sales"]:
        k = day_key(s.get("ts", 0)) + "|" + (s.get("filial", "") or "")
        r = agg.setdefault(k, {"dk": day_key(s.get("ts", 0)), "sana": s.get("sana", ""),
                               "filial": s.get("filial", "") or "", "cheklar": 0, "jami": 0,
                               "naqd": 0, "karta": 0, "otkazma": 0, "qs": 0, "qsum": 0})
        if s.get("qaytarilgan"):
            r["qs"] += 1
            r["qsum"] += s.get("jami", 0)
            continue
        r["cheklar"] += 1
        r["jami"] += s.get("jami", 0)
        p = s.get("tolov_usuli")
        if p in ("naqd", "karta", "otkazma"):
            r[p] += s.get("jami", 0)
    rows = [
        [r["sana"], r["filial"], r["cheklar"], r["jami"], r["naqd"], r["karta"], r["otkazma"], r["qs"], r["qsum"]]
        for r in sorted(agg.values(), key=lambda r: (r["dk"], r["filial"]), reverse=True)
    ]
    header = ["sana", "filial", "cheklar", "jami_savdo", "naqd", "karta", "otkazma",
              "qaytarish_soni", "qaytarilgan_summa"]
    return "Hisobot", header, rows


def build_smenalar(d):
    rows = [
        [sh.get("sana", ""), sh.get("filial", ""), sh.get("xodim", ""), sh.get("sotuvSoni", 0),
         sh.get("jami_sotuv", 0), sh.get("naqdSotuv", 0), sh.get("boshlandi", ""), sh.get("tugadi", ""),
         sh.get("boshlangichPul", 0), sh.get("kutilganNaqd", ""), sh.get("haqiqiyNaqd", ""), sh.get("farq", "")]
        for sh in reversed(d["shifts"])
    ]
    header = ["sana", "filial", "xodim", "cheklar", "jami_sotuv", "naqd_sotuv", "boshlandi",
              "tugadi", "boshlangich_pul", "kutilgan_naqd", "haqiqiy_naqd", "farq"]
    return "Smenalar", header, rows


def build_mijozlar(d):
    customers = sorted(d["customers"], key=lambda c: c.get("jamiXarid", 0), reverse=True)
    rows = [
        [c.get("id", ""), c.get("ism", ""), c.get("telefon", ""), c.get("ballar", 0),
         c.get("jamiXarid", 0), c.get("xaridSoni", 0), c.get("izoh", "")]
        for c in customers
    ]
    return "Mijozlar", ["id", "ism", "telefon", "ballar", "jami_xarid", "xarid_soni", "izoh"], rows


def build_xodimlar(d):
    rows = [
        [e.get("id", ""), e.get("ism", ""), e.get("lavozim", ""), e.get("pin", ""),
         "ha" if e.get("aktiv") else "yoq"]
        for e in d["employees"]
    ]
    return "Xodimlar", ["id", "nom", "lavozim", "pin", "aktiv"], rows


def build_filiallar(d):
    rows = [
        [b.get("id", ""), b.get("nom", ""), b.get("manzil", ""), "ha" if b.get("aktiv") else "yoq"]
        for b in d["branches"]
    ]
    return "Filiallar", ["id", "nom", "manzil", "aktiv"], rows


BUILDERS = [build_mahsulotlar, build_sotuvlar, build_hisobot, build_smenalar,
            build_mijozlar, build_xodimlar, build_filiallar]


def main():
    # 1) Zaxira fayli
    if len(sys.argv) > 1:
        path = sys.argv[1]
    else:
        cands = sorted(glob.glob(os.path.join(os.path.expanduser("~"), "Downloads", "kassa-zaxira-*.json")))
        if not cands:
            print("Zaxira fayli topilmadi. Yo'lni argument qilib bering.")
            sys.exit(1)
        path = cands[-1]
    print(f"Zaxira: {path}")

    data = load_backup(path)

    # 2) Ulanish
    sheet_id, key = load_config()
    gc = gspread.authorize(Credentials.from_service_account_file(key, scopes=SCOPES))
    sh = gc.open_by_key(sheet_id)
    existing = {ws.title: ws for ws in sh.worksheets()}

    # 3) Har bir varaqni qurib, to'liq qayta yozish
    for build in BUILDERS:
        name, header, rows = build(data)
        all_rows = [header] + rows
        if name in existing:
            ws = existing[name]
            ws.clear()
        else:
            ws = sh.add_worksheet(title=name, rows=max(len(all_rows) + 5, 20), cols=len(header))
            existing[name] = ws
        ws.update(all_rows, value_input_option="USER_ENTERED")
        print(f"  ✓ {name}: {len(rows)} qator")

    # 4) Bo'sh standart "Varaq1" ni olib tashlash (agar bizning varaqlar tayyor bo'lsa)
    if "Varaq1" in existing and len(sh.worksheets()) > 1:
        try:
            sh.del_worksheet(existing["Varaq1"])
            print("  ✓ bo'sh 'Varaq1' o'chirildi")
        except Exception as e:
            print(f"  (Varaq1 o'chmadi: {e})")

    print(f"\nTayyor ✓ Jadval: \"{sh.title}\"")


if __name__ == "__main__":
    main()
