# -*- coding: utf-8 -*-
"""Sample data for the GDB Gap Detector visual demo.

Each ``theme`` is a concept the detector should cluster.  Words are
deliberately reused across paraphrases so the bigram embedder lands
them in the same DBSCAN cluster.

Each theme carries a ``week_fractions`` list of ``(age_window_days, fraction)``
tuples that deterministically distributes documents across the last
several ISO weeks.  Examples:

* ``"hot"`` themes pile most docs into the current 7-day window with a
  smaller tail in the prior 3 weeks -> weekly_growth_pct saturates -> high.
* ``"warm"`` themes spread evenly across 4 weeks -> medium.
* ``"cold"`` themes dump most docs 2-5 weeks ago -> previous > current ->
  negative growth -> low / declining.

Fractions must sum to 1.0.
"""

from __future__ import annotations
import random
from datetime import datetime, timedelta, timezone

NOW = datetime(2026, 7, 28, 10, 0, 0, tzinfo=timezone.utc)


CLUSTER_THEMES = [
    {
        "id": "wheat_rust_punjab",
        "label": "Wheat rust control in Punjab",
        "crop": "Wheat", "state": "Punjab", "domain": "pest",
        "weight": 32, "trend": "hot",
        "week_fractions": [
            ((0, 6), 0.70), ((7, 13), 0.15), ((14, 20), 0.10), ((21, 27), 0.05),
        ],
        "paraphrases": [
            "wheat rust control in punjab",
            "wheat rust control in punjab",
            "wheat rust punjab",
            "wheat rust control punjab",
            "wheat rust in punjab",
            "wheat rust punjab control",
            "control wheat rust punjab",
            "punjab wheat rust",
        ],
    },
    {
        "id": "pmkisan_scheme",
        "label": "PM-KISAN scheme eligibility",
        "crop": "All", "state": "All", "domain": "scheme",
        "weight": 22, "trend": "hot",
        "week_fractions": [
            ((0, 6), 0.65), ((7, 13), 0.20), ((14, 20), 0.10), ((21, 27), 0.05),
        ],
        "paraphrases": [
            "pm kisan scheme eligibility",
            "pm kisan scheme eligibility criteria",
            "pm kisan scheme eligibility",
            "how to apply pm kisan scheme",
            "pm kisan scheme eligibility",
            "pm kisan scheme eligibility check",
            "pm kisan scheme eligibility",
        ],
    },
    {
        "id": "cotton_bollworm_maharashtra",
        "label": "Pink bollworm in cotton (Maharashtra)",
        "crop": "Cotton", "state": "Maharashtra", "domain": "pest",
        "weight": 18, "trend": "warm",
        "week_fractions": [
            ((0, 6), 0.40), ((7, 13), 0.30), ((14, 20), 0.20), ((21, 27), 0.10),
        ],
        "paraphrases": [
            "pink bollworm in cotton maharashtra",
            "pink bollworm in cotton maharashtra",
            "cotton pink bollworm control",
            "pink bollworm in cotton maharashtra",
            "cotton bollworm management",
            "pink bollworm in cotton maharashtra",
        ],
    },
    {
        "id": "paddy_water_bihar",
        "label": "Paddy water management in Bihar",
        "crop": "Paddy", "state": "Bihar", "domain": "water",
        "weight": 14, "trend": "warm",
        "week_fractions": [
            ((0, 6), 0.30), ((7, 13), 0.30), ((14, 20), 0.25), ((21, 27), 0.15),
        ],
        "paraphrases": [
            "paddy water management in bihar",
            "paddy water management in bihar",
            "irrigation for paddy in bihar",
            "paddy water management in bihar",
            "water saving for paddy in bihar",
        ],
    },
    {
        "id": "tomato_leaf_curl_karnataka",
        "label": "Tomato leaf curl virus in Karnataka",
        "crop": "Tomato", "state": "Karnataka", "domain": "disease",
        "weight": 12, "trend": "hot",
        "week_fractions": [
            ((0, 6), 0.70), ((7, 13), 0.15), ((14, 20), 0.10), ((21, 27), 0.05),
        ],
        "paraphrases": [
            "tomato leaf curl virus in karnataka",
            "tomato leaf curl virus in karnataka",
            "leaf curl on tomato plants",
            "tomato leaf curl virus in karnataka",
        ],
    },
    {
        "id": "drip_irrigation_subsidy",
        "label": "Drip irrigation subsidy",
        "crop": "All", "state": "Maharashtra", "domain": "irrigation",
        "weight": 10, "trend": "warm",
        "week_fractions": [
            ((0, 6), 0.30), ((7, 13), 0.30), ((14, 20), 0.25), ((21, 27), 0.15),
        ],
        "paraphrases": [
            "drip irrigation subsidy maharashtra",
            "drip irrigation subsidy maharashtra",
            "drip irrigation subsidy scheme",
            "drip irrigation subsidy maharashtra",
        ],
    },
    {
        "id": "mustard_sowing",
        "label": "Mustard sowing in Rajasthan",
        "crop": "Mustard", "state": "Rajasthan", "domain": "sowing",
        "weight": 8, "trend": "cold",
        "week_fractions": [
            ((0, 6), 0.08), ((7, 13), 0.12), ((14, 20), 0.30),
            ((21, 27), 0.30), ((28, 41), 0.20),
        ],
        "paraphrases": [
            "sowing mustard in rajasthan",
            "mustard sowing time rajasthan",
            "sowing mustard in rajasthan",
            "sowing mustard in rajasthan",
        ],
    },
    {
        "id": "soil_health_card",
        "label": "Soil health card usage",
        "crop": "All", "state": "Uttar Pradesh", "domain": "soil",
        "weight": 6, "trend": "cold",
        "week_fractions": [
            ((0, 6), 0.10), ((7, 13), 0.15), ((14, 20), 0.30),
            ((21, 27), 0.30), ((28, 41), 0.15),
        ],
        "paraphrases": [
            "soil health card uttar pradesh",
            "soil health card uttar pradesh",
            "soil health card usage",
        ],
    },
    {
        "id": "mango_orchard",
        "label": "Mango orchard management",
        "crop": "Mango", "state": "Kerala", "domain": "orchard",
        "weight": 4, "trend": "cold",
        "week_fractions": [
            ((0, 6), 0.05), ((7, 13), 0.15), ((14, 20), 0.30),
            ((21, 27), 0.30), ((28, 41), 0.20),
        ],
        "paraphrases": [
            "mango orchard management in kerala",
            "mango orchard management in kerala",
        ],
    },
    {
        "id": "noise_misc",
        "label": "Misc one-off queries",
        "crop": "Various", "state": "Various", "domain": "misc",
        "weight": 4, "trend": "stable",
        "week_fractions": [
            ((0, 6), 0.25), ((7, 13), 0.25), ((14, 20), 0.25), ((21, 27), 0.25),
        ],
        "paraphrases": [
            "organic certification process",
            "kisan credit card interest rate",
            "neem oil preparation",
            "how to apply for kcc",
        ],
    },
]


def _seeded_random() -> random.Random:
    return random.Random(20260728)


def _pick_age(rng: random.Random, week_fractions) -> float:
    """Pick an age in days according to a ``[(lo,hi), frac, ...]`` table."""
    r = rng.random()
    cum = 0.0
    for (lo, hi), frac in week_fractions:
        cum += frac
        if r < cum:
            return rng.uniform(lo, hi)
    (lo, hi), _ = week_fractions[-1]
    return rng.uniform(lo, hi)


def _build_doc(theme, text, created_at, idx):
    return {
        "question": text,
        "tag": "AJRASAKHA_DISCLAIMER",
        "details": {
            "crop": theme["crop"],
            "state": theme["state"],
            "domain": theme["domain"],
            "language": "en",
        },
        "createdAt": created_at,
        "source": "whatsapp",
        "_id": f"rev_{theme['id']}_{idx}",
    }


def build_reviewer_corpus(now: datetime = NOW) -> list:
    """Generate a deterministic, week-spread corpus."""
    rng = _seeded_random()
    docs = []
    for theme in CLUSTER_THEMES:
        for i in range(theme["weight"]):
            age_days = _pick_age(rng, theme["week_fractions"])
            created = now - timedelta(
                days=age_days,
                hours=rng.randint(0, 23),
                minutes=rng.randint(0, 59),
            )
            text = rng.choice(theme["paraphrases"])
            docs.append(_build_doc(theme, text, created, len(docs)))
    return docs


def build_golden_qa_corpus() -> list:
    """Golden QA corpus for the coverage lookup.

    Structure: ``{cluster_theme_id: [golden_qa, ...]}`` so the demo
    can produce a realistic mix of STRONG / PARTIAL / GAP coverage
    bands.  Any theme with **5+ entries** will be classified
    ``STRONG`` by ``lookup_gdb_coverage``; themes with 1-4 entries
    land in ``PARTIAL``; themes with no entries are ``GAP``.
    """
    by_theme: dict[str, list[dict]] = {
        # 6 entries -> STRONG coverage for the most critical demo theme.
        "wheat_rust_punjab": [
            {
                "text": "Question:\nWhat is the best control for wheat rust in Punjab?\n\nAnswer:\nPropiconazole 25 EC at 0.1% at first appearance; repeat after 15 days if humidity persists.",
                "question": "what is the best control for wheat rust in punjab",
                "answer": "Propiconazole 25 EC at 0.1% at first appearance; repeat after 15 days if humidity persists.",
                "metadata": {"Crop": "Wheat", "State": "Punjab", "Category": "pest"},
            },
            {
                "text": "Question:\nHow to control yellow rust on wheat in Punjab?\n\nAnswer:\nApply Tebuconazole 250 EC at 0.1% at boot stage; monitor from mid-January.",
                "question": "how to control yellow rust on wheat in punjab",
                "answer": "Apply Tebuconazole 250 EC at 0.1% at boot stage; monitor from mid-January.",
                "metadata": {"Crop": "Wheat", "State": "Punjab", "Category": "pest"},
            },
            {
                "text": "Question:\nWheat rust management in Punjab - cultural practices?\n\nAnswer:\nUse resistant varieties (HD 3086, PBW 343), timely sowing by Nov 10, balanced NPK.",
                "question": "wheat rust management in punjab cultural practices",
                "answer": "Use resistant varieties (HD 3086, PBW 343), timely sowing by Nov 10, balanced NPK.",
                "metadata": {"Crop": "Wheat", "State": "Punjab", "Category": "pest"},
            },
            {
                "text": "Question:\nBest fungicide for leaf rust on wheat in Punjab?\n\nAnswer:\nHexaconazole 5 EC at 0.2% OR Propiconazole at 0.1% - whichever is locally available.",
                "question": "best fungicide for leaf rust on wheat in punjab",
                "answer": "Hexaconazole 5 EC at 0.2% OR Propiconazole at 0.1%.",
                "metadata": {"Crop": "Wheat", "State": "Punjab", "Category": "pest"},
            },
            {
                "text": "Question:\nWhen to spray for wheat rust in Punjab?\n\nAnswer:\nAt first appearance of yellow pustules, usually late Dec to mid-Jan. Repeat after 15 days.",
                "question": "when to spray for wheat rust in punjab",
                "answer": "At first appearance of yellow pustules, usually late Dec to mid-Jan. Repeat after 15 days.",
                "metadata": {"Crop": "Wheat", "State": "Punjab", "Category": "pest"},
            },
            {
                "text": "Question:\nIntegrated management of wheat rust in Punjab?\n\nAnswer:\nCombine resistant variety + timely sowing + 1-2 sprays of Propiconazole at 0.1%.",
                "question": "integrated management of wheat rust in punjab",
                "answer": "Combine resistant variety + timely sowing + 1-2 sprays of Propiconazole at 0.1%.",
                "metadata": {"Crop": "Wheat", "State": "Punjab", "Category": "pest"},
            },
        ],
        # 3 entries -> PARTIAL coverage.
        "pmkisan_scheme": [
            {
                "text": "Question:\nWho is eligible for PM-KISAN scheme?\n\nAnswer:\nSmall/marginal farmer families with cultivable land; excl. income-tax payers, govt employees.",
                "question": "who is eligible for pm kisan scheme",
                "answer": "Small/marginal farmer families with cultivable land; excl. income-tax payers, govt employees.",
                "metadata": {"Crop": "All", "State": "All", "Category": "scheme"},
            },
            {
                "text": "Question:\nHow to apply for PM-KISAN scheme?\n\nAnswer:\nSelf-register at pmkisan.gov.in OR through the local CSC / Lekhpal with Aadhaar + land record.",
                "question": "how to apply for pm kisan scheme",
                "answer": "Self-register at pmkisan.gov.in OR through the local CSC / Lekhpal with Aadhaar + land record.",
                "metadata": {"Crop": "All", "State": "All", "Category": "scheme"},
            },
            {
                "text": "Question:\nPM-KISAN installment amount and date?\n\nAnswer:\nRs 6,000/year in 3 instalments of Rs 2,000 each (Apr, Aug, Nov).",
                "question": "pm kisan installment amount and date",
                "answer": "Rs 6,000/year in 3 instalments of Rs 2,000 each (Apr, Aug, Nov).",
                "metadata": {"Crop": "All", "State": "All", "Category": "scheme"},
            },
        ],
        # 2 entries -> PARTIAL coverage.
        "paddy_water_bihar": [
            {
                "text": "Question:\nHow much water does paddy need in Bihar?\n\nAnswer:\nSRI method: alternate wetting/drying, total ~120cm. Conventional: 150-200cm.",
                "question": "how much water does paddy need in bihar",
                "answer": "SRI method: alternate wetting/drying, total ~120cm. Conventional: 150-200cm.",
                "metadata": {"Crop": "Paddy", "State": "Bihar", "Category": "water"},
            },
            {
                "text": "Question:\nWater saving techniques for paddy in Bihar?\n\nAnswer:\nUse SRI (System of Rice Intensification): wider spacing, single seedling, intermittent irrigation.",
                "question": "water saving techniques for paddy in bihar",
                "answer": "Use SRI: wider spacing, single seedling, intermittent irrigation.",
                "metadata": {"Crop": "Paddy", "State": "Bihar", "Category": "water"},
            },
        ],
        # 1 entry -> PARTIAL coverage (just barely).
        "drip_irrigation_subsidy": [
            {
                "text": "Question:\nDrip irrigation subsidy in Maharashtra?\n\nAnswer:\n55-70% subsidy under PMKSY for small/marginal farmers; apply at MahaDBT portal.",
                "question": "drip irrigation subsidy in maharashtra",
                "answer": "55-70% subsidy under PMKSY for small/marginal farmers; apply at MahaDBT portal.",
                "metadata": {"Crop": "All", "State": "Maharashtra", "Category": "irrigation"},
            },
        ],
        # 1 entry -> PARTIAL coverage.
        "soil_health_card": [
            {
                "text": "Question:\nHow to use Soil Health Card in UP?\n\nAnswer:\nFollow the fertilizer dose recommended on the card; re-test every 2 years.",
                "question": "how to use soil health card in up",
                "answer": "Follow the fertilizer dose recommended on the card; re-test every 2 years.",
                "metadata": {"Crop": "All", "State": "Uttar Pradesh", "Category": "soil"},
            },
        ],
        # 0 entries -> GAP (demonstrates uncovered themes):
        # cotton_bollworm_maharashtra, tomato_leaf_curl_karnataka,
        # mustard_sowing, mango_orchard, noise_misc are intentionally
        # left empty so the dashboard shows realistic red bars.
    }
    out: list[dict] = []
    for entries in by_theme.values():
        out.extend(entries)
    return out