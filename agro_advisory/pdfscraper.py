#!/usr/bin/env python3
"""Extract structured tables and advisories from Agromet Weather Bulletins using pdfplumber.

Supported features:
  1. District Past Weather Data table extraction
  2. District 5-Day Weather Forecast table extraction
  3. Block / Taluk level Weather Forecast tables (with cross-page stitching)
  4. Crop-specific Advisory & Pest Management tables (with multi-page merging)
  5. General & SMS Advisory extraction
  6. Generic fallback table extraction for any PDF
  7. Multi-format export: JSON, CSV, and multi-sheet Excel (.xlsx)
"""

from __future__ import annotations

import argparse
import io
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

import pandas as pd
import pdfplumber
from tabulate import tabulate


WEATHER_PARAM_KEYWORDS = [
    "rainfall",
    "max. temp",
    "max.temp",
    "min. temp",
    "min.temp",
    "tmax",
    "tmin",
    "sky condition",
    "cloud cover",
    "relative humidity",
    "humidity",
    "wind speed",
    "wind direction",
]


def clean_cell_text(text: Optional[str]) -> str:
    """Normalize cell text by stripping whitespace and removing newlines."""
    if text is None:
        return ""
    # Replace non-breaking spaces and clean whitespace
    text = text.replace("\xa0", " ").replace("\r\n", " ").replace("\n", " ")
    return re.sub(r"\s+", " ", text).strip()


def extract_bulletin_metadata(pdf: pdfplumber.PDF) -> Dict[str, Any]:
    """Extract metadata such as district, state, issue date, and institute from PDF."""
    metadata: Dict[str, Any] = {
        "title": "",
        "district": "",
        "state": "",
        "date": "",
        "bulletin_no": "",
        "total_pages": len(pdf.pages),
    }

    if not pdf.pages:
        return metadata

    p1_text = pdf.pages[0].extract_text() or ""

    date_match = re.search(r"Date\s*:\s*([\d\.\-\/]+)", p1_text, re.IGNORECASE)
    if date_match:
        metadata["date"] = date_match.group(1).strip()

    bulletin_match = re.search(r"Bulletin\s*(?:No\.?)?\s*:\s*([^\n\r,]+)", p1_text, re.IGNORECASE)
    if bulletin_match:
        metadata["bulletin_no"] = bulletin_match.group(1).strip()

    district_match = re.search(
        r"BULLETIN\s+(?:FOR\s+)?([A-Z\s\-]+?)\s+DISTRICT", p1_text, re.IGNORECASE
    )
    if district_match:
        metadata["district"] = district_match.group(1).strip()
    else:
        # Fallback search for District: <Name>
        alt_dist = re.search(r"District\s*:\s*([A-Za-z\s]+)", p1_text)
        if alt_dist:
            metadata["district"] = alt_dist.group(1).strip()

    # Detect title / university
    for line in p1_text.splitlines()[:5]:
        line_clean = line.strip()
        if "UNIVERSITY" in line_clean.upper() or "METEOROLOGICAL" in line_clean.upper():
            metadata["title"] = line_clean
            break

    return metadata


def extract_past_weather_table(pdf: pdfplumber.PDF) -> Optional[pd.DataFrame]:
    """Extract the Past Weather Data table from page 1 if present."""
    if not pdf.pages:
        return None

    p1 = pdf.pages[0]
    tables = p1.extract_tables()

    for table in tables:
        cleaned_rows: List[List[str]] = []
        for row in table:
            cleaned = [clean_cell_text(c) for c in row if c is not None and clean_cell_text(c)]
            if cleaned:
                cleaned_rows.append(cleaned)

        table_text = " ".join(" ".join(r) for r in cleaned_rows).lower()
        if "past weather" not in table_text and "realized" not in table_text:
            continue

        header_row: Optional[List[str]] = None
        data_rows: List[List[str]] = []

        for row in cleaned_rows:
            if "Parameter" in row[0] and header_row is None:
                header_row = row
            elif header_row and len(row) == len(header_row):
                if any(kw in row[0].lower() for kw in WEATHER_PARAM_KEYWORDS):
                    data_rows.append(row)

        if header_row and data_rows:
            return pd.DataFrame(data_rows, columns=header_row)

    return None


def extract_district_forecast_table(pdf: pdfplumber.PDF) -> Optional[pd.DataFrame]:
    """Extract the 5-day District Weather Forecast table from page 1."""
    if not pdf.pages:
        return None

    p1 = pdf.pages[0]
    tables = p1.extract_tables()

    for table in tables:
        cleaned_rows: List[List[str]] = []
        for row in table:
            cleaned = [clean_cell_text(c) for c in row if c is not None and clean_cell_text(c)]
            if cleaned:
                cleaned_rows.append(cleaned)

        table_text = " ".join(" ".join(r) for r in cleaned_rows).lower()
        # If this table is explicitly past weather, skip it
        if "past weather" in table_text:
            continue

        header_row: Optional[List[str]] = None
        data_rows: List[List[str]] = []

        for row in cleaned_rows:
            if "parameter" in row[0].lower() and len(row) >= 4:
                header_row = row
            elif header_row and len(row) == len(header_row):
                # Ensure it's a weather parameter row
                if any(kw in row[0].lower() for kw in WEATHER_PARAM_KEYWORDS):
                    data_rows.append(row)

        if header_row and data_rows:
            return pd.DataFrame(data_rows, columns=header_row)

    return None


def extract_block_forecast_tables(pdf: pdfplumber.PDF) -> Dict[str, pd.DataFrame]:
    """Extract all Block/Taluk-level weather forecast tables, stitching split tables across pages."""
    block_tables: Dict[str, Dict[str, Any]] = {}
    current_block: Optional[str] = None
    last_header: Optional[List[str]] = None

    # Blacklist terms that might be mistaken for block titles
    blacklist_terms = [
        "advisory",
        "download",
        "realized",
        "week",
        "http",
        "amfu",
        "forecast",
        "relative",
        "wind",
        "parameter",
        "damini",
        "mausam",
        "meghdoot",
        "summary",
        "temperature",
        "rainfall",
        "maximum",
        "minimum",
    ]

    for p_idx in range(len(pdf.pages)):
        # Block level forecasts are given on pages after the main district page
        if p_idx == 0:
            continue

        page = pdf.pages[p_idx]
        tables = page.extract_tables()

        for t in tables:
            cleaned_rows: List[List[str]] = []
            for row in t:
                c_row = [clean_cell_text(c) for c in row]
                non_empty = [c for c in c_row if c]
                if non_empty:
                    cleaned_rows.append(non_empty)

            if not cleaned_rows:
                continue

            for row in cleaned_rows:
                first_val = row[0]

                # Check if single cell is a block name header
                if len(row) == 1:
                    val = first_val.replace("Block level weather forecast", "").strip()
                    if (
                        val
                        and len(val) <= 40
                        and not any(term in val.lower() for term in blacklist_terms)
                    ):
                        current_block = val
                        if current_block not in block_tables:
                            block_tables[current_block] = {"header": None, "rows": []}

                # Check for parameter header row
                elif len(row) >= 5 and "parameter" in first_val.lower():
                    if current_block:
                        block_tables[current_block]["header"] = row
                        last_header = row

                # Check for parameter data rows
                elif len(row) >= 5 and any(kw in first_val.lower() for kw in WEATHER_PARAM_KEYWORDS):
                    if current_block:
                        block_tables[current_block]["rows"].append(row)

    # Convert collected rows into DataFrames
    block_dfs: Dict[str, pd.DataFrame] = {}
    for block_name, info in block_tables.items():
        rows = info["rows"]
        if not rows:
            continue

        header = info["header"] or last_header
        # Verify row length matches header length
        if header and len(header) == len(rows[0]):
            df = pd.DataFrame(rows, columns=header)
        else:
            df = pd.DataFrame(rows)

        # De-duplicate rows by Parameter column if any duplicates exist
        if "Parameter" in df.columns:
            df = df.drop_duplicates(subset=["Parameter"], keep="last")

        block_dfs[block_name] = df

    return block_dfs


def extract_crop_advisories_table(pdf: pdfplumber.PDF) -> Optional[pd.DataFrame]:
    """Extract Crop Advisory and Pest Management table spanning multiple pages."""
    col_x_boundaries = [45, 114, 192, 369, 455, 560]
    col_names = [
        "Crop",
        "Crop Stage",
        "Weather-based Advisory",
        "Likely Pests / Diseases",
        "Recommended Management",
    ]

    raw_extracted_rows: List[List[str]] = []

    for p_idx, page in enumerate(pdf.pages):
        p_no = p_idx + 1
        text = page.extract_text() or ""

        # Check if page contains crop advisory content
        is_crop_page = (
            "Recommendations to the farmers" in text
            or "Weather-based Advisory" in text
            or ("Wilt, Pod" in text and "Maize" in text)
            or ("blackgram instead of delayed" in text and p_no == 4)
        )

        if not is_crop_page:
            continue

        # Determine y-bounding region for crop table
        if p_no == 2:
            top_y, bot_y = 445.0, 770.0
        elif p_no == 3:
            top_y, bot_y = 70.0, 770.0
        elif p_no == 4:
            top_y, bot_y = 70.0, 135.0
        else:
            top_y, bot_y = 70.0, 770.0

        # Find horizontal grid line coordinates
        rects = [
            r
            for r in page.rects
            if r["height"] < 3 and r["width"] > 100 and top_y <= r["top"] <= bot_y + 10
        ]
        y_lines = sorted(list(set([round(r["top"], 1) for r in rects])))

        words = page.extract_words()
        for i in range(len(y_lines) - 1):
            y0, y1 = y_lines[i], y_lines[i + 1]
            row_words = [
                w for w in words if (y0 - 1) <= w["top"] <= y1 and 40 <= w["x0"] <= 565
            ]

            cols = [""] * 5
            for c_i in range(5):
                cx0, cx1 = col_x_boundaries[c_i], col_x_boundaries[c_i + 1]
                c_words = [
                    w["text"]
                    for w in sorted(row_words, key=lambda w: (w["top"], w["x0"]))
                    if (cx0 - 2) <= w["x0"] < cx1
                ]
                cols[c_i] = clean_cell_text(" ".join(c_words))

            if any(cols):
                raw_extracted_rows.append(cols)

    if not raw_extracted_rows:
        # Fallback to generic advisory extraction if specialized layout not found
        return _extract_generic_advisory_table(pdf)

    # Merge multi-page continuation rows
    merged_rows: List[List[str]] = []
    for row in raw_extracted_rows:
        crop_name = row[0]
        if crop_name:
            merged_rows.append(row)
        else:
            # Continuation of previous row
            if merged_rows:
                for col_idx in range(1, 5):
                    if row[col_idx]:
                        prev_val = merged_rows[-1][col_idx]
                        merged_rows[-1][col_idx] = f"{prev_val} {row[col_idx]}".strip()

    if not merged_rows:
        return None

    return pd.DataFrame(merged_rows, columns=col_names)


def _extract_generic_advisory_table(pdf: pdfplumber.PDF) -> Optional[pd.DataFrame]:
    """Fallback extraction for crop advisory tables in other format styles (e.g. West Bengal)."""
    advisory_rows: List[List[str]] = []
    header: List[str] = ["Category / Crop (Stage)", "Specific Advisory"]

    for page in pdf.pages:
        tables = page.extract_tables()
        for t in tables:
            for row in t:
                cleaned = [clean_cell_text(c) for c in row if c is not None and clean_cell_text(c)]
                if len(cleaned) == 2 and not cleaned[0].lower().startswith("parameter"):
                    if "advisory" in cleaned[1].lower() or "stage" in cleaned[0].lower():
                        header = cleaned
                    else:
                        advisory_rows.append(cleaned)

    if advisory_rows:
        return pd.DataFrame(advisory_rows, columns=header)
    return None


def extract_text_advisories(pdf: pdfplumber.PDF) -> Dict[str, str]:
    """Extract General Advisory, SMS Advisory, and Forecast Summaries."""
    advisories: Dict[str, str] = {}
    full_text = "\n".join(page.extract_text() or "" for page in pdf.pages)

    # Extract Forecast Summary
    fc_summary = re.search(
        r"Forecast Summary\s*\n(.*?)(?=\nGeneral Advisory|\nSMS Advisory|\nRecommendations|\Z)",
        full_text,
        re.DOTALL | re.IGNORECASE,
    )
    if fc_summary:
        advisories["Forecast Summary"] = clean_cell_text(fc_summary.group(1))

    # Extract General Advisory
    gen_adv = re.search(
        r"General Advisory\s*:\s*\n(.*?)(?=\nSMS Advisory|\nRecommendations|\nWeather based|\Z)",
        full_text,
        re.DOTALL | re.IGNORECASE,
    )
    if gen_adv:
        advisories["General Advisory"] = clean_cell_text(gen_adv.group(1))

    # Extract SMS Advisory
    sms_adv = re.search(
        r"SMS Advisory\s*:\s*\n(.*?)(?=\nRecommendations|\nWeather based|\nCrop|\Z)",
        full_text,
        re.DOTALL | re.IGNORECASE,
    )
    if sms_adv:
        advisories["SMS Advisory"] = clean_cell_text(sms_adv.group(1))

    return advisories


def extract_all_generic_tables(pdf: pdfplumber.PDF) -> List[Dict[str, Any]]:
    """Extract all raw tables from the PDF and convert each into a cleaned pandas DataFrame."""
    generic_tables: List[Dict[str, Any]] = []

    for p_idx, page in enumerate(pdf.pages):
        tables = page.extract_tables()
        for t_idx, table in enumerate(tables):
            cleaned = [
                [clean_cell_text(c) for c in row]
                for row in table
            ]
            # Remove empty rows
            cleaned = [r for r in cleaned if any(r)]
            if not cleaned:
                continue

            # Remove entirely empty columns
            num_cols = len(cleaned[0])
            valid_col_indices = [
                c_i for c_i in range(num_cols) if any(row[c_i] for row in cleaned)
            ]
            trimmed = [[row[c_i] for c_i in valid_col_indices] for row in cleaned]

            if not trimmed:
                continue

            # Determine DataFrame header
            if len(trimmed) > 1:
                header = trimmed[0]
                # Ensure unique column names
                seen: Dict[str, int] = {}
                uniq_header: List[str] = []
                for col in header:
                    name = col if col else "Col"
                    count = seen.get(name, 0)
                    seen[name] = count + 1
                    uniq_header.append(f"{name}_{count}" if count > 0 else name)

                df = pd.DataFrame(trimmed[1:], columns=uniq_header)
            else:
                df = pd.DataFrame(trimmed)

            generic_tables.append({
                "page": p_idx + 1,
                "table_index": t_idx + 1,
                "dataframe": df,
            })

    return generic_tables


def extract_tables(
    pdf_source: Union[str, Path, io.BytesIO, bytes],
    file_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Top-level pipeline to extract all structured Agromet data and raw tables from a PDF path or in-memory bytes."""
    if isinstance(pdf_source, bytes):
        pdf_obj = io.BytesIO(pdf_source)
        fname = file_name or "in_memory_bulletin.pdf"
    elif isinstance(pdf_source, io.BytesIO):
        pdf_obj = pdf_source
        fname = file_name or getattr(pdf_source, "name", "in_memory_bulletin.pdf")
    else:
        pdf_path = Path(pdf_source)
        if not pdf_path.exists():
            raise FileNotFoundError(f"PDF file not found: {pdf_path}")
        pdf_obj = pdf_path
        fname = pdf_path.name

    with pdfplumber.open(pdf_obj) as pdf:
        metadata = extract_bulletin_metadata(pdf)
        metadata["file_name"] = fname

        past_weather = extract_past_weather_table(pdf)
        district_forecast = extract_district_forecast_table(pdf)
        block_forecasts = extract_block_forecast_tables(pdf)
        crop_advisory = extract_crop_advisories_table(pdf)
        advisories = extract_text_advisories(pdf)
        raw_tables = extract_all_generic_tables(pdf)

    return {
        "metadata": metadata,
        "past_weather": past_weather,
        "district_forecast": district_forecast,
        "block_forecasts": block_forecasts,
        "crop_advisory": crop_advisory,
        "advisories": advisories,
        "raw_tables": raw_tables,
    }


def export_tables(
    data: Dict[str, Any],
    out_dir: Union[str, Path] = "extracted_tables",
    formats: Optional[List[str]] = None,
) -> Dict[str, List[Path]]:
    """Export extracted DataFrames and metadata to JSON, CSV, and Excel formats."""
    if formats is None:
        formats = ["json", "csv", "xlsx"]

    out_path = Path(out_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    base_name = Path(data["metadata"].get("file_name", "bulletin")).stem
    exported_files: Dict[str, List[Path]] = {fmt: [] for fmt in formats}

    # 1. JSON Export
    if "json" in formats:
        json_data: Dict[str, Any] = {
            "metadata": data["metadata"],
            "advisories": data["advisories"],
            "past_weather": (
                data["past_weather"].to_dict(orient="records")
                if data["past_weather"] is not None
                else None
            ),
            "district_forecast": (
                data["district_forecast"].to_dict(orient="records")
                if data["district_forecast"] is not None
                else None
            ),
            "block_forecasts": {
                block_name: df.to_dict(orient="records")
                for block_name, df in data["block_forecasts"].items()
            },
            "crop_advisory": (
                data["crop_advisory"].to_dict(orient="records")
                if data["crop_advisory"] is not None
                else None
            ),
        }
        json_file = out_path / f"{base_name}.json"
        with open(json_file, "w", encoding="utf-8") as f:
            json.dump(json_data, f, indent=2, ensure_ascii=False)
        exported_files["json"].append(json_file)

    # 2. CSV Export
    if "csv" in formats:
        csv_dir = out_path / f"{base_name}_csv"
        csv_dir.mkdir(parents=True, exist_ok=True)

        if data["past_weather"] is not None:
            p = csv_dir / "past_weather.csv"
            data["past_weather"].to_csv(p, index=False)
            exported_files["csv"].append(p)

        if data["district_forecast"] is not None:
            p = csv_dir / "district_forecast.csv"
            data["district_forecast"].to_csv(p, index=False)
            exported_files["csv"].append(p)

        if data["crop_advisory"] is not None:
            p = csv_dir / "crop_advisory.csv"
            data["crop_advisory"].to_csv(p, index=False)
            exported_files["csv"].append(p)

        for block_name, df in data["block_forecasts"].items():
            safe_block_name = re.sub(r"[^A-Za-z0-9_]+", "_", block_name).strip("_")
            p = csv_dir / f"block_{safe_block_name}.csv"
            df.to_csv(p, index=False)
            exported_files["csv"].append(p)

    # 3. Excel Export (.xlsx)
    if "xlsx" in formats:
        excel_file = out_path / f"{base_name}.xlsx"
        try:
            with pd.ExcelWriter(excel_file, engine="openpyxl") as writer:
                if data["past_weather"] is not None:
                    data["past_weather"].to_excel(
                        writer, sheet_name="Past Weather", index=False
                    )

                if data["district_forecast"] is not None:
                    data["district_forecast"].to_excel(
                        writer, sheet_name="District Forecast", index=False
                    )

                if data["crop_advisory"] is not None:
                    data["crop_advisory"].to_excel(
                        writer, sheet_name="Crop Advisory", index=False
                    )

                for block_name, df in data["block_forecasts"].items():
                    safe_sheet = re.sub(r"[^A-Za-z0-9_ ]+", "", block_name)[:31]
                    df.to_excel(writer, sheet_name=safe_sheet, index=False)

            exported_files["xlsx"].append(excel_file)
        except Exception as exc:
            print(f"Warning: Could not write Excel file ({exc})", file=sys.stderr)

    return exported_files


def print_summary(data: Dict[str, Any]) -> None:
    """Print formatted tables and summary to the console."""
    meta = data["metadata"]
    print("\n" + "=" * 80)
    print(f"  AGROMET BULLETIN: {meta.get('district', 'N/A')} ({meta.get('date', 'N/A')})")
    print(f"  Source: {meta.get('file_name', 'PDF')} | Total Pages: {meta.get('total_pages')}")
    print("=" * 80)

    # Past Weather Data
    if data["past_weather"] is not None:
        print("\n--- PAST WEATHER DATA ---")
        print(tabulate(data["past_weather"], headers="keys", tablefmt="fancy_grid", showindex=False))

    # District Weather Forecast
    if data["district_forecast"] is not None:
        print("\n--- DISTRICT 5-DAY WEATHER FORECAST ---")
        print(tabulate(data["district_forecast"], headers="keys", tablefmt="fancy_grid", showindex=False))

    # Block Level Forecasts
    if data["block_forecasts"]:
        print(f"\n--- BLOCK-LEVEL FORECASTS ({len(data['block_forecasts'])} Blocks Detected) ---")
        for block_name, df in data["block_forecasts"].items():
            print(f"\n[Block: {block_name}]")
            print(tabulate(df, headers="keys", tablefmt="grid", showindex=False))

    # Crop Advisory Table
    if data["crop_advisory"] is not None:
        print(f"\n--- CROP ADVISORY & PEST MANAGEMENT ({len(data['crop_advisory'])} Crops) ---")
        display_df = data["crop_advisory"].copy()
        # Truncate long columns for clean console viewing
        for col in ["Weather-based Advisory", "Recommended Management"]:
            if col in display_df.columns:
                display_df[col] = display_df[col].apply(
                    lambda s: s[:75] + "..." if len(str(s)) > 75 else s
                )
        print(tabulate(display_df, headers="keys", tablefmt="fancy_grid", showindex=False))

    # Advisories
    if data["advisories"]:
        print("\n--- GENERAL / SMS ADVISORIES ---")
        for title, content in data["advisories"].items():
            print(f"• {title}:")
            print(f"  {content}\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "-p",
        "--pdf",
        default="downloads/Karnataka_Mysuru.pdf",
        help="Path to the PDF file to extract (default: downloads/Karnataka_Mysuru.pdf)",
    )
    parser.add_argument(
        "-o",
        "--out",
        default="extracted_tables",
        help="Output directory for exported table files (default: extracted_tables)",
    )
    parser.add_argument(
        "-f",
        "--format",
        nargs="+",
        choices=["json", "csv", "xlsx", "all", "none"],
        default=["all"],
        help="Export format(s): json, csv, xlsx, all, or none (default: all)",
    )
    parser.add_argument(
        "--all-downloads",
        action="store_true",
        help="Process all PDFs found in the downloads directory",
    )
    parser.add_argument(
        "--no-print",
        action="store_true",
        help="Suppress terminal table printing",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    formats = ["json", "csv", "xlsx"] if "all" in args.format else [f for f in args.format if f != "none"]

    pdf_targets: List[Path] = []
    if args.all_downloads:
        pdf_targets = sorted(list(Path("downloads").glob("*.pdf")))
        if not pdf_targets:
            print("No PDFs found in downloads directory.", file=sys.stderr)
            return 1
    else:
        pdf_targets = [Path(args.pdf)]

    for pdf_path in pdf_targets:
        if not pdf_path.exists():
            print(f"File not found: {pdf_path}", file=sys.stderr)
            continue

        print(f"\nProcessing {pdf_path}...")
        try:
            data = extract_tables(pdf_path)

            if not args.no_print:
                print_summary(data)

            if formats:
                exported = export_tables(data, out_dir=args.out, formats=formats)
                print(f"Exported files to {args.out}/:")
                for fmt, paths in exported.items():
                    for p in paths:
                        print(f"  [{fmt.upper()}] {p}")

        except Exception as exc:
            print(f"Error processing {pdf_path}: {exc}", file=sys.stderr)
            import traceback
            traceback.print_exc()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
