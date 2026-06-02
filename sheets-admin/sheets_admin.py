#!/usr/bin/env python3
# ============================================================
# sheets_admin.py — Google Sheets'ni service account orqali boshqarish CLI
# ------------------------------------------------------------
# Claude shu skript orqali Sheet'ni o'qiydi/yozadi. Maxfiy kalit
# (service-account.json) shu papkada turadi va .gitignore bilan
# commit'dan himoyalangan.
#
# Sozlash: config.json (config.example.json'dan nusxa oling):
#   { "sheet_id": "...", "key_file": "service-account.json" }
# Yoki muhit o'zgaruvchilari: SHEET_ID, SHEETS_KEY
#
# Buyruqlar:
#   info                      — jadval nomi va barcha varaqlar
#   tabs                      — varaq nomlari ro'yxati
#   read   <varaq>            — varaqning barcha qatorlari (JSON)
#   replace <varaq> <json>    — varaqni to'liq qayta yozish
#                               json: {"header":[...],"rows":[[...]]} yoki [[...]]
#   append  <varaq> <json>    — bitta qator qo'shish: [qiymat, ...]
#   add-tab <nom> [qator] [ustun]  — yangi varaq yaratish
#   del-tab <nom>             — varaqni o'chirish
#
# Misol:
#   python sheets_admin.py tabs
#   python sheets_admin.py read Sotuvlar
#   python sheets_admin.py append Sotuvlar "[\"2026-06-02\",\"Test\",5000]"
# ============================================================

import json
import os
import sys

import gspread
from google.oauth2.service_account import Credentials

# Windows konsolida unicode chiqishi uchun
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

HERE = os.path.dirname(os.path.abspath(__file__))


def load_config():
    """config.json + muhit o'zgaruvchilaridan sozlamani yig'adi."""
    cfg = {}
    cfg_path = os.path.join(HERE, "config.json")
    if os.path.exists(cfg_path):
        with open(cfg_path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
    sheet_id = os.environ.get("SHEET_ID") or cfg.get("sheet_id")
    key_file = os.environ.get("SHEETS_KEY") or cfg.get("key_file", "service-account.json")
    if not os.path.isabs(key_file):
        key_file = os.path.join(HERE, key_file)
    if not sheet_id:
        die("Sheet ID topilmadi. config.json yoki SHEET_ID o'zgaruvchisini sozlang.")
    if not os.path.exists(key_file):
        die(f"Kalit fayli topilmadi: {key_file}")
    return sheet_id, key_file


def die(msg):
    print(json.dumps({"ok": False, "error": msg}, ensure_ascii=False))
    sys.exit(1)


def out(obj):
    print(json.dumps(obj, ensure_ascii=False, indent=2))


def client(key_file):
    creds = Credentials.from_service_account_file(key_file, scopes=SCOPES)
    return gspread.authorize(creds)


def get_ws(sh, name):
    try:
        return sh.worksheet(name)
    except gspread.WorksheetNotFound:
        die(f"Varaq topilmadi: {name}")


def main():
    args = sys.argv[1:]
    if not args:
        die("Buyruq kerak. Misol: info | tabs | read <varaq> | replace <varaq> <json> | append <varaq> <json>")

    cmd = args[0]
    sheet_id, key_file = load_config()
    gc = client(key_file)
    sh = gc.open_by_key(sheet_id)

    if cmd == "info":
        out({"ok": True, "title": sh.title, "tabs": [ws.title for ws in sh.worksheets()]})

    elif cmd == "tabs":
        out({"ok": True, "tabs": [ws.title for ws in sh.worksheets()]})

    elif cmd == "read":
        if len(args) < 2:
            die("Foydalanish: read <varaq>")
        ws = get_ws(sh, args[1])
        out({"ok": True, "sheet": args[1], "values": ws.get_all_values()})

    elif cmd == "replace":
        if len(args) < 3:
            die("Foydalanish: replace <varaq> <json>")
        ws = get_ws(sh, args[1])
        payload = json.loads(args[2])
        if isinstance(payload, dict):
            rows = ([payload["header"]] if payload.get("header") else []) + payload.get("rows", [])
        else:
            rows = payload
        ws.clear()
        if rows:
            ws.update(rows, value_input_option="USER_ENTERED")
        out({"ok": True, "sheet": args[1], "written_rows": len(rows)})

    elif cmd == "append":
        if len(args) < 3:
            die("Foydalanish: append <varaq> <json-qator>")
        ws = get_ws(sh, args[1])
        row = json.loads(args[2])
        ws.append_row(row, value_input_option="USER_ENTERED")
        out({"ok": True, "sheet": args[1], "appended": row})

    elif cmd == "add-tab":
        if len(args) < 2:
            die("Foydalanish: add-tab <nom> [qator] [ustun]")
        rows = int(args[2]) if len(args) > 2 else 100
        cols = int(args[3]) if len(args) > 3 else 20
        ws = sh.add_worksheet(title=args[1], rows=rows, cols=cols)
        out({"ok": True, "created": ws.title})

    elif cmd == "del-tab":
        if len(args) < 2:
            die("Foydalanish: del-tab <nom>")
        sh.del_worksheet(get_ws(sh, args[1]))
        out({"ok": True, "deleted": args[1]})

    else:
        die(f"Noma'lum buyruq: {cmd}")


if __name__ == "__main__":
    main()
