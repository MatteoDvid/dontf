#!/usr/bin/env python3
"""
Télécharge une plage Google Sheets en CSV/JSON pour inspection locale.

Prérequis:
  - Python 3.9+
  - pip install -r scripts/requirements.txt
  - Variable GOOGLE_APPLICATION_CREDENTIALS pointant vers le JSON de service account
  - Variables du projet (sinon passer en arguments):
      * GOOGLE_SHEETS_SPREADSHEET_ID
      * GOOGLE_SHEETS_PRODUCTS_RANGE (ex: DF!A:Z)

Exemples:
  - CSV (par défaut -> data/sheet_dump.csv):
      python3 scripts/fetch_sheet.py
  - JSON:
      python3 scripts/fetch_sheet.py --out data/sheet_dump.json
  - En précisant l’ID/range:
      python3 scripts/fetch_sheet.py \
        --spreadsheet-id "<ID>" \
        --range "DF!A:Z" \
        --out data/df.csv
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from pathlib import Path

try:
    from google.oauth2.service_account import Credentials
    from googleapiclient.discovery import build
except Exception as e:
    print("[fetch_sheet] Dépendances manquantes. Installez-les avec:\n  pip install -r scripts/requirements.txt", file=sys.stderr)
    raise


def load_credentials_from_env() -> Credentials:
    keyfile = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if not keyfile:
        raise RuntimeError(
            "GOOGLE_APPLICATION_CREDENTIALS n’est pas défini. Pointez vers le JSON du service account."
        )
    key_path = Path(keyfile)
    if not key_path.is_file():
        raise FileNotFoundError(f"Fichier d’identifiants introuvable: {key_path}")
    scopes = ["https://www.googleapis.com/auth/spreadsheets.readonly"]
    return Credentials.from_service_account_file(str(key_path), scopes=scopes)


def fetch_values(spreadsheet_id: str, range_a1: str) -> list[list[str]]:
    creds = load_credentials_from_env()
    svc = build("sheets", "v4", credentials=creds)
    resp = (
        svc.spreadsheets()
        .values()
        .get(spreadsheetId=spreadsheet_id, range=range_a1)
        .execute()
    )
    values = resp.get("values", [])
    return values


def write_output(values: list[list[str]], out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if out_path.suffix.lower() == ".json":
        with out_path.open("w", encoding="utf-8") as f:
            json.dump({"values": values}, f, ensure_ascii=False, indent=2)
        print(f"[fetch_sheet] Écrit JSON: {out_path}")
    else:
        # CSV par défaut
        with out_path.open("w", encoding="utf-8", newline="") as f:
            writer = csv.writer(f)
            writer.writerows(values)
        print(f"[fetch_sheet] Écrit CSV: {out_path}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Télécharger une plage Google Sheets")
    parser.add_argument(
        "--spreadsheet-id",
        default=os.getenv("GOOGLE_SHEETS_SPREADSHEET_ID", ""),
        help="ID du Google Spreadsheet (défaut: $GOOGLE_SHEETS_SPREADSHEET_ID)",
    )
    parser.add_argument(
        "--range",
        dest="range_a1",
        default=os.getenv("GOOGLE_SHEETS_PRODUCTS_RANGE", "DF!A:Z"),
        help="Plage A1 à lire (défaut: $GOOGLE_SHEETS_PRODUCTS_RANGE ou DF!A:Z)",
    )
    parser.add_argument(
        "--out",
        default="data/sheet_dump.csv",
        help="Fichier de sortie (.csv ou .json). Défaut: data/sheet_dump.csv",
    )
    args = parser.parse_args()

    if not args.spreadsheet_id:
        print(
            "[fetch_sheet] Manque --spreadsheet-id ou $GOOGLE_SHEETS_SPREADSHEET_ID",
            file=sys.stderr,
        )
        return 2

    try:
        values = fetch_values(args.spreadsheet_id, args.range_a1)
        write_output(values, Path(args.out))
        return 0
    except Exception as e:
        print(f"[fetch_sheet] Erreur: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())


