#!/usr/bin/env python3
"""
Pre-pipeline: Read uploaded CSVs, validate columns, normalise text,
and write cleaned data for the clustering stage.
"""
import sys
import csv
import json
import re
from pathlib import Path


def clean_text(text: str) -> str:
    text = re.sub(r'\s+', ' ', text or '').strip()
    return text


def main(state: str, district: str, crop: str, upload_dir: str, output_dir: str):
    src = Path(upload_dir)
    dst = Path(output_dir)
    dst.mkdir(parents=True, exist_ok=True)

    rows = []
    for csv_file in src.glob("*.csv"):
        with open(csv_file, newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                cleaned = {k: clean_text(v) for k, v in row.items()}
                cleaned["state"] = state
                cleaned["district"] = district
                cleaned["crop"] = crop
                rows.append(cleaned)

    out_path = dst / "preprocessed.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2, ensure_ascii=False)

    print(f"[PRE] Processed {len(rows)} rows from {len(list(src.glob('*.csv')))} file(s)")
    print(f"[PRE] Output -> {out_path}")


if __name__ == "__main__":
    main(*sys.argv[1:6])
