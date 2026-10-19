"""Golden-output tests for the fixed-structure daily price renderer."""

from ajrasakha.agents.daily_price_formatter import (
    render_daily_price_answer,
    summary_is_grounded,
)
from ajrasakha.agents.prompts import DAILY_PRICE_INTENT_PROMPT
from ajrasakha.agents.daily_price_support import SUPPORTED_ACTIONS


def _rec(commodity="Onion", market="Azadpur APMC", date="2026-10-03", modal=2000.0, mn=1800.0, mx=2200.0,
         arrival=None, variety=None, grade=None, source="Agmarknet"):
    return {
        "commodity_name": commodity, "market_name": market, "date": date, "modal_price": modal,
        "min_price": mn, "max_price": mx, "arrival_quantity": arrival, "variety": variety,
        "grade": grade, "source_system": source,
    }


def _text(payload, **kw):
    out = render_daily_price_answer(payload, **kw)
    assert out is not None
    return out.text()


# ── single record / list ────────────────────────────────────────────────

def test_single_price_record_fixed_structure():
    out = _text({"action": "get_today_price", "price_records": [_rec()]}, crop="onion")
    assert out == (
        "Onion price at Azadpur APMC on 2026-10-03:\n"
        "Modal: Rs 2000/quintal | Min: Rs 1800 | Max: Rs 2200\n\n"
        "This information is fetched from the following source: Agmarknet."
    )


def test_arrival_shown_in_line_only_when_present():
    out = _text({"action": "get_today_price", "price_records": [_rec(arrival=55.0)]})
    assert "| Arrival: 55 tonnes" in out


def test_latest_notice_comes_first():
    payload = {
        "action": "get_today_price",
        "price_records": [_rec(date="2026-10-01")],
        "resolution": {"latest_price_notice": "Today's price is not available. Showing the latest available price (as of 2026-10-01)."},
    }
    out = _text(payload)
    assert out.startswith("Today's price is not available.")
    assert "Onion price at Azadpur APMC on 2026-10-01:" in out


def test_multiple_markets_same_date_is_a_table_sorted_by_modal_with_date_in_heading():
    recs = [_rec(market="A APMC", modal=1000.0), _rec(market="B APMC", modal=3000.0), _rec(market="C APMC", modal=2000.0)]
    out = _text({"action": "get_today_price", "price_records": recs})
    lines = out.splitlines()
    assert lines[0] == "Onion prices on 2026-10-03:"
    assert lines[1] == "| Market | Modal (Rs/quintal) | Min (Rs) | Max (Rs) |"
    assert [ln.split(" | ")[0] for ln in lines[3:6]] == ["| B APMC", "| C APMC", "| A APMC"]
    assert "Date" not in lines[1]


def test_saluru_style_nearby_comparison_is_a_table_with_variety_and_notice():
    recs = [
        _rec(commodity="maize", market="bobbili apmc", date="2026-09-25", modal=4800.0, mn=4800.0, mx=4800.0, variety="local", grade="faq"),
        _rec(commodity="maize", market="saluru apmc", date="2026-09-25", modal=2550.0, mn=2550.0, mx=2550.0, variety="hybrid/local", grade="faq"),
        _rec(commodity="maize", market="merakamudidam apmc", date="2026-09-25", modal=1950.0, mn=1800.0, mx=2000.0, variety="local", grade="local"),
    ]
    payload = {
        "action": "get_today_price", "price_records": recs,
        "resolution": {"latest_price_notice": "Price data for 03-Oct-2026 is not available. Showing the latest available data (as of 2026-09-25)."},
    }
    out = _text(payload)
    lines = out.splitlines()
    assert lines[0].startswith("Price data for 03-Oct-2026 is not available.")
    assert lines[1] == "Maize prices on 2026-09-25:"
    assert lines[4] == "| Bobbili APMC (local) | 4800 | 4800 | 4800 |"
    assert lines[5] == "| Saluru APMC (hybrid/local) | 2550 | 2550 | 2550 |"
    assert lines[6] == "| Merakamudidam APMC (local) | 1950 | 1800 | 2000 |"
    assert "1)" not in out


def test_single_market_several_varieties_one_date_still_shows_market_column():
    recs = [_rec(variety="Local", modal=2000.0), _rec(variety="Hybrid", modal=2200.0)]
    out = _text({"action": "get_today_price", "price_records": recs})
    assert "| Market | Modal (Rs/quintal) |" in out
    assert "| Azadpur APMC (Hybrid) | 2200 |" in out

# ── tables ───────────────────────────────────────────────────────────────

def test_price_history_over_dates_is_a_table():
    recs = [_rec(date="2026-10-03", modal=2000.0), _rec(date="2026-10-02", modal=1900.0, mn=1700.0, mx=2100.0),
            _rec(date="2026-10-01", modal=1950.0, mn=1750.0, mx=2150.0)]
    out = _text({"action": "get_price_history", "price_records": recs, "total_records_returned": 3})
    lines = out.splitlines()
    assert lines[0] == "Here is the Onion price history for Azadpur APMC:"
    assert lines[1] == "| Date | Modal (Rs/quintal) | Min (Rs) | Max (Rs) |"
    assert lines[2] == "|---|---|---|---|"
    assert lines[3] == "| 2026-10-03 | 2000 | 1800 | 2200 |"
    assert lines[4] == "| 2026-10-02 | 1900 | 1700 | 2100 |"
    assert lines[5] == "| 2026-10-01 | 1950 | 1750 | 2150 |"
    assert "Arrival" not in out


def test_history_table_has_market_column_when_markets_differ_and_arrival_when_present():
    recs = [_rec(market="A APMC", date="2026-10-03", arrival=10.0), _rec(market="B APMC", date="2026-10-02", arrival=20.0)]
    out = _text({"action": "get_price_history", "price_records": recs})
    assert "| Date | Market | Modal (Rs/quintal) | Min (Rs) | Max (Rs) | Arrival (tonnes) |" in out
    assert "| 2026-10-03 | A APMC | 2000 | 1800 | 2200 | 10 |" in out


def test_multiple_commodities_one_date_is_a_table_with_commodity_column():
    recs = [_rec(commodity="Wheat", modal=2500.0, mn=2400.0, mx=2600.0), _rec(commodity="Potato", modal=1500.0, mn=1400.0, mx=1600.0)]
    out = _text({"action": "get_today_price", "requested_commodities": ["wheat", "potato"], "price_records": recs})
    assert out.splitlines()[0] == "Wheat and Potato prices at Azadpur APMC on 2026-10-03:"
    assert "| Commodity | Date | Modal (Rs/quintal) | Min (Rs) | Max (Rs) |" in out
    assert "| Wheat | 2026-10-03 | 2500 | 2400 | 2600 |" in out
    assert "| Potato | 2026-10-03 | 1500 | 1400 | 1600 |" in out


def test_multiple_commodities_and_dates_group_by_commodity_then_latest_date_first():
    recs = [
        _rec(commodity="Wheat", date="2026-10-02", modal=2400.0), _rec(commodity="Wheat", date="2026-10-03", modal=2500.0),
        _rec(commodity="Potato", date="2026-10-02", modal=1400.0), _rec(commodity="Potato", date="2026-10-03", modal=1500.0),
    ]
    out = _text({"action": "get_price_history", "price_records": recs})
    rows = [ln for ln in out.splitlines() if ln.startswith("| ") and "Date" not in ln]
    assert [r.split(" | ")[0:2] for r in rows] == [
        ["| Wheat", "2026-10-03"], ["| Wheat", "2026-10-02"], ["| Potato", "2026-10-03"], ["| Potato", "2026-10-02"],
    ]


def test_highest_price_for_several_commodities_is_a_table():
    recs = [_rec(commodity="Wheat", market="X APMC", modal=2500.0), _rec(commodity="Potato", market="Y APMC", modal=1500.0)]
    out = _text({"action": "get_highest_price", "highest_records": recs})
    assert out.splitlines()[0] == "Here is the highest price for each commodity:"
    assert "| Commodity | Date | Market | Modal (Rs/quintal) | Min (Rs) | Max (Rs) |" in out
    assert "| Wheat | 2026-10-03 | X APMC | 2500 | 1800 | 2200 |" in out


def test_single_highest_record_keeps_sentence_format():
    out = _text({"action": "get_highest_price", "highest_records": [_rec()]}, crop="onion")
    assert out.startswith("Here is the highest Onion price at Azadpur APMC on 2026-10-03:")


def test_truncation_is_stated():
    recs = [_rec(date=f"2026-10-{d:02d}") for d in range(1, 16)]
    out = _text({"action": "get_price_history", "price_records": recs, "total_records_returned": 40})
    assert "Showing 15 of 40 records." in out


def test_duplicate_records_are_collapsed():
    out = _text({"action": "get_price_history", "price_records": [_rec(), _rec(), _rec(date="2026-10-02")]})
    assert out.count("| 2026-10-03 |") == 1


def test_variety_distinguishes_same_day_rows():
    recs = [_rec(date="2026-10-03", variety="Local"), _rec(date="2026-10-02", variety="Local")]
    recs[1]["modal_price"] = 1900.0
    out = _text({"action": "get_price_history", "price_records": recs})
    assert "Date" in out and "| 2026-10-02 | 1900 |" in out


# ── summary ──────────────────────────────────────────────────────────────

def test_summary_single_commodity_lists_period_and_records():
    payload = {
        "action": "get_price_summary",
        "stats": {"total_records": 7, "overall": {
            "avg_modal_price": 2000.5, "highest_max_price": 2500.0, "lowest_min_price": 1500.0, "price_spread": 1000.0}},
        "resolution": {"date_filter": {"mode": "lookback", "lookback_days": 7, "from": "2026-09-27"}},
        "total_records_analysed": 7,
        "source_system": "Agmarknet",
    }
    out = _text(payload, crop="onion")
    assert "Here is the Onion price summary:" in out
    assert "Average Modal Price: Rs 2000.5/quintal" in out
    assert "Period: last 7 days (from 2026-09-27)" in out
    assert "Total Records Analysed: 7" in out


def test_summary_multi_commodity_is_a_table():
    payload = {
        "action": "get_price_summary",
        "requested_commodities": ["wheat", "potato"],
        "stats": {"by_commodity": {
            "wheat": {"record_count": 5, "avg_modal_price": 2500.0, "lowest_min_price": 2400.0, "highest_max_price": 2600.0},
            "potato": {"record_count": 4, "avg_modal_price": 1500.0, "lowest_min_price": 1400.0, "highest_max_price": 1600.0},
        }, "total_records": 9},
    }
    out = _text(payload)
    assert "| Commodity | Avg Modal (Rs/quintal) | Lowest Min (Rs) | Highest Max (Rs) | Records |" in out
    assert "| Wheat | 2500 | 2400 | 2600 | 5 |" in out


# ── composite / arrival / markets / errors ──────────────────────────────

def test_named_market_plus_nearby_shows_both_blocks_and_one_source_line():
    payload = {
        "action": "get_price_with_nearby",
        "named_market": {"action": "get_today_price", "price_records": [_rec(market="Aluva")]},
        "nearby_markets": {"price_records": [_rec(market="Paravur", modal=2100.0), _rec(market="Angamaly", modal=2300.0)]},
    }
    out = _text(payload)
    assert out.index("Onion price at Aluva on 2026-10-03:") < out.index("Prices in nearby markets on 2026-10-03:")
    assert out.index("| Angamaly | 2300") < out.index("| Paravur | 2100")
    assert out.count("This information is fetched from the following source") == 1


def test_named_market_error_is_shown_instead_of_dropped():
    payload = {
        "action": "get_price_with_nearby",
        "named_market": {"error": "Market 'xyz' was not found in Kerala."},
        "nearby_markets": None,
    }
    out = _text(payload)
    assert "Market 'xyz' was not found in Kerala." in out


def test_arrival_history_over_dates_is_a_table():
    recs = [_rec(date="2026-10-03", arrival=12.0), _rec(date="2026-10-02", arrival=8.5)]
    payload = {"action": "get_arrival_history", "arrival_records": recs}
    out = _text(payload, crop="onion")
    assert out.splitlines()[0] == "Here is the Onion arrival history for Azadpur APMC:"
    assert "| Date | Arrival (tonnes) |" in out
    assert "| 2026-10-02 | 8.5 |" in out


def test_arrival_unavailable_has_no_source_line():
    payload = {
        "action": "get_today_arrival",
        "arrival_records": [{"market_name": "X", "arrival_quantity": None, "source_system": "Agmarknet"}],
        "message": "Data.gov.in does not provide arrival quantity for agmarknet",
    }
    out = _text(payload, crop="onion", state="Assam")
    assert out == (
        "Data.gov.in does not provide arrival quantity for agmarknet. "
        "Therefore, arrival quantity for Onion in Assam is not available."
    )


def test_search_markets_lists_markets_without_source_line():
    payload = {"action": "search_markets", "count": 2, "markets": [
        {"name": "azadpur apmc", "district": "north delhi", "state": "delhi"}, {"name": "okhla apmc", "district": None, "state": "delhi"}]}
    out = _text(payload)
    assert out == "Markets found:\n1) Azadpur APMC (North Delhi, Delhi)\n2) Okhla APMC (Delhi)"


def test_multi_action_result_has_single_source_line_and_blank_line_between_parts():
    payload = {"actions": ["get_today_price", "search_markets"], "results": {
        "get_today_price": {"action": "get_today_price", "price_records": [_rec()]},
        "search_markets": {"action": "search_markets", "markets": [{"name": "azadpur apmc", "state": "delhi"}]},
    }}
    out = _text(payload)
    assert out.count("This information is fetched from the following source") == 1
    assert "\n\nMarkets found:" in out


def test_unavailable_commodity_in_multi_crop_is_noted():
    payload = {
        "action": "get_today_price",
        "requested_commodities": ["wheat", "unobtainium"],
        "price_records": [_rec(commodity="Wheat")],
        "resolution": {"unavailable_commodities": ["Unobtainium: We do not have unobtainium available in Delhi."]},
    }
    out = _text(payload)
    assert "Note: Unobtainium: We do not have unobtainium available in Delhi." in out


def test_unrenderable_payload_returns_none():
    assert render_daily_price_answer({"action": "get_today_price", "price_records": []}) is None
    assert render_daily_price_answer("text") is None


# ── number guard ─────────────────────────────────────────────────────────

def test_summary_guard_accepts_numbers_present_in_answer():
    ref = "Onion price at Azadpur APMC on 2026-10-03:\nModal: Rs 2000/quintal | Min: Rs 1800 | Max: Rs 2200"
    assert summary_is_grounded("Onion is Rs 2000 per quintal at Azadpur on 2026-10-03.", ref)


def test_summary_guard_rejects_invented_or_derived_numbers():
    ref = "Modal: Rs 2000/quintal | Min: Rs 1800 | Max: Rs 2200"
    assert not summary_is_grounded("Onion is Rs 2100 per quintal.", ref)
    assert not summary_is_grounded("The spread is Rs 400.", ref)


def test_summary_guard_rejects_markdown_tables_and_long_text():
    ref = "Modal: Rs 2000/quintal"
    assert not summary_is_grounded("| a | b |", ref)
    assert not summary_is_grounded("**Rs 2000**", ref)
    assert not summary_is_grounded("x" * 500, ref)
    assert not summary_is_grounded("", ref)


# ── registry stays in sync with the intent prompt ────────────────────────

def test_every_supported_action_is_listed_in_the_intent_prompt():
    for action in SUPPORTED_ACTIONS:
        assert f'"{action}"' in DAILY_PRICE_INTENT_PROMPT
