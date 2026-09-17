#!/usr/bin/env python3
"""Download current English district Agromet PDFs from IMD Mausam.

Page: https://mausam.imd.gov.in/responsive/agromet_adv_ser_district_current_en.php

The site loads PDFs in two AJAX steps:
  1. selectState(state)  -> district dropdown
  2. selectDistrict(district) -> hidden #pdfurl pointing at imdagrimet.gov.in
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeout
from playwright.sync_api import sync_playwright

PAGE_URL = (
    "https://mausam.imd.gov.in/responsive/"
    "agromet_adv_ser_district_current_en.php"
)
STATE_SELECT = "select.mySelection"
DISTRICT_SELECT = "#txtHints select.mySelection"


def slug(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", text).strip("_")


def list_states(page) -> list[str]:
    return page.eval_on_selector(
        STATE_SELECT,
        """el => [...el.options]
            .map(o => o.value.trim())
            .filter(v => v && !v.toLowerCase().startsWith('select'))""",
    )


def select_state(page, state: str) -> list[str]:
    page.evaluate("state => selectState(state)", state)
    page.wait_for_selector(
        f"{DISTRICT_SELECT} option[value]",
        state="attached",
        timeout=30_000,
    )
    districts = page.eval_on_selector(
        DISTRICT_SELECT,
        """el => [...el.options]
            .map(o => o.value.trim())
            .filter(v => v && !v.toLowerCase().startsWith('select'))""",
    )
    if not districts:
        raise RuntimeError(f"No districts returned for state {state!r}")
    return districts


def fetch_district_pdf_bytes(page, state: str, district: str) -> tuple[bytes, str]:
    """Trigger IMD district AJAX and fetch raw PDF bytes directly into memory without disk write."""
    with page.expect_response(
        lambda r: "district_current_en_get.php" in r.url and "step2=true" in r.url,
        timeout=30_000,
    ):
        page.evaluate("district => selectDistrict(district)", district)
    page.wait_for_selector("#pdfurl", state="attached", timeout=30_000)
    page.wait_for_function(
        """district => {
            const el = document.querySelector('#pdfurl');
            return el && el.value.includes(district);
        }""",
        arg=district,
        timeout=30_000,
    )
    pdf_url = page.locator("#pdfurl").input_value().strip()
    if not pdf_url:
        raise RuntimeError(f"Empty PDF URL for {state} / {district}")

    # Same browser context keeps any cookies set by the state/district AJAX calls.
    response = page.request.get(
        pdf_url,
        timeout=60_000,
        headers={"Referer": PAGE_URL},
    )
    if not response.ok:
        raise RuntimeError(
            f"PDF request failed ({response.status}) for {state} / {district}: {pdf_url}"
        )

    body = response.body()
    if not body.startswith(b"%PDF"):
        # Some bulletins are missing; IMD then serves HTML or a placeholder.
        preview = body[:200].decode("utf-8", "replace").replace("\n", " ")
        raise RuntimeError(
            f"Not a PDF for {state} / {district} ({len(body)} bytes). "
            f"URL={pdf_url} preview={preview!r}"
        )

    return body, pdf_url


def download_district_pdf(page, state: str, district: str, out_dir: Path) -> Path:
    body, pdf_url = fetch_district_pdf_bytes(page, state, district)
    out_dir.mkdir(parents=True, exist_ok=True)
    dest = out_dir / f"{slug(state)}_{slug(district)}.pdf"
    dest.write_bytes(body)
    print(f"Saved {dest} ({len(body)} bytes) from {pdf_url}")
    return dest


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state", default="Karnataka", help="State name as shown in the dropdown")
    parser.add_argument("--district", default="Mysuru", help="District name, or omit with --all")
    parser.add_argument("--all", action="store_true", help="Download every district in the state")
    parser.add_argument("--list-states", action="store_true", help="Print state names and exit")
    parser.add_argument("--out", default="downloads", help="Output directory")
    parser.add_argument("--headed", action="store_true", help="Show the browser window")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    out_dir = Path(args.out)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not args.headed)
        context = browser.new_context(ignore_https_errors=True)
        page = context.new_page()
        page.goto(PAGE_URL, wait_until="domcontentloaded", timeout=60_000)
        page.wait_for_function("typeof selectState === 'function'", timeout=30_000)

        if args.list_states:
            for name in list_states(page):
                print(name)
            browser.close()
            return 0

        states = list_states(page)
        if args.state not in states:
            print(f"Unknown state {args.state!r}. Valid names:", file=sys.stderr)
            print("\n".join(states), file=sys.stderr)
            browser.close()
            return 1

        districts = select_state(page, args.state)
        targets = districts if args.all else [args.district]
        if not args.all and args.district not in districts:
            print(f"Unknown district {args.district!r}. Valid names:", file=sys.stderr)
            print("\n".join(districts), file=sys.stderr)
            browser.close()
            return 1

        failed = 0
        for district in targets:
            try:
                download_district_pdf(page, args.state, district, out_dir)
            except (RuntimeError, PlaywrightTimeout) as exc:
                failed += 1
                print(f"FAILED {args.state} / {district}: {exc}", file=sys.stderr)

        browser.close()
        return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
