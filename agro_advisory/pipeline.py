#!/usr/bin/env python3
"""End-to-end pipeline: Download Agromet PDF -> Scrape tables -> Upload to MongoDB.

Usage examples:
  # Download, scrape, and upload a single district:
  python pipeline.py --state "Karnataka" --district "Mysuru"

  # Download, scrape, and upload all districts for a state:
  python pipeline.py --state "West Bengal" --all

  # Scrape and upload all existing PDFs in downloads/ directory without downloading:
  python pipeline.py --all-downloads
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeout
from playwright.sync_api import sync_playwright

from database.db_connection import check_connection, get_db
from database.db_logic import ingest_directory, ingest_pdf_bytes, ingest_pdf_file
from download_agromet_pdf import (
    PAGE_URL,
    download_district_pdf,
    fetch_district_pdf_bytes,
    list_states,
    select_state,
    slug,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Agromet End-to-End Pipeline: Download -> Scrape -> Ingest into MongoDB",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--state",
        default="Karnataka",
        help="State name as shown in the IMD dropdown (default: Karnataka)",
    )
    parser.add_argument(
        "--district",
        default="Mysuru",
        help="District name (default: Mysuru). Omit with --all to process all districts.",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Download and ingest every district in the specified state",
    )
    parser.add_argument(
        "--all-downloads",
        action="store_true",
        help="Skip downloading and ingest all existing PDFs found in the downloads directory",
    )
    parser.add_argument(
        "--out",
        default="downloads",
        help="Directory to save downloaded PDFs when --save-disk is specified (default: downloads)",
    )
    parser.add_argument(
        "--save-disk",
        action="store_true",
        help="Optionally save downloaded PDFs to disk (default: False, runs 100% in-memory)",
    )
    parser.add_argument(
        "--headed",
        action="store_true",
        help="Show the browser window during download",
    )
    parser.add_argument(
        "--uri",
        default=None,
        help="MongoDB connection URI (default: read from .env)",
    )
    parser.add_argument(
        "--db",
        default=None,
        help="MongoDB database name (default: agromet_db)",
    )
    return parser.parse_args()


def run_pipeline() -> int:
    args = parse_args()

    # Step 1: Connect to MongoDB
    try:
        db = get_db(uri=args.uri, db_name=args.db)
        print(" Connected to MongoDB successfully.")
    except Exception as exc:
        print(f" MongoDB connection error: {exc}", file=sys.stderr)
        return 1

    out_dir = Path(args.out)
    if args.save_disk:
        out_dir.mkdir(parents=True, exist_ok=True)

    # Option A: Ingest existing downloads only
    if args.all_downloads:
        print(f"\n Ingesting all PDFs found in {out_dir}...")
        results = ingest_directory(out_dir, db=db)
        print(f"\n Done! Ingested {len(results)} files into MongoDB.")
        return 0

    # Option B: In-memory fetch, parse, and ingest in one flow
    print(f"\n Launching browser to process bulletins in-memory for State: {args.state!r}...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not args.headed)
        context = browser.new_context(ignore_https_errors=True)
        page = context.new_page()

        try:
            page.goto(PAGE_URL, wait_until="domcontentloaded", timeout=60_000)
            page.wait_for_function("typeof selectState === 'function'", timeout=30_000)

            available_states = list_states(page)
            if args.state not in available_states:
                print(f" Unknown state {args.state!r}. Available states:\n" + "\n".join(available_states), file=sys.stderr)
                browser.close()
                return 1

            available_districts = select_state(page, args.state)
            targets = available_districts if args.all else [args.district]

            if not args.all and args.district not in available_districts:
                print(f" Unknown district {args.district!r}. Available districts:\n" + "\n".join(available_districts), file=sys.stderr)
                browser.close()
                return 1

            print(f" Found {len(targets)} district(s) to process: {', '.join(targets[:5])}{'...' if len(targets) > 5 else ''}")

            success_count = 0
            for district in targets:
                print(f"\n--- Processing: {args.state} / {district} ---")
                try:
                    # 1. Fetch PDF directly into memory (zero disk write)
                    pdf_bytes, pdf_url = fetch_district_pdf_bytes(page, args.state, district)
                    print(f" Fetched {len(pdf_bytes)} bytes into memory (0 disk write) from {pdf_url}")

                    if args.save_disk:
                        dest = out_dir / f"{slug(args.state)}_{slug(district)}.pdf"
                        dest.write_bytes(pdf_bytes)
                        print(f" Saved local copy to {dest}")

                    # 2. Scrape from in-memory bytes & Ingest into MongoDB
                    print(f" Parsing & Ingesting in-memory bulletin for {district} into MongoDB...")
                    res = ingest_pdf_bytes(
                        pdf_bytes=pdf_bytes,
                        db=db,
                        explicit_url=pdf_url,
                        explicit_state=args.state,
                        explicit_district=district,
                        file_name=f"{args.state}_{district}.pdf",
                    )
                    print(
                        f" Success: {res['weather_records_inserted']} weather records, "
                        f"{res['bulletin_records_inserted']} advisory records inserted."
                    )
                    success_count += 1
                except (RuntimeError, PlaywrightTimeout) as exc:
                    print(f" Failed for {district}: {exc}", file=sys.stderr)
                except Exception as exc:
                    print(f" Error processing {district}: {exc}", file=sys.stderr)

            browser.close()
            print(f"\n Finished processing {success_count}/{len(targets)} districts.")
            return 0 if success_count > 0 else 1

        except Exception as exc:
            browser.close()
            print(f" Pipeline execution failed: {exc}", file=sys.stderr)
            return 1


if __name__ == "__main__":
    raise SystemExit(run_pipeline())
