"""Farmer-friendly answers for the v2 mandi price tool (tools/daily_price_v2).

Every number, date, mandi name and source comes from the tool JSON; nothing is
written by an LLM. The text is plain (no tables) so it reads well on a phone and
when spoken aloud:

    <notice: e.g. which mandi was shown instead of the one asked for>
    Onion price today (2 Nov 2026) in mandis near you:
    1. Karnal APMC (12 km away): ₹2,320 per quintal (₹2,250 – ₹2,400)
    2. Gharaunda APMC (18 km away): ₹2,280 per quintal (₹2,200 – ₹2,350)
    <note: crops that had no price>

    Prices are per quintal (100 kg). The first price is the rate most of the produce sold at; the range is the lowest and highest rate.
    Source: Agmarknet.
    Last updated: today (2 Nov 2026) at 6:15 AM IST.

"Last updated" is when the scraper last saved these prices (the newest `ingested_at`).

When the tool has no price for the asked day, the answer is the tool's message
only: an older price is never shown in its place.

The v1 formatter (daily_price_formatter) is not used here and is not changed.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any

IST = timezone(timedelta(hours=5, minutes=30))

ARRIVAL_ACTIONS = frozenset({"get_today_arrival", "get_arrival_history", "get_extreme_arrival"})
MAX_ROWS = 10           # mandis or dates listed per crop
MAX_NEARBY = 3          # nearby mandis listed under a named mandi
MAX_MARKETS = 10        # mandis listed for "mandis near me"

PRICE_NOTE = (
    "Prices are per quintal (100 kg). The first price is the rate most of the produce sold at; "
    "the range is the lowest and highest rate."
)
_GENERIC_VARIETIES = frozenset({"", "faq", "other", "others", "na", "n/a", "-", "none", "null", "local", "common", "general"})
_UNKNOWN_SOURCES = frozenset({"", "none", "null", "unknown"})
_SOURCE_NAMES = {
    "agmarknet": "Agmarknet",
    "agmark": "Agmarknet",
    "enam": "eNAM",
    "msamb": "MSAMB (Maharashtra)",
}

SERVICE_ERROR_MESSAGE = "Mandi prices could not be fetched right now. Please try again in a few minutes."


# --------------------------------------------------------------------------
# Small formatting helpers
# --------------------------------------------------------------------------

def today_ist() -> date:
    return datetime.now(IST).date()


def _float(value: Any) -> float | None:
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f if f == f and f not in (float("inf"), float("-inf")) else None


def inr(value: Any) -> str | None:
    """₹ with Indian digit grouping: 123456.5 -> '₹1,23,456.50', 2320 -> '₹2,320'."""
    f = _float(value)
    if f is None:
        return None
    whole = int(abs(f))
    frac = round(abs(f) - whole, 2)
    if frac >= 0.995:  # 99.999 rounds up
        whole, frac = whole + 1, 0.0
    digits = str(whole)
    if len(digits) > 3:
        head, tail = digits[:-3], digits[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        digits = ",".join(groups + [tail])
    text = f"₹{digits}" + (f".{int(round(frac * 100)):02d}" if frac >= 0.005 else "")
    return f"-{text}" if f < 0 else text


def qty(value: Any) -> str | None:
    f = _float(value)
    if f is None:
        return None
    return str(int(f)) if f.is_integer() else f"{f:.2f}".rstrip("0").rstrip(".")


def _parse_day(value: Any) -> date | None:
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


def nice_day(value: Any, today: date | None = None) -> str:
    """'2026-11-02' -> 'today (2 Nov 2026)', 'yesterday (1 Nov 2026)' or '28 Oct 2026'."""
    d = _parse_day(value)
    if d is None:
        return str(value or "")
    today = today or today_ist()
    label = f"{d.day} {d:%b %Y}"
    if d == today:
        return f"today ({label})"
    if d == today - timedelta(days=1):
        return f"yesterday ({label})"
    return label


def long_day(value: Any) -> str:
    d = _parse_day(value)
    return f"{d.day} {d:%b %Y}" if d else str(value or "")


def short_day(value: Any) -> str:
    d = _parse_day(value)
    return f"{d.day} {d:%b}" if d else str(value or "")


def title(text: Any) -> str:
    s = " ".join(str(text or "").split()).title()
    return re.sub(r"\bApmc\b", "APMC", s)


def join_names(names: list[str], word: str = "and") -> str:
    names = [n for n in names if n]
    if len(names) <= 1:
        return "".join(names)
    return ", ".join(names[:-1]) + f" {word} " + names[-1]


def _distinct(values: list[Any]) -> list[Any]:
    out: list[Any] = []
    for v in values:
        if v and v not in out:
            out.append(v)
    return out


def crop_of(rec: dict) -> str:
    return title(rec.get("product_name") or rec.get("commodity_name")) or "Crop"


def variety_of(rec: dict) -> str:
    """Variety worth showing: not generic and not just the crop's own name."""
    crop_words = set(re.findall(r"[a-z]+", str(rec.get("product_name") or rec.get("commodity_name") or "").lower()))
    out = []
    for key in ("variety", "grade"):
        v = " ".join(str(rec.get(key) or "").split())
        words = set(re.findall(r"[a-z]+", v.lower()))
        if v.lower() in _GENERIC_VARIETIES or not words or words <= crop_words:
            continue
        if v.lower() not in [o.lower() for o in out]:
            out.append(title(v))
    return ", ".join(out)


def mandi_of(rec: dict, *, with_distance: bool = True) -> str:
    name = title(rec.get("market_name")) or "Mandi"
    extras = []
    var = variety_of(rec)
    if var:
        extras.append(var)
    dist = qty(rec.get("distance_km")) if with_distance else None
    if dist is not None:
        extras.append(f"{dist} km away")
    return f"{name} ({', '.join(extras)})" if extras else name


def price_of(rec: dict) -> str:
    """'₹2,320 per quintal (₹2,250 – ₹2,400)'; a range alone when the modal price is missing."""
    modal, low, high = inr(rec.get("modal_price")), inr(rec.get("min_price")), inr(rec.get("max_price"))
    span = f"{low} – {high}" if low and high and low != high else (low or high)
    if modal:
        return f"{modal} per quintal" + (f" ({span})" if span and span != modal else "")
    if span:
        return f"{span} per quintal"
    return "price not reported"


def source_line(payload: Any) -> str:
    sources: list[str] = []

    def walk(obj: Any) -> None:
        if isinstance(obj, dict):
            raw = obj.get("source_system")
            if raw:
                for part in str(raw).split(","):
                    key = part.strip()
                    if key.lower() in _UNKNOWN_SOURCES:
                        continue
                    name = _SOURCE_NAMES.get(re.sub(r"[^a-z]", "", key.lower()), key)
                    if name not in sources:
                        sources.append(name)
            for v in obj.values():
                walk(v)
        elif isinstance(obj, list):
            for v in obj:
                walk(v)

    walk(payload)
    return f"Source: {', '.join(sources)}." if sources else ""


def _ingested_time(value: Any) -> datetime | None:
    try:
        t = datetime.fromisoformat(str(value).strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def updated_line(payload: Any, today: date | None = None) -> str:
    """'Last updated: today (3 Nov 2026) at 6:15 AM IST.' — the latest scrape behind the answer.

    Taken from the tool's `data_updated_at` (resolution) and each row's `ingested_at`, both UTC.
    """
    latest: datetime | None = None

    def walk(obj: Any) -> None:
        nonlocal latest
        if isinstance(obj, dict):
            for key in ("data_updated_at", "ingested_at"):
                t = _ingested_time(obj[key]) if obj.get(key) else None
                if t and (latest is None or t > latest):
                    latest = t
            for v in obj.values():
                walk(v)
        elif isinstance(obj, list):
            for v in obj:
                walk(v)

    walk(payload)
    if latest is None:
        return ""
    local = latest.astimezone(IST)
    clock = local.strftime("%I:%M %p").lstrip("0")
    return f"Last updated: {nice_day(local.date().isoformat(), today)} at {clock} IST."


# --------------------------------------------------------------------------
# Context from the tool's resolution block
# --------------------------------------------------------------------------

def _res(payload: dict) -> dict:
    r = payload.get("resolution")
    return r if isinstance(r, dict) else {}


def period_text(payload: dict, today: date) -> str:
    """'today (2 Nov 2026)', 'the last 7 days (27 Oct – 2 Nov 2026)', '28 Oct 2026'."""
    meta = _res(payload).get("date_filter") or {}
    if not isinstance(meta, dict):
        return ""
    if meta.get("mode") == "lookback":
        n = int(meta.get("lookback_days") or 1)
        if n == 1:
            return nice_day(meta.get("to") or today.isoformat(), today)
        return f"the last {n} days ({short_day(meta.get('from'))} – {long_day(meta.get('to') or today.isoformat())})"
    if meta.get("mode") == "range":
        fd, td = meta.get("from_date"), meta.get("to_date")
        if fd and td and fd == td:
            return nice_day(fd, today)
        if fd and td:
            return f"{short_day(fd)} – {long_day(td)}"
    return ""


def where_text(payload: dict, records: list[dict]) -> str:
    """Where the prices come from, from the farmer's point of view."""
    res = _res(payload)
    used = res.get("location_priority_used")
    markets = _distinct([str(r.get("market_name") or "").lower() for r in records])
    if len(markets) == 1:
        return f"at {title(records[0].get('market_name'))}"
    if used == "lat_long" or any(r.get("distance_km") is not None for r in records):
        return "in mandis near you"
    if used == "district_markets":
        districts = _distinct([title(r.get("district")) for r in records])
        return f"in {districts[0]} district mandis" if len(districts) == 1 else "in your district's mandis"
    states = _distinct([title(r.get("state")) for r in records])
    return f"in {states[0]} mandis" if len(states) == 1 else "in mandis"


def notice_lines(payload: dict) -> list[str]:
    res = _res(payload)
    lines = []
    for key in ("market_match_notice", "market_fallback_notice", "fallback"):
        text = str(res.get(key) or "").strip()
        if text and text not in lines:
            lines.append(text)
            if key == "market_fallback_notice":
                break  # it already says what is shown instead
    return lines


def note_lines(payload: dict) -> list[str]:
    res = _res(payload)
    notes = [f"Note: {w}" for w in res.get("unavailable_commodities") or [] if w]
    return notes


# --------------------------------------------------------------------------
# Blocks
# --------------------------------------------------------------------------

def _dedupe(records: list[dict]) -> list[dict]:
    seen: set[tuple] = set()
    out = []
    for r in records:
        if not isinstance(r, dict):
            continue
        key = (r.get("date"), crop_of(r), str(r.get("market_name") or "").lower(), variety_of(r),
               r.get("modal_price"), r.get("min_price"), r.get("max_price"))
        if key not in seen:
            seen.add(key)
            out.append(r)
    return out


def _by_crop(records: list[dict]) -> dict[str, list[dict]]:
    groups: dict[str, list[dict]] = {}
    for r in records:
        groups.setdefault(crop_of(r), []).append(r)
    return groups


def _more(n: int, what: str) -> list[str]:
    return [f"…and {n} more {what}."] if n > 0 else []


def price_block(payload: dict, records: list[dict], *, today: date, heading: str | None = None) -> list[str]:
    records = _dedupe(records)
    if not records:
        return []
    lines: list[str] = []
    groups = _by_crop(records)
    for i, (crop, recs) in enumerate(groups.items()):
        if i:
            lines.append("")
        dates = _distinct([r.get("date") for r in recs])
        markets = _distinct([str(r.get("market_name") or "").lower() for r in recs])
        where = where_text(payload, recs)
        if len(dates) == 1 and len(recs) == 1:
            # One price: the mandi (with variety and distance) goes in the heading.
            r = recs[0]
            lines.append(heading or f"{crop} price {nice_day(dates[0], today)} at {mandi_of(r)}:")
            lines.append(price_of(r) if not heading else f"{mandi_of(r)}: {price_of(r)}")
            continue
        if heading and len(groups) == 1:
            lines.append(heading)
        elif len(dates) == 1:
            lines.append(f"{crop} price {nice_day(dates[0], today)} {where}:")
        else:
            period = period_text(payload, today)
            lines.append(f"{crop} prices {where}" + (f", {period}" if period else "") + ":")
        if len(dates) == 1:
            # One day, several mandis: nearest first when distances are known, else highest price first.
            ordered = sorted(recs, key=lambda r: (r.get("distance_km") is None, _float(r.get("distance_km")) or 0,
                                                  -(_float(r.get("modal_price")) or _float(r.get("max_price")) or 0)))
            for n, r in enumerate(ordered[:MAX_ROWS], 1):
                lines.append(f"{n}. {mandi_of(r)}: {price_of(r)}")
            lines += _more(len(ordered) - MAX_ROWS, "mandis")
            continue
        # Several days: newest first.
        ordered = sorted(recs, key=lambda r: str(r.get("date") or ""), reverse=True)
        for r in ordered[:MAX_ROWS]:
            who = "" if len(markets) == 1 else f" – {mandi_of(r)}"
            lines.append(f"• {short_day(r.get('date'))}{who}: {price_of(r)}")
        lines += _more(len(ordered) - MAX_ROWS, "price records")
    return lines


def summary_block(payload: dict, *, crop: str | None, today: date) -> list[str]:
    stats = payload.get("stats") or {}
    overall = stats.get("overall") or {}
    by_commodity = stats.get("by_commodity") or {}
    period = period_text(payload, today)
    tail = f" for {period}" if period else ""
    lines: list[str] = []
    if len(by_commodity) > 1 or (by_commodity and not overall):
        lines.append(f"Price summary{tail}:")
        for name, v in by_commodity.items():
            parts = [p for p in (
                f"average {inr(v.get('avg_modal_price'))}" if inr(v.get("avg_modal_price")) else "",
                f"lowest {inr(v.get('lowest_min_price'))}" if inr(v.get("lowest_min_price")) else "",
                f"highest {inr(v.get('highest_max_price'))}" if inr(v.get("highest_max_price")) else "",
            ) if p]
            if parts:
                lines.append(f"• {title(name)}: {', '.join(parts)} per quintal")
        return lines if len(lines) > 1 else []
    name = title(crop) or (title(next(iter(by_commodity))) if by_commodity else "Crop")
    lines.append(f"{name} price summary{tail}:")
    for label, key in (("Average price", "avg_modal_price"), ("Lowest price", "lowest_min_price"),
                       ("Highest price", "highest_max_price")):
        val = inr(overall.get(key))
        if val:
            lines.append(f"• {label}: {val} per quintal")
    n = payload.get("total_records_analysed") or stats.get("total_records")
    if n and len(lines) > 1:
        lines.append(f"• Based on {n} price record{'s' if int(n) != 1 else ''}")
    return lines if len(lines) > 1 else []


def extreme_block(payload: dict, *, today: date) -> list[str]:
    action = payload.get("action")
    word = "Highest" if action == "get_highest_price" else "Lowest"
    records = _dedupe(payload.get("highest_records") or payload.get("lowest_records") or [])
    if not records:
        return []
    period = period_text(payload, today)
    tail = f" in {period}" if period and period.startswith("the last") else (f" for {period}" if period else "")
    lines = []
    for r in records:
        lines.append(
            f"{word} {crop_of(r).lower()} price{tail}: {price_of(r)} at {mandi_of(r)} on {nice_day(r.get('date'), today)}."
        )
    return lines


def arrival_block(payload: dict, *, crop: str | None, today: date) -> list[str]:
    action = payload.get("action") or ""
    records = [r for r in (payload.get("arrival_records") or payload.get("highest_arrivals")
                           or payload.get("lowest_arrivals") or payload.get("extreme_records") or [])
               if isinstance(r, dict)]
    with_qty = [r for r in records if _float(r.get("arrival_quantity")) is not None]
    name = (crop_of(records[0]) if records else title(crop)) or "Crop"
    period = period_text(payload, today)
    if not with_qty:
        when = f" for {period}" if period else ""
        return [f"Arrival quantity for {name.lower()} is not reported by these mandis{when}."]
    lines: list[str] = []
    if action == "get_extreme_arrival":
        word = "Highest" if (payload.get("sort_order") or "highest") == "highest" else "Lowest"
        lines.append(f"{word} {name.lower()} arrivals" + (f", {period}" if period else "") + ":")
        for n, r in enumerate(with_qty[:5], 1):
            lines.append(f"{n}. {mandi_of(r)} on {short_day(r.get('date'))}: {qty(r['arrival_quantity'])} tonnes")
        return lines
    dates = _distinct([r.get("date") for r in with_qty])
    if len(dates) == 1:
        lines.append(f"{name} arrivals {nice_day(dates[0], today)}:")
        for n, r in enumerate(with_qty[:MAX_ROWS], 1):
            lines.append(f"{n}. {mandi_of(r)}: {qty(r['arrival_quantity'])} tonnes")
        lines += _more(len(with_qty) - MAX_ROWS, "mandis")
    else:
        lines.append(f"{name} arrivals" + (f", {period}" if period else "") + ":")
        ordered = sorted(with_qty, key=lambda r: str(r.get("date") or ""), reverse=True)
        for r in ordered[:MAX_ROWS]:
            lines.append(f"• {short_day(r.get('date'))} – {mandi_of(r)}: {qty(r['arrival_quantity'])} tonnes")
        lines += _more(len(ordered) - MAX_ROWS, "records")
    if len(with_qty) < len(records):
        lines.append("Some mandis did not report the arrival quantity.")
    return lines


def markets_block(payload: dict) -> list[str]:
    markets = [m for m in payload.get("markets") or [] if isinstance(m, dict)]
    if not markets:
        return []
    near = any(m.get("distance_km") is not None for m in markets)
    if near:
        markets.sort(key=lambda m: _float(m.get("distance_km")) or 0)
        lines = ["Mandis near you:"]
    elif payload.get("mode") == "name_match":
        lines = ["Mandis matching your search:"]
    else:
        lines = ["Mandis in your state:"]
    for n, m in enumerate(markets[:MAX_MARKETS], 1):
        district = title(m.get("district"))
        dist = qty(m.get("distance_km"))
        bits = [f"{district} district" if district else "", f"{dist} km away" if dist else ""]
        extra = ", ".join(b for b in bits if b)
        lines.append(f"{n}. {title(m.get('name'))}" + (f" ({extra})" if extra else ""))
    lines += _more(len(markets) - MAX_MARKETS, "mandis")
    return lines


# --------------------------------------------------------------------------
# Payload walkers
# --------------------------------------------------------------------------

@dataclass
class Rendered:
    lines: list[str] = field(default_factory=list)
    has_prices: bool = False

    def text(self, payload: Any, today: date | None = None) -> str:
        body = "\n".join(self.lines).strip()
        parts = [body]
        if self.has_prices:
            parts.append(PRICE_NOTE)
        src = source_line(payload) if self.has_prices else ""
        if src:
            parts.append(src)
        # Arrivals come from the same scrape, so they get the line too; a list of mandis has no time.
        parts.append(updated_line(payload, today))
        return "\n\n".join(p for p in parts if p)


def error_message(payload: dict) -> str:
    msg = " ".join(str(payload.get("error") or "").split())
    return msg or SERVICE_ERROR_MESSAGE


def _price_records(payload: dict) -> list[dict]:
    return [r for r in payload.get("price_records") or [] if isinstance(r, dict)]


def _render_single(payload: dict, *, crop: str | None, today: date) -> Rendered:
    out = Rendered()
    if payload.get("error") and not _price_records(payload):
        out.lines = [error_message(payload)]
        return out
    action = payload.get("action") or ""
    body: list[str]
    prices = False
    if action == "get_price_summary":
        body, prices = summary_block(payload, crop=crop, today=today), True
    elif action in ("get_highest_price", "get_lowest_price"):
        body, prices = extreme_block(payload, today=today), True
    elif action in ARRIVAL_ACTIONS:
        body = arrival_block(payload, crop=crop, today=today)
    elif action == "search_markets" or "markets" in payload:
        body = markets_block(payload)
    else:
        body, prices = price_block(payload, _price_records(payload), today=today), True
    if not body:
        return out
    notices = notice_lines(payload)
    out.lines = notices + ([""] if notices else []) + body + note_lines(payload)
    out.has_prices = prices
    return out


def _render_nearby(payload: dict, *, crop: str | None, today: date) -> Rendered:
    out = Rendered()
    named = payload.get("named_market") if isinstance(payload.get("named_market"), dict) else {}
    nearby = payload.get("nearby_markets") if isinstance(payload.get("nearby_markets"), dict) else {}
    blocks: list[list[str]] = []

    named_recs = _price_records(named)
    if named_recs:
        sec = _render_single({**named, "action": "get_today_price"}, crop=crop, today=today)
        blocks.append(sec.lines)
        out.has_prices = True
    elif named.get("error"):
        blocks.append([error_message(named)])

    shown = {str(r.get("market_name") or "").lower() for r in named_recs}
    near_recs = [r for r in _dedupe(_price_records(nearby)) if str(r.get("market_name") or "").lower() not in shown]
    if near_recs:
        by_market: dict[str, dict] = {}
        for r in near_recs:
            by_market.setdefault(str(r.get("market_name") or "").lower(), r)
        recs = list(by_market.values())
        recs.sort(key=lambda r: (r.get("distance_km") is None, _float(r.get("distance_km")) or 0))
        dates = _distinct([r.get("date") for r in recs])
        res = _res(nearby)
        when = f" {nice_day(dates[0], today)}" if len(dates) == 1 else ""
        if res.get("nearby_reference") == "user_location":
            radius = qty(res.get("nearby_radius_km"))
            head = f"Prices{when} in mandis near you" + (f" (within {radius} km)" if radius else "") + ":"
        else:
            head = f"Prices{when} in other mandis nearby:"
        lines = [head] + [f"{n}. {mandi_of(r)}: {price_of(r)}" for n, r in enumerate(recs[:MAX_NEARBY], 1)]
        blocks.append(lines)
        out.has_prices = True

    out.lines = [ln for i, b in enumerate(blocks) for ln in (([""] if i else []) + b)]
    out.lines += note_lines(payload)
    return out


def _render_any(payload: Any, *, crop: str | None, today: date) -> Rendered:
    if not isinstance(payload, dict):
        return Rendered()
    if isinstance(payload.get("results"), dict):
        merged = Rendered()
        blocks = []
        for sub in payload["results"].values():
            sec = _render_any(sub, crop=crop, today=today)
            if sec.lines:
                blocks.append(sec.lines)
            merged.has_prices = merged.has_prices or sec.has_prices
        merged.lines = [ln for i, b in enumerate(blocks) for ln in (([""] if i else []) + b)]
        return merged
    if payload.get("action") == "get_price_with_nearby" and not payload.get("error"):
        return _render_nearby(payload, crop=crop, today=today)
    return _render_single(payload, crop=crop, today=today)


def has_any_data(payload: Any) -> bool:
    """True when the payload holds at least one price, arrival or mandi to show."""
    if not isinstance(payload, dict):
        return False
    if isinstance(payload.get("results"), dict):
        return any(has_any_data(v) for v in payload["results"].values())
    if payload.get("error") and not payload.get("price_records"):
        return False
    for key in ("price_records", "highest_records", "lowest_records", "markets"):
        if payload.get(key):
            return True
    for key in ("arrival_records", "highest_arrivals", "lowest_arrivals"):
        if any(_float(r.get("arrival_quantity")) is not None for r in payload.get(key) or [] if isinstance(r, dict)):
            return True
    if (payload.get("stats") or {}).get("by_commodity") or (payload.get("stats") or {}).get("overall", {}).get("avg_modal_price"):
        return True
    for key in ("named_market", "nearby_markets"):
        if isinstance(payload.get(key), dict) and has_any_data(payload[key]):
            return True
    return False


def render_answer(payload: Any, *, crop: str | None = None, today: date | None = None) -> str:
    """The farmer's answer for a tool payload; the tool's own message when it has nothing to show."""
    today = today or today_ist()
    sec = _render_any(payload, crop=crop, today=today)
    if not sec.lines:
        if isinstance(payload, dict) and (payload.get("error") or payload.get("error_code")):
            return error_message(payload)
        return SERVICE_ERROR_MESSAGE if not isinstance(payload, dict) else (
            f"{title(crop) + ' price' if crop and crop.lower() not in {'all', 'any'} else 'Mandi price'} "
            "is not available for this request."
        )
    return sec.text(payload, today)
