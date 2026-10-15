"""Deterministic, fixed-structure rendering of ``mandi_price_tool`` payloads.

Every number, date, market name and source in a daily-price answer is produced
here from the tool JSON. The LLM never writes them; it may only contribute one
short summary sentence, which is validated against the rendered text by
``summary_is_grounded``.

Answer structure (every section is optional except the data):

    <notice: latest-data / fallback>
    <title line>
    <data: single line, numbered list, or table>
    <note: truncation / unavailable commodities>
    Summary: <validated one-liner>
    This information is fetched from the following source: <source>.

A table is used whenever the data spans more than one date or more than one
commodity.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

ARRIVAL_ACTIONS = frozenset({"get_today_arrival", "get_arrival_history", "get_extreme_arrival"})
MAX_TABLE_ROWS = 30
MAX_LIST_ROWS = 5
MAX_NEARBY_ROWS = 3
MAX_SEARCH_MARKETS = 10

_UNKNOWN_SOURCE_VALUES = frozenset({"none", "null", "unknown"})
_GENERIC_VARIETIES = frozenset({"faq", "other", "others", "na", "n/a", "-"})
_NUMBER_RE = re.compile(r"\d[\d,]*(?:\.\d+)?")


# --------------------------------------------------------------------------
# Small helpers
# --------------------------------------------------------------------------

def _num(val: Any) -> str | None:
    """Number without currency; ints lose the trailing .0."""
    if val is None:
        return None
    try:
        f = float(val)
    except (ValueError, TypeError):
        return str(val)
    if f.is_integer():
        return str(int(f))
    return f"{f:.2f}".rstrip("0").rstrip(".")


def fmt_price(val: Any) -> str | None:
    n = _num(val)
    return None if n is None else f"Rs {n}"


def _title(text: Any) -> str:
    s = str(text or "").strip().title()
    return re.sub(r"\bApmc\b", "APMC", s)


def _join_names(names: list[str]) -> str:
    if len(names) <= 1:
        return "".join(names)
    return ", ".join(names[:-1]) + " and " + names[-1]


def _variety_suffix(rec: dict) -> str:
    parts = []
    for key in ("variety", "grade"):
        v = str(rec.get(key) or "").strip()
        if v and v.lower() not in _GENERIC_VARIETIES and v not in parts:
            parts.append(v)
    return ", ".join(parts)


def _market_label(rec: dict, fallback: str = "") -> str:
    name = _title(rec.get("market_name")) or fallback
    suffix = _variety_suffix(rec)
    return f"{name} ({suffix})" if suffix else name


def _commodity_label(rec: dict) -> str:
    name = _title(rec.get("commodity_name"))
    suffix = _variety_suffix(rec)
    return f"{name} ({suffix})" if suffix else name


def _metrics_line(rec: dict) -> str:
    modal, mn, mx = fmt_price(rec.get("modal_price")), fmt_price(rec.get("min_price")), fmt_price(rec.get("max_price"))
    aq = _num(rec.get("arrival_quantity"))
    return " | ".join(p for p in (
        f"Modal: {modal}/quintal" if modal else None,
        f"Min: {mn}" if mn else None,
        f"Max: {mx}" if mx else None,
        f"Arrival: {aq} tonnes" if aq else None,
    ) if p)


def _table(headers: list[str], rows: list[list[str]]) -> list[str]:
    lines = ["| " + " | ".join(headers) + " |", "|" + "|".join("---" for _ in headers) + "|"]
    for row in rows:
        lines.append("| " + " | ".join(c if c else "-" for c in row) + " |")
    return lines


def _distinct(values: list[Any]) -> list[Any]:
    seen: set[Any] = set()
    out: list[Any] = []
    for v in values:
        if v and v not in seen:
            seen.add(v)
            out.append(v)
    return out


def _dedupe_records(records: list[dict]) -> list[dict]:
    seen: set[tuple] = set()
    out: list[dict] = []
    for r in records:
        key = (
            r.get("date"), str(r.get("commodity_name") or "").lower(), str(r.get("market_name") or "").lower(),
            str(r.get("variety") or "").lower(), str(r.get("grade") or "").lower(),
            r.get("modal_price"), r.get("min_price"), r.get("max_price"), r.get("arrival_quantity"),
        )
        if key not in seen:
            seen.add(key)
            out.append(r)
    return out


def dedupe_and_sort_nearby_records(records: list[dict], top_n: int = 3) -> list[dict]:
    """Deduplicate records by market name (keeping highest price) and sort descending."""
    by_market: dict[str, dict] = {}
    for r in records:
        if not isinstance(r, dict):
            continue
        mkt = (r.get("market_name") or "").strip().lower()
        if not mkt:
            continue
        prev = by_market.get(mkt)
        if prev is None or (
            float(r.get("modal_price") or 0), float(r.get("max_price") or 0)
        ) > (float(prev.get("modal_price") or 0), float(prev.get("max_price") or 0)):
            by_market[mkt] = r
    return sorted(
        by_market.values(),
        key=lambda r: (float(r.get("modal_price") or 0), float(r.get("max_price") or 0)),
        reverse=True,
    )[:top_n]


def extract_source_systems(payload: Any) -> list[str]:
    """All unique non-empty source_system strings anywhere in the tool payload."""
    sources: list[str] = []
    seen: set[str] = set()

    def _walk(obj: Any) -> None:
        if isinstance(obj, dict):
            val = obj.get("source_system")
            if val:
                val_str = str(val).strip()
                if val_str and val_str.lower() not in _UNKNOWN_SOURCE_VALUES:
                    for s in (x.strip() for x in val_str.split(",")):
                        if s and s not in seen:
                            seen.add(s)
                            sources.append(s)
            for v in obj.values():
                _walk(v)
        elif isinstance(obj, list):
            for item in obj:
                _walk(item)

    _walk(payload)
    return sources


def source_line(sources: list[str]) -> str:
    if not sources:
        return ""
    label = "sources" if len(sources) > 1 else "source"
    return f"This information is fetched from the following {label}: {', '.join(sources)}."


# --------------------------------------------------------------------------
# Arrival availability
# --------------------------------------------------------------------------

def is_arrival_quantity_unavailable(payload: Any) -> bool:
    """True if the payload is an arrival answer and no arrival quantity exists."""
    if not isinstance(payload, dict):
        return False

    if isinstance(payload.get("results"), dict):
        subs = [v for v in payload["results"].values() if isinstance(v, dict)]
        actions = [v.get("action") for v in subs]
        if actions and all(a in ARRIVAL_ACTIONS for a in actions):
            return all(is_arrival_quantity_unavailable(v) for v in subs)

    if payload.get("action") not in ARRIVAL_ACTIONS:
        return False

    msg = str(payload.get("message") or "").lower()
    res = payload.get("resolution") or {}
    res_notice = str(res.get("arrival_notice") or "").lower() if isinstance(res, dict) else ""
    if "does not provide arrival quantity" in msg or "does not provide arrival quantity" in res_notice:
        return True

    records = (
        payload.get("arrival_records")
        or payload.get("highest_arrivals")
        or payload.get("lowest_arrivals")
        or payload.get("extreme_records")
        or payload.get("price_records")
        or []
    )
    if not records:
        return True
    return all(r.get("arrival_quantity") is None for r in records if isinstance(r, dict))


def arrival_unavailable_message(payload: Any, *, crop: str | None = None, market_name: str | None = None,
                                state: str | None = None) -> str:
    p = payload if isinstance(payload, dict) else {}
    crops = p.get("requested_commodities")
    if crops and isinstance(crops, list):
        commodity = _join_names([str(c).title() for c in crops])
    else:
        commodity = str(crop or p.get("commodity") or "").strip().title()
    loc = _title(market_name or p.get("market")) or _title(state or p.get("state"))
    loc_str = f" in {loc}" if loc else ""
    c_str = f" for {commodity}" if commodity else ""
    return (
        "Data.gov.in does not provide arrival quantity for agmarknet. "
        f"Therefore, arrival quantity{c_str}{loc_str} is not available."
    )


# --------------------------------------------------------------------------
# Result container
# --------------------------------------------------------------------------

@dataclass
class Section:
    lines: list[str] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)
    has_data: bool = False


@dataclass
class RenderedAnswer:
    head: str
    sources: list[str]
    has_data: bool

    def text(self, summary: str | None = None) -> str:
        parts = [self.head.strip()]
        if summary and summary.strip():
            parts.append(f"Summary: {summary.strip()}")
        src = source_line(self.sources)
        if src:
            parts.append(src)
        return "\n\n".join(p for p in parts if p)


# --------------------------------------------------------------------------
# Notices
# --------------------------------------------------------------------------

def _resolution(payload: dict) -> dict:
    res = payload.get("resolution")
    return res if isinstance(res, dict) else {}


def _notice_lines(payload: dict, *, market_name: str | None) -> list[str]:
    res = _resolution(payload)
    lines: list[str] = []
    notice = res.get("latest_price_notice")
    if notice:
        lines.append(str(notice).strip())
    for n in res.get("latest_price_notices") or []:
        if n and str(n).strip() not in lines:
            lines.append(str(n).strip())
    if res.get("fallback"):
        if market_name or res.get("requested_market_name") or res.get("district_resolved_from"):
            lines.append(
                "The requested commodity price is not available in the specified market for the given date "
                "in our database. Therefore, the available price data for the commodity from other markets "
                "for the same date is being provided."
            )
        else:
            lines.append(
                "No price records were found for your exact location, so prices from other markets "
                "in the area are shown."
            )
    return lines


def _note_lines(payload: dict) -> list[str]:
    res = _resolution(payload)
    notes = [f"Note: {w}" for w in res.get("unavailable_commodities") or [] if w]
    unresolved = res.get("unresolved_commodity_names")
    if unresolved:
        notes.append(f"Note: Price data is not available for {_join_names([_title(u) for u in unresolved])}.")
    return notes


# --------------------------------------------------------------------------
# Price blocks
# --------------------------------------------------------------------------

def _price_table(records: list[dict], *, rank_by_modal: bool = False) -> list[str]:
    """Table of price records.

    Columns adapt to the data: Commodity (several crops), Date (several dates or crops; with one
    date it is in the heading instead), Market (several markets, or several rows on one date),
    Arrival (only when any record has it). ``rank_by_modal`` orders a single-date, single-crop
    table by modal price, highest first.
    """
    commodities = _distinct([str(r.get("commodity_name") or "").lower() for r in records])
    markets = _distinct([str(r.get("market_name") or "").lower() for r in records])
    dates = _distinct([r.get("date") for r in records])
    show_commodity = len(commodities) > 1
    show_date = len(dates) > 1 or show_commodity
    show_market = len(markets) > 1 or (not show_date and len(records) > 1)
    show_arrival = any(r.get("arrival_quantity") is not None for r in records)

    order = {c: i for i, c in enumerate(commodities)}
    rows_src = sorted(records, key=lambda r: str(r.get("date") or ""), reverse=True)
    rows_src.sort(key=lambda r: order.get(str(r.get("commodity_name") or "").lower(), 0))
    if rank_by_modal and not show_date:
        rows_src.sort(key=lambda r: (float(r.get("modal_price") or 0), float(r.get("max_price") or 0)), reverse=True)

    headers = (["Commodity"] if show_commodity else []) + (["Date"] if show_date else []) + (
        ["Market"] if show_market else []) + [
        "Modal (Rs/quintal)", "Min (Rs)", "Max (Rs)"] + (["Arrival (tonnes)"] if show_arrival else [])
    rows: list[list[str]] = []
    for r in rows_src[:MAX_TABLE_ROWS]:
        row = []
        if show_commodity:
            row.append(_commodity_label(r))
        if show_date:
            row.append(str(r.get("date") or ""))
        if show_market:
            row.append(_market_label(r) if not show_commodity else _title(r.get("market_name")))
        row += [_num(r.get("modal_price")) or "", _num(r.get("min_price")) or "", _num(r.get("max_price")) or ""]
        if show_arrival:
            row.append(_num(r.get("arrival_quantity")) or "")
        rows.append(row)
    return _table(headers, rows)


def _price_block(
    records: list[dict],
    *,
    action: str,
    total: int | None = None,
    heading: str | None = None,
) -> list[str]:
    """Title + data for price records: one line for a single record, a table for anything more."""
    records = _dedupe_records([r for r in records if isinstance(r, dict)])
    if not records:
        return []
    commodities = _distinct([str(r.get("commodity_name") or "").lower() for r in records])
    dates = _distinct([r.get("date") for r in records])
    markets = _distinct([str(r.get("market_name") or "").lower() for r in records])
    names = _join_names(_distinct([_title(r.get("commodity_name")) for r in records])) or "Commodity"
    one_market = _title(records[0].get("market_name")) if len(markets) == 1 else ""
    is_extreme = action in ("get_highest_price", "get_lowest_price")
    order = "highest" if action == "get_highest_price" else "lowest"
    lines: list[str] = []

    date_val = dates[0] if dates else ""
    if len(records) > 1:
        at = f" at {one_market}" if one_market else ""
        on = f" on {date_val}" if len(dates) == 1 else ""
        if heading:
            lines.append(heading)
        elif is_extreme and len(commodities) > 1:
            lines.append(f"Here is the {order} price for each commodity:")
        elif is_extreme and len(dates) == 1 and not one_market:
            lines.append(f"{order.title()} {names} prices{on}:")
        elif is_extreme:
            lines.append(f"Here are the {order} {names} prices{at}:")
        elif action == "get_price_history":
            lines.append(f"Here is the {names} price history{f' for {one_market}' if one_market else ''}:")
        else:
            lines.append(f"{names} prices{at}{on}:")
        lines += _price_table(records, rank_by_modal=not is_extreme)
        if total and total > len(records) and not is_extreme:
            lines.append(f"Showing {len(records)} of {total} records.")
        return lines

    if len(records) == 1:
        r = records[0]
        mkt = _title(r.get("market_name"))
        at = f" at {mkt}" if mkt else ""
        on = f" on {date_val}" if date_val else ""
        if heading:
            lines.append(heading)
        elif is_extreme:
            lines.append(f"Here is the {order} {names} price{at}{on}:")
        else:
            lines.append(f"{names} price{at}{on}:")
        lines.append(_metrics_line(r))
    return lines


# --------------------------------------------------------------------------
# Summary / arrival / market-search blocks
# --------------------------------------------------------------------------

def _period_line(payload: dict) -> str | None:
    meta = _resolution(payload).get("date_filter") or {}
    if not isinstance(meta, dict):
        return None
    if meta.get("mode") == "lookback" and meta.get("lookback_days"):
        return f"Period: last {meta['lookback_days']} days (from {meta.get('from')})"
    if meta.get("mode") == "range":
        fd, td = meta.get("from_date"), meta.get("to_date")
        if fd and td:
            return f"Period: {fd}" if fd == td else f"Period: {fd} to {td}"
    return None


def _summary_block(payload: dict, *, crop: str | None, market_name: str | None) -> list[str]:
    stats = payload.get("stats") or {}
    overall = stats.get("overall") or {}
    by_commodity = stats.get("by_commodity") or {}
    requested = payload.get("requested_commodities") or []
    where = f" for {_title(market_name)}" if market_name else ""
    lines: list[str] = []

    if len(requested) > 1 and by_commodity:
        lines.append(f"Here is the {_join_names([_title(c) for c in requested])} price summary{where}:")
        rows = []
        for name, v in by_commodity.items():
            rows.append([
                _title(name), _num(v.get("avg_modal_price")) or "", _num(v.get("lowest_min_price")) or "",
                _num(v.get("highest_max_price")) or "", str(v.get("record_count") or ""),
            ])
        lines += _table(["Commodity", "Avg Modal (Rs/quintal)", "Lowest Min (Rs)", "Highest Max (Rs)", "Records"], rows)
    else:
        commodity = _title(crop) or (_title(next(iter(by_commodity))) if by_commodity else "Commodity")
        lines.append(f"Here is the {commodity} price summary{where}:")
        for label, key, unit in (
            ("Average Modal Price", "avg_modal_price", "/quintal"),
            ("Highest Max Price", "highest_max_price", ""),
            ("Lowest Min Price", "lowest_min_price", ""),
            ("Price Spread", "price_spread", ""),
        ):
            val = fmt_price(overall.get(key))
            if val:
                lines.append(f"{label}: {val}{unit}")
        total_arr = _num(overall.get("total_arrival_qty"))
        if total_arr:
            lines.append(f"Total Arrival Quantity: {total_arr} tonnes")

    period = _period_line(payload)
    if period:
        lines.append(period)
    n = payload.get("total_records_analysed") or stats.get("total_records") or overall.get("total_records")
    if n:
        lines.append(f"Total Records Analysed: {n}")
    return lines if len(lines) > 1 else []


def _arrival_block(payload: dict, *, crop: str | None) -> list[str]:
    action = payload.get("action") or ""
    records = _dedupe_records([
        r for r in (
            payload.get("arrival_records") or payload.get("highest_arrivals")
            or payload.get("lowest_arrivals") or payload.get("extreme_records") or []
        ) if isinstance(r, dict)
    ])
    if not records:
        return []
    commodities = _distinct([str(r.get("commodity_name") or "").lower() for r in records])
    dates = _distinct([r.get("date") for r in records])
    markets = _distinct([str(r.get("market_name") or "").lower() for r in records])
    names = _join_names(_distinct([_title(r.get("commodity_name")) for r in records])) or _title(crop) or "Commodity"
    one_market = _title(records[0].get("market_name")) if len(markets) == 1 else ""
    order = payload.get("sort_order") or "highest"
    lines: list[str] = []

    def _aq(r: dict) -> str:
        v = _num(r.get("arrival_quantity"))
        return f"Arrival: {v} tonnes" if v else "Arrival: No arrival data"

    if len(records) > 1:
        date_val = dates[0] if len(dates) == 1 else ""
        on = f" on {date_val}" if date_val else ""
        if action == "get_arrival_history":
            lines.append(f"Here is the {names} arrival history{f' for {one_market}' if one_market else ''}:")
        elif action == "get_extreme_arrival":
            lines.append(f"Top {order} {names} arrivals:")
        else:
            lines.append(f"{names} arrivals{on}:")
        show_commodity = len(commodities) > 1
        show_date = len(dates) > 1 or show_commodity
        show_market = len(markets) > 1 or (not show_date and len(records) > 1)
        headers = (["Commodity"] if show_commodity else []) + (["Date"] if show_date else []) + (
            ["Market"] if show_market else []) + ["Arrival (tonnes)"]
        rows = []
        for r in records[:MAX_TABLE_ROWS]:
            rows.append(
                ([_commodity_label(r)] if show_commodity else [])
                + ([str(r.get("date") or "")] if show_date else [])
                + ([_title(r.get("market_name"))] if show_market else [])
                + [_num(r.get("arrival_quantity")) or ""]
            )
        lines += _table(headers, rows)
        return lines

    date_val = dates[0] if dates else ""
    on = f" on {date_val}" if date_val else ""
    at = f" at {one_market}" if one_market else ""
    if action == "get_extreme_arrival":
        lines.append(f"Here is the {order} {names} arrival recorded{at}{on}:")
    else:
        lines.append(f"{names} arrival{at}{on}:")
    lines.append(_aq(records[0]))
    return lines


def _search_markets_block(payload: dict) -> list[str]:
    markets = [m for m in payload.get("markets") or [] if isinstance(m, dict)]
    if not markets:
        return []
    lines = ["Markets found:"]
    for i, m in enumerate(markets[:MAX_SEARCH_MARKETS], 1):
        place = ", ".join(p for p in (_title(m.get("district")), _title(m.get("state"))) if p)
        lines.append(f"{i}) {_title(m.get('name'))}{f' ({place})' if place else ''}")
    if len(markets) > MAX_SEARCH_MARKETS:
        lines.append(f"Showing {MAX_SEARCH_MARKETS} of {len(markets)} markets.")
    return lines


# --------------------------------------------------------------------------
# Section renderers
# --------------------------------------------------------------------------

def _price_records(payload: dict) -> list[dict]:
    return (
        payload.get("price_records") or payload.get("highest_records") or payload.get("lowest_records") or []
    )


def _render_single(payload: dict, *, crop: str | None, market_name: str | None, state: str | None) -> Section:
    sec = Section()
    action = payload.get("action") or ""

    if is_arrival_quantity_unavailable(payload):
        sec.lines = [arrival_unavailable_message(payload, crop=crop, market_name=market_name, state=state)]
        return sec

    if payload.get("error") and not _price_records(payload):
        sec.lines = [str(payload["error"]).strip()]
        return sec

    notices = _notice_lines(payload, market_name=market_name)
    body: list[str] = []
    if action == "get_price_summary" or ("stats" in payload and not _price_records(payload) and not action):
        body = _summary_block(payload, crop=crop, market_name=market_name)
    elif action in ARRIVAL_ACTIONS:
        body = _arrival_block(payload, crop=crop)
    elif action == "search_markets" or "markets" in payload:
        body = _search_markets_block(payload)
    else:
        body = _price_block(
            _price_records(payload), action=action, total=payload.get("total_records_returned"),
        )
    if not body:
        return sec

    arrival_msg = payload.get("message") or _resolution(payload).get("arrival_notice")
    tail = [f"Note: {arrival_msg}."] if arrival_msg and action in ARRIVAL_ACTIONS else []
    sec.lines = notices + body + tail + _note_lines(payload)
    sec.sources = extract_source_systems(payload)
    sec.has_data = True
    return sec


def _render_composite(payload: dict, *, crop: str | None, market_name: str | None, state: str | None) -> Section:
    """get_price_with_nearby: named mandi first, then nearby markets."""
    sec = Section()
    named = payload.get("named_market")
    nearby = payload.get("nearby_markets")
    blocks: list[list[str]] = []

    if isinstance(named, dict):
        named_sec = _render_single(named, crop=crop, market_name=market_name, state=state)
        lines = named_sec.lines
        if not lines:
            res = _resolution(named)
            fallback = res.get("latest_price_notice")
            req = res.get("requested_market_name")
            if fallback:
                lines = [str(fallback).strip()]
            elif req:
                lines = [f"Price data is not available for {_title(crop) or 'this commodity'} at {_title(req)}."]
        if lines:
            blocks.append(lines)
        sec.has_data = sec.has_data or named_sec.has_data

    if isinstance(nearby, dict) and nearby.get("price_records"):
        recs = dedupe_and_sort_nearby_records(nearby["price_records"], top_n=MAX_NEARBY_ROWS)
        if recs:
            dates = _distinct([r.get("date") for r in recs])
            on = f" on {dates[0]}" if len(dates) == 1 else ""
            notice = _resolution(nearby).get("latest_price_notice")
            lines = ([str(notice).strip()] if notice and not blocks else []) + _price_block(
                recs, action="nearby_markets_price", heading=f"Prices in nearby markets{on}:",
            )
            blocks.append(lines)
            sec.has_data = True

    sec.lines = [ln for i, b in enumerate(blocks) for ln in ((([""] if i else []) + b))]
    sec.sources = extract_source_systems(payload)
    return sec


def _render_any(payload: Any, *, crop: str | None, market_name: str | None, state: str | None) -> Section:
    if not isinstance(payload, dict):
        return Section()
    if isinstance(payload.get("results"), dict):
        merged = Section()
        blocks: list[list[str]] = []
        for sub in payload["results"].values():
            s = _render_any(sub, crop=crop, market_name=market_name, state=state)
            if s.lines:
                blocks.append(s.lines)
            merged.has_data = merged.has_data or s.has_data
            for src in s.sources:
                if src not in merged.sources:
                    merged.sources.append(src)
        merged.lines = [ln for i, b in enumerate(blocks) for ln in ((([""] if i else []) + b))]
        return merged
    if payload.get("named_market") is not None or payload.get("action") == "get_price_with_nearby":
        return _render_composite(payload, crop=crop, market_name=market_name, state=state)
    return _render_single(payload, crop=crop, market_name=market_name, state=state)


def render_daily_price_answer(
    payload: Any,
    *,
    crop: str | None = None,
    market_name: str | None = None,
    state: str | None = None,
) -> RenderedAnswer | None:
    """Render the tool payload into the fixed structure; None when nothing is renderable."""
    sec = _render_any(payload, crop=crop, market_name=market_name, state=state)
    if not sec.lines:
        return None
    return RenderedAnswer(head="\n".join(sec.lines), sources=sec.sources, has_data=sec.has_data)


# --------------------------------------------------------------------------
# Number guard for the optional LLM summary
# --------------------------------------------------------------------------

def _numbers_in(text: str) -> set[str]:
    out: set[str] = set()
    for m in _NUMBER_RE.findall(text or ""):
        cleaned = m.replace(",", "")
        out.add(cleaned)
        if "." in cleaned:
            out.add(cleaned.rstrip("0").rstrip("."))
    return out


def summary_is_grounded(summary: str, reference_text: str, *, max_chars: int = 400) -> bool:
    """A summary is accepted only if every number in it already appears in the rendered answer.

    It must also be short, plain text (no markdown, no table, no source line).
    """
    s = (summary or "").strip()
    if not s or len(s) > max_chars or s.count("\n") > 2:
        return False
    if any(tok in s for tok in ("|", "**", "##", "`")) or "fetched from the following" in s.lower():
        return False
    allowed = _numbers_in(reference_text)
    return all(n in allowed for n in _numbers_in(s))
