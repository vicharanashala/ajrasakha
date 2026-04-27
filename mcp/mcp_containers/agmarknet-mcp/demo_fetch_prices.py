from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


BASE_URL = "https://api.agmarknet.gov.in/v1"
DATA_GOV_RESOURCE_URL = "https://api.data.gov.in/resource/35985678-0d79-46b4-9ed6-6f13308a1d24"
DATA_GOV_API_KEY = os.getenv("DATA_GOV_API_KEY", "579b464db66ec23bdd000001cdc3b564546246a772a26393094f5645")
DEFAULT_DASHBOARD = "marketwise_price_arrival"

STATE_ALIASES = {
    "up": "Uttar Pradesh",
    "u.p.": "Uttar Pradesh",
    "uttar pradesh": "Uttar Pradesh",
    "bihar": "Bihar",
    "chandigarh": "Chandigarh",
}


def normalize_text(value: str) -> str:
    return " ".join(value.lower().replace("&", "and").split())


def request_json(path: str, params: dict[str, Any]) -> dict[str, Any]:
    url = f"{BASE_URL}/{path.lstrip('/')}?{urlencode(params, doseq=False)}"
    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "ajrasakha-agmarknet-demo/1.0",
        },
    )

    try:
        with urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"Agmarknet API returned HTTP {exc.code}: {body}") from exc
    except URLError as exc:
        raise RuntimeError(f"Could not connect to Agmarknet API: {exc.reason}") from exc


def request_absolute_json(url: str, params: dict[str, Any]) -> dict[str, Any]:
    request_url = f"{url}?{urlencode(params, doseq=False)}"
    request = Request(
        request_url,
        headers={
            "Accept": "application/json",
            "User-Agent": "ajrasakha-apmc-demo/1.0",
        },
    )

    try:
        with urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"data.gov.in API returned HTTP {exc.code}: {body}") from exc
    except URLError as exc:
        raise RuntimeError(f"Could not connect to data.gov.in API: {exc.reason}") from exc


def find_by_name(items: list[dict[str, Any]], key: str, query: str) -> dict[str, Any] | None:
    target = normalize_text(query)

    for item in items:
        if normalize_text(str(item.get(key, ""))) == target:
            return item

    for item in items:
        if target in normalize_text(str(item.get(key, ""))):
            return item

    return None


def resolve_filters(state: str, commodity: str, district: str | None) -> dict[str, Any]:
    filters_response = request_json(
        "dashboard-filters/",
        {"dashboard_name": DEFAULT_DASHBOARD},
    )

    if not filters_response.get("status"):
        raise RuntimeError(f"Could not load Agmarknet filters: {filters_response}")

    data = filters_response.get("data", {})
    states = data.get("state_data", [])
    commodities = data.get("cmdt_data", [])
    districts = data.get("district_data", [])

    state_query = STATE_ALIASES.get(normalize_text(state), state)
    matched_state = find_by_name(states, "state_name", state_query)
    if not matched_state:
        available = ", ".join(str(s.get("state_name")) for s in states[:20])
        raise ValueError(f"State '{state}' not found. Some available states: {available}")

    matched_commodity = find_by_name(commodities, "cmdt_name", commodity)
    if not matched_commodity:
        available = ", ".join(str(c.get("cmdt_name")) for c in commodities[:30])
        raise ValueError(f"Commodity '{commodity}' not found. Some available commodities: {available}")

    result = {
        "state": matched_state,
        "commodity": matched_commodity,
        "district": None,
    }

    if district:
        state_id = matched_state.get("state_id")
        state_districts = [d for d in districts if d.get("state_id") == state_id]
        matched_district = find_by_name(state_districts, "district_name", district)
        if not matched_district:
            available = ", ".join(str(d.get("district_name")) for d in state_districts[:40])
            raise ValueError(
                f"District '{district}' not found for {matched_state.get('state_name')}. "
                f"Some available districts: {available}"
            )
        result["district"] = matched_district

    return result


def fetch_prices(state: str, commodity: str, district: str | None, price_date: str, limit: int) -> dict[str, Any]:
    resolved = resolve_filters(state=state, commodity=commodity, district=district)

    params = {
        "dashboard": DEFAULT_DASHBOARD,
        "date": price_date,
        "state": resolved["state"]["state_id"],
        "commodity": json.dumps([resolved["commodity"]["cmdt_id"]]),
        "limit": limit,
        "format": "json",
    }

    if resolved["district"]:
        params["district"] = json.dumps([resolved["district"]["id"]])

    price_response = request_json("dashboard-data/", params)
    if price_response.get("status") != "success" and price_response.get("message") != "No data available.":
        raise RuntimeError(f"Agmarknet price request failed: {price_response}")

    response_data = price_response.get("data", {})
    records = response_data.get("records", []) if isinstance(response_data, dict) else []

    return {
        "source": "Agmarknet API",
        "source_url": f"{BASE_URL}/dashboard-data/",
        "input": {
            "state": state,
            "district": district,
            "commodity": commodity,
            "date": price_date,
        },
        "resolved_filters": {
            "state": {
                "name": resolved["state"].get("state_name"),
                "id": resolved["state"].get("state_id"),
            },
            "district": None if not resolved["district"] else {
                "name": resolved["district"].get("district_name"),
                "id": resolved["district"].get("id"),
            },
            "commodity": {
                "name": resolved["commodity"].get("cmdt_name"),
                "id": resolved["commodity"].get("cmdt_id"),
            },
        },
        "records": records,
        "pagination": price_response.get("pagination", {}),
    }


def fetch_data_gov_prices(state: str, commodity: str, district: str | None, price_date: str, limit: int) -> dict[str, Any]:
    state_query = STATE_ALIASES.get(normalize_text(state), state)
    params = {
        "api-key": DATA_GOV_API_KEY,
        "format": "json",
        "limit": limit,
        "filters[State]": state_query,
        "range[Arrival_Date][gte]": price_date,
        "range[Arrival_Date][lte]": price_date,
    }

    if district:
        params["filters[District]"] = district

    if normalize_text(commodity) not in {"all", "all commodities"}:
        params["filters[Commodity]"] = commodity

    response = request_absolute_json(DATA_GOV_RESOURCE_URL, params)
    if response.get("status") != "ok":
        raise RuntimeError(f"data.gov.in request failed: {response}")

    records = response.get("records", []) or []
    return {
        "source": "data.gov.in AGMARKNET dataset",
        "source_url": DATA_GOV_RESOURCE_URL,
        "input": {
            "state": state,
            "district": district,
            "commodity": commodity,
            "date": price_date,
        },
        "resolved_filters": {
            "state": {
                "name": state_query,
                "id": None,
            },
            "district": None if not district else {
                "name": district,
                "id": None,
            },
            "commodity": {
                "name": commodity,
                "id": None,
            },
        },
        "records": records,
        "pagination": {
            "total_count": response.get("total"),
            "count": response.get("count"),
            "limit": response.get("limit"),
            "offset": response.get("offset"),
        },
    }


def print_table(result: dict[str, Any]) -> None:
    print("\nAPMC mandi price demo")
    print("====================")
    print(f"Source     : {result['source']}")
    print(f"State      : {result['resolved_filters']['state']['name']}")
    print(f"District   : {result['resolved_filters']['district']['name'] if result['resolved_filters']['district'] else 'All'}")
    print(f"Commodity  : {result['resolved_filters']['commodity']['name']}")
    print(f"Input date : {result['input']['date']}")
    print(f"Records    : {len(result['records'])}")
    print()

    if not result["records"]:
        print("No records found for this input. Try another date, district, or commodity.")
        return

    headers = ["State", "District", "Market", "Commodity", "Date", "Min", "Max", "Modal"]
    rows = []
    for record in result["records"]:
        if "State" in record:
            rows.append([
                str(record.get("State", "")),
                str(record.get("District", "")),
                str(record.get("Market", "")),
                str(record.get("Commodity", "")),
                str(record.get("Arrival_Date", "")),
                str(record.get("Min_Price", "")),
                str(record.get("Max_Price", "")),
                str(record.get("Modal_Price", "")),
            ])
        else:
            rows.append([
                result["resolved_filters"]["state"]["name"],
                result["resolved_filters"]["district"]["name"] if result["resolved_filters"]["district"] else "All",
                "",
                str(record.get("cmdt_name", "")),
                str(record.get("reported_date", "")),
                str(record.get("as_on_price", "")),
                str(record.get("as_on_price", "")),
                str(record.get("as_on_price", "")),
            ])

    widths = [
        max(len(headers[index]), *(len(row[index]) for row in rows))
        for index in range(len(headers))
    ]
    print(" | ".join(header.ljust(widths[index]) for index, header in enumerate(headers)))
    print("-+-".join("-" * width for width in widths))
    for row in rows:
        print(" | ".join(value.ljust(widths[index]) for index, value in enumerate(row)))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch mandi price data from the official Agmarknet API without Mongo/frontend/backend."
    )
    parser.add_argument("--state", required=True, help="State/UT name, e.g. 'Uttar Pradesh', 'Bihar', 'Chandigarh'")
    parser.add_argument("--commodity", required=True, help="Commodity name, e.g. Potato, Onion, Tomato, Wheat")
    parser.add_argument("--district", default=None, help="District name, e.g. Agra, Patna, Chandigarh")
    parser.add_argument("--date", default=date.today().isoformat(), help="Date in YYYY-MM-DD format")
    parser.add_argument("--limit", type=int, default=10, help="Maximum records to fetch")
    parser.add_argument(
        "--source",
        choices=["datagov", "agmarknet-dashboard"],
        default="datagov",
        help="Data source to use. datagov is best for state/district/date mandi price demo.",
    )
    parser.add_argument("--json", action="store_true", help="Print raw JSON instead of a small table")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        if args.source == "agmarknet-dashboard":
            result = fetch_prices(
                state=args.state,
                commodity=args.commodity,
                district=args.district,
                price_date=args.date,
                limit=args.limit,
            )
        else:
            result = fetch_data_gov_prices(
                state=args.state,
                commodity=args.commodity,
                district=args.district,
                price_date=args.date,
                limit=args.limit,
            )
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print_table(result)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
