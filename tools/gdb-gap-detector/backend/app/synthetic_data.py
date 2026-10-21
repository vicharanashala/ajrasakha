"""
Fake disclaimer-triggered questions shaped like the real
gdb_gap_detector.raw_queries docs (question, crop, state, domain,
disclaimer_triggered, timestamp).

Used for demoing without a live DB, and for tests where we need a known
correct grouping to check the clustering against - can't really do that
with messy real data.

Embeddings here are just small random vectors clustered by topic, standing
in for the real sentence-transformer embeddings computed at runtime (see
embeddings.py) - the real DB has no stored embedding field.
"""

from __future__ import annotations
import random
from datetime import datetime, timedelta, timezone
from typing import TypedDict


class SyntheticQuestion(TypedDict):
    question: str
    crop: str
    state: str
    domain: str
    embedding: list[float]
    created_at: datetime


# A handful of "topic clusters" — each represents farmers hitting the same
# real knowledge gap, phrased slightly differently (mirrors how real farmers
# would ask the same underlying question in different words).
_TOPIC_CLUSTERS = [
    {
        "crop": "Cotton", "state": "Punjab", "domain": "Pest",
        "questions": [
            "Why are my cotton leaves turning yellow?",
            "Cotton crop leaves yellowing, what is the cause?",
            "My cotton plants have yellow leaves, please help",
            "Yellow spots on cotton leaves this season",
        ],
        "embedding_center": [0.9, 0.1, 0.1, 0.0],
    },
    {
        "crop": "Rice", "state": "West Bengal", "domain": "Weather",
        "questions": [
            "When should I sow rice this monsoon season?",
            "Best time to plant paddy before the rains",
            "Rice sowing schedule for this year's monsoon",
        ],
        "embedding_center": [0.1, 0.9, 0.1, 0.0],
    },
    {
        "crop": "Wheat", "state": "Haryana", "domain": "Scheme",
        "questions": [
            "What government schemes are available for wheat farmers?",
            "Wheat subsidy scheme details for this year",
            "How to apply for wheat crop insurance scheme",
            "Government support for wheat cultivation",
            "Wheat MSP scheme application process",
        ],
        "embedding_center": [0.1, 0.1, 0.9, 0.0],
    },
    {
        "crop": "Tomato", "state": "Karnataka", "domain": "Pest",
        "questions": [
            "Tomato plant leaves have small holes, what pest is this?",
            "Insects eating my tomato leaves",
        ],
        "embedding_center": [0.85, 0.15, 0.05, 0.1],
    },
    {
        "crop": "Sugarcane", "state": "Maharashtra", "domain": "Soil",
        "questions": [
            "Best fertilizer for sugarcane in black soil",
            "Soil preparation tips for sugarcane planting",
        ],
        "embedding_center": [0.0, 0.1, 0.1, 0.9],
    },
]


def _jitter(vec: list[float], amount: float = 0.08) -> list[float]:
    """Adds small random noise to an embedding, simulating that no two
    real questions have identical embeddings even on the same topic."""
    return [v + random.uniform(-amount, amount) for v in vec]


def generate_synthetic_gdb_entry_counts() -> dict[tuple[str, str], int]:
    """
    Synthetic counts of existing, already-answered GDB entries per
    (domain, state) — mirrors querying `farmer_feedback.gdb_entries` in the
    real database, grouped by domain+state (that collection has `domain`
    and `state` fields but no `crop` field, confirmed by inspection — so
    domain+state is the finest granularity the real coverage-ratio
    calculation actually supports).

    Deliberately varied relative to the gap volumes in _TOPIC_CLUSTERS
    above, so the demo shows the coverage-ratio calculation actually
    mattering: e.g. Pest/Punjab has heavy gap volume AND reasonable
    existing coverage (a genuinely large-but-partially-served gap), while
    Pest/Karnataka has lighter gap volume but almost no existing coverage
    (a small-but-severe gap).
    """
    return {
        ("Pest", "Punjab"): 40,          # decent existing coverage, but gap volume is still high
        ("Weather", "West Bengal"): 25,
        ("Scheme", "Haryana"): 60,        # well covered relative to its gap volume
        ("Pest", "Karnataka"): 2,         # severe: almost nothing in the GDB yet
        ("Soil", "Maharashtra"): 15,
    }


def generate_synthetic_questions(
    weeks_of_history: int = 6,
    growth_topics: tuple[int, ...] = (0,),  # index into _TOPIC_CLUSTERS that should show a growing trend
    seed: int = 42,
) -> list[SyntheticQuestion]:
    """
    Generates a realistic-looking dataset of disclaimer-triggered questions
    spread across `weeks_of_history` weeks. Topics listed in `growth_topics`
    get an increasing number of questions in more recent weeks (simulating a
    genuinely worsening coverage gap); other topics stay roughly flat.
    """
    random.seed(seed)
    now = datetime.now(timezone.utc)
    results: list[SyntheticQuestion] = []

    for topic_idx, topic in enumerate(_TOPIC_CLUSTERS):
        is_growth_topic = topic_idx in growth_topics

        for week in range(weeks_of_history):
            # Growing topics: more questions in recent weeks (week 0 = most recent).
            # Flat topics: roughly constant volume with minor random noise.
            if is_growth_topic:
                count_this_week = max(1, (weeks_of_history - week) * 2)
            else:
                count_this_week = random.randint(1, 3)

            for _ in range(count_this_week):
                q_text = random.choice(topic["questions"])
                days_ago = week * 7 + random.randint(0, 6)
                results.append({
                    "question": q_text,
                    "crop": topic["crop"],
                    "state": topic["state"],
                    "domain": topic["domain"],
                    "embedding": _jitter(topic["embedding_center"]),
                    "created_at": now - timedelta(days=days_ago),
                })

    random.shuffle(results)
    return results
