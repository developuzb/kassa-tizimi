#!/usr/bin/env python3
# ============================================================
# seed_catalog.py — SIM tarif katalogini Realtime Database'ga yozadi
# ------------------------------------------------------------
# nom format: "Kompaniya narx"  (masalan "Ucell 45 000")
# Humans uchun faqat 30 000, 50 000, 55 000 tariflar.
# RTDB 'services' tuguni PUT bilan to'liq qayta yoziladi.
#
# Foydalanish: python seed_catalog.py
# ============================================================

import json
import sys
import urllib.request

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

RTDB = "https://kassa-tizimi-1f09f-default-rtdb.europe-west1.firebasedatabase.app"

# (nom, emoji, tariflar)  — tarif berilmasa STANDART ishlatiladi
STANDARD = [45000, 55000, 65000, 70000, 80000, 90000, 100000, 110000,
            120000, 130000, 140000, 150000, 160000]

COMPANIES = [
    ("Ucell",     "💜", STANDARD),
    ("Mobiuz",    "💙", STANDARD),
    ("Beeline",   "💛", STANDARD),
    ("Uztelecom", "❤️", STANDARD),
    ("Humans",    "🖤", [30000, 50000, 55000]),
]


def slug(s):
    return s.lower().replace("'", "").replace(" ", "-")


def fmt(n):
    return f"{n:,}".replace(",", " ")   # 70000 -> "70 000"


def build():
    items = {}
    for comp, emoji, tariffs in COMPANIES:
        for t in tariffs:
            sid = f"sim-{slug(comp)}-{t}"
            items[sid] = {
                "id": sid,
                "nom": f"{comp} {fmt(t)}",
                "narx": t,
                "kategoriya": comp,
                "emoji": emoji,
                "aktiv": True,
            }
    return items


def main():
    items = build()
    data = json.dumps(items).encode("utf-8")
    url = f"{RTDB}/services.json"
    req = urllib.request.Request(url, data=data, method="PUT",
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        print("HTTP", r.status)
    print(f"{len(items)} ta mahsulot yozildi (PUT — to'liq qayta yozildi).")
    for comp, _, tariffs in COMPANIES:
        print(f"  {comp}: {len(tariffs)} ta tarif")


if __name__ == "__main__":
    main()
