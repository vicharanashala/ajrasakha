"""Thin client for the already-deployed apis/chemical_detector service.
Reused as-is for the banned/restricted-chemical-name-drift guardrail layer -
never reimplemented here. See Writing Assistant Build Plan, "Chemical
detector - findings" for its verified contract and limitations: it only
recognizes names/aliases in its own reference collection and never looks at
quantities, dosages, or units at all - this client exists for exactly one
narrow purpose, not general chemical-name equivalence.
"""

import httpx

from . import config


class ChemicalDetectorUnavailableError(Exception):
    pass


def detect_chemicals(text: str) -> dict[str, str]:
    """Returns {chemical_name: status} for banned/restricted chemicals found
    in text. Raises ChemicalDetectorUnavailableError on any failure - callers
    must treat that as a failed check, never as 'nothing detected'."""
    if not config.CHEMICAL_DETECTOR_URL:
        raise ChemicalDetectorUnavailableError("CHEMICAL_DETECTOR_URL is not set")

    url = config.CHEMICAL_DETECTOR_URL.rstrip("/") + "/detect-chemicals"
    try:
        # 35s, not 20s: live-tested against the real Render deployment and
        # confirmed its free-tier cold start can take ~25-30s on the first
        # request after idling. A timeout here already fails safe (reject,
        # not a silent pass) - this just avoids an avoidable false reject
        # right after an idle period.
        response = httpx.post(url, json={"text": text}, timeout=35)
        response.raise_for_status()
        data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise ChemicalDetectorUnavailableError(f"chemical_detector call failed: {exc}") from exc

    matches = data.get("matches") or []
    return {m["name"]: m["status"] for m in matches}
