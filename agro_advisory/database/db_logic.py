#!/usr/bin/env python3
"""Database ingestion and query logic for Agromet MongoDB.

Collections:
  1. `districts`: Static reference data (district, state, kvk_name, created_at).
                  Index: { district: 1, state: 1 } (unique).
  2. `weather`:   Append-only daily forecast records (one doc per forecast day).
                  Includes state, district, dates, and all numeric weather params.
  3. `bulletins`: Append-only advisory records (one doc per advisory item/crop).
                  Includes state, district, subject, category, stage, texts, URL.
"""

from __future__ import annotations

import argparse
import io
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import pandas as pd
from bson import ObjectId
from dotenv import load_dotenv
from pymongo.database import Database

# Load environment variables from .env
env_path = Path(__file__).resolve().parent.parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

# Support importing within package or directly
try:
    from database.db_connection import check_connection, get_db
except ImportError:
    from db_connection import check_connection, get_db

try:
    from pdfscraper import extract_tables
except ImportError:
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from pdfscraper import extract_tables


# ---------------------------------------------------------------------------
# Helpers for Data Parsing & Normalization
# ---------------------------------------------------------------------------

def parse_date(date_val: Optional[Union[str, datetime]]) -> Optional[datetime]:
    """Parse various date formats or datetime objects into a timezone-aware UTC datetime (BSON ISODate)."""
    if date_val is None:
        return None

    # Handle if already a datetime
    if isinstance(date_val, datetime):
        if date_val.tzinfo is None:
            return date_val.replace(tzinfo=timezone.utc)
        return date_val.astimezone(timezone.utc)

    cleaned = str(date_val).strip()
    if not cleaned or cleaned.lower() in ("none", "null", "nan", "nat", ""):
        return None

    # 1. Try ISO 8601 / fromisoformat
    try:
        iso_str = cleaned.replace("Z", "+00:00")
        dt = datetime.fromisoformat(iso_str)
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except (ValueError, TypeError):
        pass

    # 2. Try common numeric and alphanumeric bulletin formats
    formats = [
        "%d.%m.%Y",
        "%Y-%m-%d",
        "%d-%m-%Y",
        "%d/%m/%Y",
        "%Y/%m/%d",
        "%d-%b-%Y",
        "%d %b %Y",
        "%d %B %Y",
        "%d.%b.%Y",
        "%d.%m.%y",
        "%d-%m-%y",
        "%d/%m/%y",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(cleaned, fmt)
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            pass

    # 3. Regex extraction for embedded dates (e.g. '11.08.2026' or '2026-08-11')
    match = re.search(r"(\d{4}-\d{2}-\d{2})|(\d{2}[\.\-\/]\d{2}[\.\-\/]\d{4})", cleaned)
    if match:
        matched_str = match.group(0).replace("/", ".").replace("-", ".")
        for fmt in ("%Y.%m.%d", "%d.%m.%Y"):
            try:
                dt = datetime.strptime(matched_str, fmt)
                return dt.replace(tzinfo=timezone.utc)
            except ValueError:
                pass

    return None


def parse_numeric(val: Any) -> Optional[float]:
    """Convert raw cell values (e.g. '32.0', '1–3', '0', None) to float."""
    if val is None:
        return None
    val_str = str(val).strip()
    if not val_str or val_str in ("-", "NA", "N/A", "nil", "None"):
        return None

    # Handle ranges like '1–3' or '1-3' by taking average or first value
    if "–" in val_str or "-" in val_str:
        parts = re.findall(r"[-+]?\d*\.?\d+", val_str)
        if parts:
            try:
                return float(parts[0])
            except ValueError:
                return None

    match = re.search(r"[-+]?\d*\.?\d+", val_str)
    if match:
        try:
            return float(match.group(0))
        except ValueError:
            return None
    return None


def detect_category(subject: str, advisory_text: str = "") -> str:
    """Classify advisory category into crop, horticulture, livestock, fishery, or others."""
    sub_lower = subject.lower().strip()
    text_lower = advisory_text.lower().strip()
    combined = f"{sub_lower} {text_lower}"

    # Livestock keywords
    livestock_terms = [
        "cow", "cattle", "buffalo", "sheep", "goat", "poultry", "chicken",
        "duck", "pig", "animal", "livestock", "fodder", "dairy"
    ]
    if any(term in sub_lower for term in livestock_terms):
        return "livestock"

    # Fishery keywords
    fishery_terms = ["fish", "fishery", "fingerling", "carp", "pond", "aquaculture"]
    if any(term in sub_lower for term in fishery_terms):
        return "fishery"

    # Horticulture keywords
    horticulture_terms = [
        "chilli", "tomato", "brinjal", "eggplant", "okra", "potato", "onion",
        "garlic", "ginger", "turmeric", "cardamom", "mango", "banana", "citrus",
        "guava", "papaya", "cabbage", "cauliflower", "vegetable", "fruit",
        "flower", "marigold", "rose", "bitter gourd", "pointed gourd", "cucumber"
    ]
    if any(term in sub_lower for term in horticulture_terms):
        return "horticulture"

    # Field crops
    crop_terms = [
        "rice", "paddy", "wheat", "maize", "ragi", "millets", "field bean",
        "cowpea", "black gram", "green gram", "red gram", "gram", "pulse",
        "groundnut", "mustard", "sesame", "soybean", "cotton", "tobacco", "jute"
    ]
    if any(term in sub_lower for term in crop_terms):
        return "crop"

    # Fallback checks on combined text
    if "cattle" in combined or "shed" in combined or "vaccination" in combined:
        return "livestock"

    return "crop"


def infer_state_and_district(
    pdf_path: Optional[Union[Path, str]],
    metadata: Dict[str, Any],
    explicit_state: str = "",
    explicit_district: str = "",
) -> Tuple[str, str, str]:
    """Infer state, district, and kvk_name from filename, metadata, and document text (all lowercase)."""
    state = explicit_state
    district = explicit_district
    kvk_name = metadata.get("title", "")

    stem = Path(pdf_path).stem if pdf_path else ""  # e.g. "Karnataka_Mysuru"

    # 1. Determine State
    if not state:
        state = metadata.get("state", "")
    if not state:
        known_states = [
            ("Andhra_Pradesh", "andhra pradesh"),
            ("Arunachal_Pradesh", "arunachal pradesh"),
            ("Himachal_Pradesh", "himachal pradesh"),
            ("Madhya_Pradesh", "madhya pradesh"),
            ("Uttar_Pradesh", "uttar pradesh"),
            ("West_Bengal", "west bengal"),
            ("Tamil_Nadu", "tamil nadu"),
            ("Karnataka", "karnataka"),
            ("Kerala", "kerala"),
            ("Maharashtra", "maharashtra"),
            ("Gujarat", "gujarat"),
            ("Rajasthan", "rajasthan"),
            ("Punjab", "punjab"),
            ("Haryana", "haryana"),
            ("Bihar", "bihar"),
            ("Odisha", "odisha"),
            ("Assam", "assam"),
            ("Telangana", "telangana"),
        ]
        for prefix, st_name in known_states:
            if stem.startswith(prefix):
                state = st_name
                break

    # 2. Determine District
    if not district:
        district = metadata.get("district", "")
    if not district or district.lower() in ("n/a", "unknown", ""):
        temp_stem = stem
        for prefix, _ in [
            ("Andhra_Pradesh_", ""),
            ("Arunachal_Pradesh_", ""),
            ("Himachal_Pradesh_", ""),
            ("Madhya_Pradesh_", ""),
            ("Uttar_Pradesh_", ""),
            ("West_Bengal_", ""),
            ("Tamil_Nadu_", ""),
            ("Karnataka_", ""),
            ("Kerala_", ""),
            ("Maharashtra_", ""),
            ("Gujarat_", ""),
            ("Rajasthan_", ""),
            ("Punjab_", ""),
            ("Haryana_", ""),
            ("Bihar_", ""),
            ("Odisha_", ""),
            ("Assam_", ""),
            ("Telangana_", ""),
        ]:
            if temp_stem.startswith(prefix):
                temp_stem = temp_stem[len(prefix):]
                break
        district = temp_stem.replace("_", " ")

    district = district.strip().lower()
    state = state.strip().lower() if state else "unknown"
    kvk_name = kvk_name.strip().lower() if kvk_name else f"amfu / kvk {district}"

    return state, district, kvk_name


def find_source_pdf_url(
    pdf_path: Optional[Union[Path, str]],
    metadata: Dict[str, Any],
    explicit_url: str = "",
) -> str:
    """Determine source PDF URL from explicit input, metadata, or document text."""
    if explicit_url:
        return explicit_url

    url_candidate = metadata.get("source_pdf_url", "")
    if url_candidate:
        return url_candidate

    if pdf_path:
        return f"https://mausam.imd.gov.in/downloads/{Path(pdf_path).name}"

    return ""


# ---------------------------------------------------------------------------
# MongoDB Core Ingestion Operations
# ---------------------------------------------------------------------------

def get_or_create_district(
    db: Database,
    district: str,
    state: str,
    kvk_name: str = "",
) -> ObjectId:
    """Find existing district document or create a new one (all lowercase).

    Ensures the requirement:
      'if district already there do not make, if not then create district with their state'
    """
    clean_district = district.strip().lower()
    clean_state = state.strip().lower()
    clean_kvk = kvk_name.strip().lower() if kvk_name else f"amfu / kvk {clean_district}"

    # Search existing district record
    existing = db.districts.find_one({
        "district": clean_district,
        "state": clean_state,
    })
    if existing:
        return existing["_id"]

    # Insert new district document
    new_doc = {
        "district": clean_district,
        "state": clean_state,
        "kvk_name": clean_kvk,
        "created_at": datetime.now(timezone.utc),
    }

    try:
        res = db.districts.insert_one(new_doc)
        return res.inserted_id
    except Exception:
        # Fallback in case of concurrent insert race condition caught by unique index
        existing = db.districts.find_one({
            "district": clean_district,
            "state": clean_state,
        })
        if existing:
            return existing["_id"]
        raise


def prepare_weather_documents(
    district_id: ObjectId,
    district: str,
    state: str,
    issue_date: datetime,
    forecast_df: Optional[pd.DataFrame],
    block_name: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Convert a weather forecast DataFrame into append-only daily weather documents with lowercase fields."""
    if forecast_df is None or forecast_df.empty:
        return []

    # Map parameter names to document fields
    param_map = {
        "rainfall": "rainfall_mm",
        "rain": "rainfall_mm",
        "max. temp": "tmax_c",
        "max.temp": "tmax_c",
        "tmax": "tmax_c",
        "min. temp": "tmin_c",
        "min.temp": "tmin_c",
        "tmin": "tmin_c",
        "relative humidity (%) 08": "rh_morning_pct",
        "relative humidity (%) 0830": "rh_morning_pct",
        "relative humidity (%) 08:30": "rh_morning_pct",
        "relative humidity (%) 17": "rh_evening_pct",
        "relative humidity (%) 1730": "rh_evening_pct",
        "relative humidity (%) 17:30": "rh_evening_pct",
        "wind speed": "wind_speed_kmph",
        "wind direction": "wind_direction_deg",
        "sky condition": "cloud_cover_octa",
        "cloud cover": "cloud_cover_octa",
    }

    param_col = forecast_df.columns[0]
    date_cols = list(forecast_df.columns[1:])

    param_rows: Dict[str, Dict[str, Any]] = {}
    for _, row in forecast_df.iterrows():
        p_name = str(row[param_col]).lower().strip()
        matched_field = None
        for key, field in param_map.items():
            if key in p_name:
                matched_field = field
                break
        if matched_field:
            param_rows[matched_field] = {col: row[col] for col in date_cols}

    weather_docs: List[Dict[str, Any]] = []
    now_utc = datetime.now(timezone.utc)

    clean_dist = district.strip().lower()
    clean_st = state.strip().lower()
    clean_blk = block_name.strip().lower() if block_name else None

    for col in date_cols:
        f_date = parse_date(col)
        if not f_date:
            continue

        doc: Dict[str, Any] = {
            "district_id": district_id,
            "district": clean_dist,
            "state": clean_st,
            "bulletin_issue_date": issue_date,
            "forecast_date": f_date,
            "rainfall_mm": parse_numeric(param_rows.get("rainfall_mm", {}).get(col)),
            "tmax_c": parse_numeric(param_rows.get("tmax_c", {}).get(col)),
            "tmin_c": parse_numeric(param_rows.get("tmin_c", {}).get(col)),
            "rh_morning_pct": parse_numeric(param_rows.get("rh_morning_pct", {}).get(col)),
            "rh_evening_pct": parse_numeric(param_rows.get("rh_evening_pct", {}).get(col)),
            "wind_speed_kmph": parse_numeric(param_rows.get("wind_speed_kmph", {}).get(col)),
            "wind_direction_deg": parse_numeric(param_rows.get("wind_direction_deg", {}).get(col)),
            "cloud_cover_octa": parse_numeric(param_rows.get("cloud_cover_octa", {}).get(col)),
            "warning": None,
            "created_at": now_utc,
        }
        if clean_blk:
            doc["block"] = clean_blk

        weather_docs.append(doc)

    return weather_docs


def prepare_bulletin_documents(
    district_id: ObjectId,
    district: str,
    state: str,
    issue_date: datetime,
    crop_advisory_df: Optional[pd.DataFrame],
    advisories: Dict[str, str],
    source_pdf_url: str,
) -> List[Dict[str, Any]]:
    """Convert parsed advisory tables and texts into append-only bulletin documents with lowercase fields."""
    bulletin_docs: List[Dict[str, Any]] = []
    now_utc = datetime.now(timezone.utc)

    clean_dist = district.strip().lower()
    clean_st = state.strip().lower()

    forecast_summary = advisories.get("Forecast Summary", "")
    general_advisory = advisories.get("General Advisory", "")
    sms_advisory = advisories.get("SMS Advisory", "")

    if crop_advisory_df is not None and not crop_advisory_df.empty:
        cols = list(crop_advisory_df.columns)

        # Style 1: 5 columns [Crop, Crop Stage, Weather-based Advisory, Likely Pests / Diseases, Recommended Management]
        if len(cols) >= 5 and "Crop" in cols[0]:
            for _, row in crop_advisory_df.iterrows():
                crop_name = str(row["Crop"]).strip()
                if not crop_name:
                    continue

                crop_stage = str(row.get("Crop Stage", "")).strip().lower() or None
                weather_adv = str(row.get("Weather-based Advisory", "")).strip()
                pests = str(row.get("Likely Pests / Diseases", "")).strip().lower() or None
                mgmt = str(row.get("Recommended Management", "")).strip() or None

                # Construct full advisory text
                full_adv_parts = [p for p in (weather_adv, mgmt) if p]
                full_adv_text = " ".join(full_adv_parts) if full_adv_parts else weather_adv

                category = detect_category(crop_name, full_adv_text).lower()

                doc: Dict[str, Any] = {
                    "district_id": district_id,
                    "district": clean_dist,
                    "state": clean_st,
                    "issue_date": issue_date,
                    "category": category,
                    "subject": crop_name.strip().lower(),
                    "crop_stage": crop_stage,
                    "advisory_text": full_adv_text,
                    "pests_diseases": pests,
                    "recommended_management": mgmt,
                    "forecast_summary": forecast_summary,
                    "general_advisory": general_advisory,
                    "sms_advisory": sms_advisory,
                    "source_pdf_url": source_pdf_url,
                    "created_at": now_utc,
                }
                bulletin_docs.append(doc)

        # Style 2: 2 columns [Category / Crop (Stage), Specific Advisory] (e.g. West Bengal format)
        elif len(cols) >= 2:
            sub_col, adv_col = cols[0], cols[1]
            for _, row in crop_advisory_df.iterrows():
                raw_subject = str(row[sub_col]).strip()
                adv_text = str(row[adv_col]).strip()
                if not raw_subject or not adv_text:
                    continue

                # Parse subject and optional stage e.g. "RICE (Transplanting)"
                stage_match = re.search(r"^(.*?)\s*\((.*?)\)$", raw_subject)
                if stage_match:
                    subject = stage_match.group(1).strip().lower()
                    stage = stage_match.group(2).strip().lower()
                else:
                    subject = raw_subject.lower()
                    stage = None

                category = detect_category(subject, adv_text).lower()

                doc = {
                    "district_id": district_id,
                    "district": clean_dist,
                    "state": clean_st,
                    "issue_date": issue_date,
                    "category": category,
                    "subject": subject,
                    "crop_stage": stage,
                    "advisory_text": adv_text,
                    "pests_diseases": None,
                    "recommended_management": None,
                    "forecast_summary": forecast_summary,
                    "general_advisory": general_advisory,
                    "sms_advisory": sms_advisory,
                    "source_pdf_url": source_pdf_url,
                    "created_at": now_utc,
                }
                bulletin_docs.append(doc)

    # If no crop rows found, insert at least one General document for this bulletin
    if not bulletin_docs and (general_advisory or sms_advisory):
        bulletin_docs.append({
            "district_id": district_id,
            "district": clean_dist,
            "state": clean_st,
            "issue_date": issue_date,
            "category": "general",
            "subject": "general",
            "crop_stage": None,
            "advisory_text": general_advisory or sms_advisory,
            "pests_diseases": None,
            "recommended_management": None,
            "forecast_summary": forecast_summary,
            "general_advisory": general_advisory,
            "sms_advisory": sms_advisory,
            "source_pdf_url": source_pdf_url,
            "created_at": now_utc,
        })

    return bulletin_docs


def upload_parsed_bulletin(
    db: Database,
    parsed_data: Dict[str, Any],
    pdf_path: Optional[Union[Path, str]] = None,
    explicit_url: str = "",
    explicit_state: str = "",
    explicit_district: str = "",
) -> Dict[str, Any]:
    """Execute the complete MongoDB upload pipeline for a parsed Agromet bulletin.

    Steps:
      1. Resolve state, district, kvk_name, issue_date, source_pdf_url.
      2. get_or_create_district in `districts` collection.
      3. insert_many weather rows in `weather` collection.
      4. insert_many advisory rows in `bulletins` collection.
    """
    metadata = parsed_data.get("metadata", {})
    state, district, kvk_name = infer_state_and_district(
        pdf_path, metadata, explicit_state, explicit_district
    )

    issue_date = parse_date(metadata.get("date")) or datetime.now(timezone.utc)
    source_url = find_source_pdf_url(pdf_path, metadata, explicit_url)

    # 1. District lookup / creation
    district_id = get_or_create_district(db, district=district, state=state, kvk_name=kvk_name)

    # 2. Weather documents preparation (District forecast + Block forecasts)
    weather_docs: List[Dict[str, Any]] = []

    # District forecast
    if parsed_data.get("district_forecast") is not None:
        weather_docs.extend(
            prepare_weather_documents(
                district_id, district, state, issue_date, parsed_data["district_forecast"]
            )
        )

    # Block-level forecasts
    for block_name, block_df in parsed_data.get("block_forecasts", {}).items():
        weather_docs.extend(
            prepare_weather_documents(
                district_id, district, state, issue_date, block_df, block_name=block_name
            )
        )

    # 3. Advisory documents preparation
    bulletin_docs = prepare_bulletin_documents(
        district_id=district_id,
        district=district,
        state=state,
        issue_date=issue_date,
        crop_advisory_df=parsed_data.get("crop_advisory"),
        advisories=parsed_data.get("advisories", {}),
        source_pdf_url=source_url,
    )

    # 4. Perform append-only insertions
    weather_inserted_count = 0
    if weather_docs:
        w_res = db.weather.insert_many(weather_docs)
        weather_inserted_count = len(w_res.inserted_ids)

    bulletins_inserted_count = 0
    if bulletin_docs:
        b_res = db.bulletins.insert_many(bulletin_docs)
        bulletins_inserted_count = len(b_res.inserted_ids)

    return {
        "status": "success",
        "district_id": str(district_id),
        "district": district,
        "state": state,
        "issue_date": issue_date.isoformat(),
        "source_pdf_url": source_url,
        "weather_records_inserted": weather_inserted_count,
        "bulletin_records_inserted": bulletins_inserted_count,
    }


def ingest_pdf_bytes(
    pdf_bytes: Union[bytes, io.BytesIO],
    db: Optional[Database] = None,
    explicit_url: str = "",
    explicit_state: str = "",
    explicit_district: str = "",
    file_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Parse and ingest an in-memory PDF byte buffer directly into MongoDB (zero disk write)."""
    parsed_data = extract_tables(pdf_bytes, file_name=file_name)
    database = db if db is not None else get_db()
    return upload_parsed_bulletin(
        db=database,
        parsed_data=parsed_data,
        pdf_path=file_name,
        explicit_url=explicit_url,
        explicit_state=explicit_state,
        explicit_district=explicit_district,
    )


def ingest_pdf_file(
    pdf_path: Union[str, Path],
    db: Optional[Database] = None,
    explicit_url: str = "",
    explicit_state: str = "",
    explicit_district: str = "",
) -> Dict[str, Any]:
    """Parse and ingest a single PDF file into MongoDB."""
    path = Path(pdf_path)
    if not path.exists():
        raise FileNotFoundError(f"PDF file not found: {path}")

    # Extract tables using pdfplumber
    parsed_data = extract_tables(path)

    database = db if db is not None else get_db()
    return upload_parsed_bulletin(
        db=database,
        parsed_data=parsed_data,
        pdf_path=path,
        explicit_url=explicit_url,
        explicit_state=explicit_state,
        explicit_district=explicit_district,
    )


def ingest_directory(
    directory_path: Union[str, Path] = "downloads",
    db: Optional[Database] = None,
    pattern: str = "*.pdf",
) -> List[Dict[str, Any]]:
    """Ingest all matching PDFs in a directory into MongoDB."""
    dir_path = Path(directory_path)
    if not dir_path.exists():
        raise FileNotFoundError(f"Directory not found: {dir_path}")

    pdf_files = sorted(list(dir_path.glob(pattern)))
    if not pdf_files:
        print(f"No PDFs found matching {pattern} in {dir_path}")
        return []

    database = db if db is not None else get_db()
    results: List[Dict[str, Any]] = []

    for pdf_file in pdf_files:
        print(f"Ingesting {pdf_file.name}...")
        try:
            res = ingest_pdf_file(pdf_file, db=database)
            results.append(res)
            print(
                f"  ✓ {res['district']} ({res['state']}): "
                f"{res['weather_records_inserted']} weather rows, "
                f"{res['bulletin_records_inserted']} advisory rows."
            )
        except Exception as exc:
            print(f"  ✗ Failed {pdf_file.name}: {exc}", file=sys.stderr)
            results.append({"status": "error", "file": pdf_file.name, "error": str(exc)})

    return results


# ---------------------------------------------------------------------------
# MongoDB Query Helpers (For Retrieval / Chatbot API)
# ---------------------------------------------------------------------------

def get_latest_advisories(
    db: Database,
    district: str,
    subject: Optional[str] = None,
    state: Optional[str] = None,
    limit: int = 1,
) -> List[Dict[str, Any]]:
    """Retrieve the latest advisory for a subject in a district (case-insensitive)."""
    query: Dict[str, Any] = {"district": district.strip().lower()}
    if state:
        query["state"] = state.strip().lower()
    if subject:
        query["subject"] = subject.strip().lower()

    cursor = db.bulletins.find(query).sort("issue_date", -1).limit(limit)
    return list(cursor)


def get_latest_weather_forecast(
    db: Database,
    district: str,
    state: Optional[str] = None,
    limit: int = 5,
) -> List[Dict[str, Any]]:
    """Retrieve latest weather forecast rows for a district (case-insensitive)."""
    query: Dict[str, Any] = {"district": district.strip().lower()}
    if state:
        query["state"] = state.strip().lower()

    # Sort by bulletin_issue_date descending, forecast_date ascending
    cursor = db.weather.find(query).sort([
        ("bulletin_issue_date", -1),
        ("forecast_date", 1),
    ]).limit(limit)
    return list(cursor)


def get_all_districts(db: Database, state: Optional[str] = None) -> List[Dict[str, Any]]:
    """List all registered districts."""
    query: Dict[str, Any] = {}
    if state:
        query["state"] = state.strip().lower()
    return list(db.districts.find(query).sort([("state", 1), ("district", 1)]))


# ---------------------------------------------------------------------------
# CLI Runner
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "-p",
        "--pdf",
        default="downloads/Karnataka_Mysuru.pdf",
        help="Path to the PDF file to ingest (default: downloads/Karnataka_Mysuru.pdf)",
    )
    parser.add_argument(
        "--all-downloads",
        action="store_true",
        help="Ingest all PDFs in downloads/ directory",
    )
    parser.add_argument(
        "--dir",
        default="downloads",
        help="Custom directory path containing PDFs (default: downloads)",
    )
    parser.add_argument(
        "--state",
        default="",
        help="Explicit state name override",
    )
    parser.add_argument(
        "--district",
        default="",
        help="Explicit district name override",
    )
    parser.add_argument(
        "--url",
        default="",
        help="Source PDF URL override",
    )
    parser.add_argument(
        "--uri",
        default=None,
        help="MongoDB connection URI (default: mongodb://localhost:27017)",
    )
    parser.add_argument(
        "--db",
        default=None,
        help="MongoDB database name (default: agromet_db)",
    )
    parser.add_argument(
        "--query-district",
        help="Query latest weather and advisories for a district name and exit",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    # Query mode
    if args.query_district:
        try:
            db = get_db(uri=args.uri, db_name=args.db)
            print(f"\n--- Latest Weather for {args.query_district} ---")
            weather = get_latest_weather_forecast(db, args.query_district)
            for w in weather:
                f_date = w['forecast_date'].strftime('%Y-%m-%d') if isinstance(w.get('forecast_date'), datetime) else w.get('forecast_date')
                print(f"  {f_date}: Tmax={w.get('tmax_c')}°C, Tmin={w.get('tmin_c')}°C, Rain={w.get('rainfall_mm')}mm")

            print(f"\n--- Latest Advisories for {args.query_district} ---")
            advisories = get_latest_advisories(db, args.query_district, limit=5)
            for a in advisories:
                print(f"  [{a.get('category', '').upper()}] {a.get('subject')} ({a.get('crop_stage')}):")
                print(f"    {a.get('advisory_text')[:120]}...\n")
            return 0
        except Exception as exc:
            print(f"Database query error: {exc}", file=sys.stderr)
            return 1

    # Ingestion mode
    try:
        db = get_db(uri=args.uri, db_name=args.db)
    except Exception as exc:
        print(f"Error connecting to MongoDB: {exc}", file=sys.stderr)
        return 1

    if args.all_downloads:
        print(f"Ingesting all PDFs from {args.dir}...")
        results = ingest_directory(args.dir, db=db)
        print(f"\nCompleted ingestion for {len(results)} files.")
    else:
        pdf_path = Path(args.pdf)
        print(f"Ingesting single PDF: {pdf_path}...")
        res = ingest_pdf_file(
            pdf_path,
            db=db,
            explicit_url=args.url,
            explicit_state=args.state,
            explicit_district=args.district,
        )
        print("\n--- Ingestion Result ---")
        print(json.dumps(res, indent=2))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
