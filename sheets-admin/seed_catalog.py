#!/usr/bin/env python3
# ============================================================
# seed_catalog.py — SIM tarif katalogini Realtime Database'ga yozadi
# ------------------------------------------------------------
# Kompaniyalar x tariflar (65 ta mahsulot). 70 000 va undan baland
# tariflarda "🎁 1+1" bonus belgilanadi. RTDB 'services' tuguniga
# PATCH (qo'shish/yangilash) qilinadi — mavjud boshqa mahsulotlar o'chmaydi.
#
# Foydalanish: python seed_catalog.py
# ============================================================

import json
import sys
import urllib.request

try:
    sys.stdout.reconfigure(encoding="utf-8")   # Windows konsolida emoji chiqishi uchun
except Exception:
    pass

RTDB = "https://kassa-tizimi-1f09f-default-rtdb.europe-west1.firebasedatabase.app"

COMPANIES = [
    ("Ucell",     "💜"),
    ("Mobiuz",    "💙"),
    ("Beeline",   "💛"),
    ("Uztelecom", "❤️"),
    ("Humans",    "🖤"),
]

TARIFFS = [45000, 55000, 65000, 70000, 80000, 90000, 100000, 110000,
           120000, 130000, 140000, 150000, 160000]

BONUS_FROM = 70000   # shu narx va undan baland -> 1+1 bonus


def slug(s):
    return (s.lower().replace("'", "").replace(" ", "-"))


def fmt(n):
    return f"{n:,}".replace(",", " ")   # 70000 -> "70 000"


def build():
    items = {}
    for comp, emoji in COMPANIES:
        for t in TARIFFS:
            bonus = t >= BONUS_FROM
            sid = f"sim-{slug(comp)}-{t}"
            nom = fmt(t) + (" 🎁 1+1" if bonus else "")
            items[sid] = {
                "id": sid,
                "nom": nom,
                "narx": t,
                "kategoriya": comp,
                "emoji": emoji,
                "aktiv": True,
                "bonus": bonus,        # 1+1 bonus bayrog'i (kelajak uchun)
            }
    return items


def main():
    items = build()
    data = json.dumps(items).encode("utf-8")
    url = f"{RTDB}/services.json"
    req = urllib.request.Request(url, data=data, method="PATCH",
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        print("HTTP", r.status)
    print(f"{len(items)} ta mahsulot yozildi.")
    bonus_n = sum(1 for v in items.values() if v["bonus"])
    print(f"  shundan 🎁 1+1 bonusli: {bonus_n} ta (>= {fmt(BONUS_FROM)})")


if __name__ == "__main__":
    main()
