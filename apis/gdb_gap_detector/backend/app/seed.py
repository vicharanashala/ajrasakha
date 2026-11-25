"""Synthetic data in the shape of the reviewer app's `questions` collection (demo / tests only)."""
from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone

from .config import settings

STATES = {
    "Maharashtra": ["Nashik", "Pune", "Nagpur", "Jalgaon"],
    "Punjab": ["Ludhiana", "Amritsar", "Bathinda"],
    "Uttar Pradesh": ["Lucknow", "Meerut", "Varanasi"],
    "Karnataka": ["Belagavi", "Mysuru", "Dharwad"],
    "Tamil Nadu": ["Coimbatore", "Madurai", "Salem"],
    "Andhra Pradesh": ["Guntur", "Kurnool", "Krishna"],
    "Madhya Pradesh": ["Indore", "Sehore", "Ujjain"],
    "Gujarat": ["Rajkot", "Junagadh", "Anand"],
    "Telangana": ["Warangal", "Nizamabad"],
    "Odisha": ["Cuttack", "Sambalpur"],
}

# crop -> [(domain, weight, state-bias, [templates], hot)]
TOPICS = {
    "Rice": [
        ("Plant Protection", 5, ["Odisha", "Andhra Pradesh", "Telangana"], [
            "How to control brown planthopper in paddy crop?", "My paddy leaves have brown spots, which disease is this and what spray to use?",
            "Rice blast disease treatment in {s}", "Stem borer attack in paddy what pesticide should I spray"], False),
        ("Nutrient Management", 3, ["Punjab", "Uttar Pradesh"], [
            "What is the correct dose of urea for paddy at tillering stage?", "Zinc deficiency in rice how to correct",
            "How much DAP and potash to apply in paddy per acre"], False),
    ],
    "Wheat": [
        ("Plant Protection", 4, ["Punjab", "Uttar Pradesh", "Madhya Pradesh"], [
            "Yellow rust in wheat what fungicide to spray", "Pink stem borer in wheat control measures", "Aphid attack on wheat ear head how to control"], False),
        ("Crop Production", 3, ["Punjab", "Madhya Pradesh"], [
            "Best sowing time for wheat in late sowing conditions", "Which wheat variety is best for heat tolerance", "Seed rate of wheat per acre for timely sowing"], False),
    ],
    "Tomato": [
        ("Plant Protection", 6, ["Maharashtra", "Karnataka", "Andhra Pradesh"], [
            "Tomato leaf curl virus whitefly control", "Early blight in tomato what spray should I use", "Tuta absoluta tomato leaf miner management",
            "tomato fruit borer control in {s}"], True),
        ("Irrigation", 2, ["Karnataka", "Maharashtra"], [
            "Drip irrigation schedule for tomato per day water requirement", "How much water does tomato need during fruiting"], False),
    ],
    "Chilli": [
        ("Plant Protection", 6, ["Andhra Pradesh", "Telangana", "Karnataka"], [
            "Chilli thrips and mites leaf curl control", "Black thrips attack in chilli what pesticide to spray", "Chilli fruit rot disease anthracnose treatment",
            "Murda complex in chilli how to control"], True),
        ("Nutrient Management", 3, ["Andhra Pradesh", "Telangana"], [
            "Chilli flower drop how to prevent nutrient spray", "Calcium deficiency in chilli fruits fertilizer"], False),
    ],
    "Cotton": [
        ("Plant Protection", 5, ["Maharashtra", "Gujarat", "Telangana"], [
            "Pink bollworm control in cotton", "Cotton leaf reddening cause and solution", "Whitefly infestation in cotton which insecticide",
            "Cotton boll rot management in {s}"], False),
        ("Crop Production", 2, ["Gujarat", "Maharashtra"], [
            "Best BT cotton variety for rainfed area", "Plant spacing for hybrid cotton"], False),
    ],
    "Banana": [
        ("Plant Protection", 4, ["Tamil Nadu", "Maharashtra", "Karnataka"], [
            "Panama wilt in banana any control", "Sigatoka leaf spot banana spray schedule", "Banana bunchy top virus how to manage"], True),
        ("Post Harvest", 2, ["Tamil Nadu", "Maharashtra"], [
            "How to increase shelf life of banana after harvest", "Banana ripening chamber ethylene dose"], False),
    ],
    "Onion": [
        ("Post Harvest", 4, ["Maharashtra", "Gujarat", "Madhya Pradesh"], [
            "Onion storage rotting problem how to prevent", "How to store onion for 6 months", "Sprouting in stored onion remedy"], False),
        ("Plant Protection", 3, ["Maharashtra", "Karnataka"], [
            "Purple blotch in onion control", "Thrips in onion what to spray", "Onion basal rot treatment in {s}"], False),
    ],
    "Sugarcane": [
        ("Crop Production", 3, ["Uttar Pradesh", "Maharashtra", "Karnataka"], [
            "Best sugarcane variety for high sugar recovery", "Sugarcane ratoon management tips", "Spacing and planting method for sugarcane"], False),
        ("Plant Protection", 3, ["Uttar Pradesh", "Maharashtra"], [
            "Red rot in sugarcane what to do", "Early shoot borer sugarcane control", "Woolly aphid sugarcane management"], False),
    ],
    "Soybean": [
        ("Plant Protection", 4, ["Madhya Pradesh", "Maharashtra"], [
            "Yellow mosaic virus in soybean control", "Girdle beetle soybean management", "Stem fly in soybean what insecticide"], False),
    ],
    "Mango": [
        ("Plant Protection", 3, ["Uttar Pradesh", "Andhra Pradesh", "Gujarat"], [
            "Mango hopper control during flowering", "Powdery mildew in mango spray", "Mango fruit fly management"], False),
        ("Crop Production", 2, ["Uttar Pradesh", "Gujarat"], [
            "Mango flowering induction how to do", "Pruning of mango orchards after harvest"], False),
    ],
}


def _mk(rng, now, crop, domain, text, state, district, source, status, days_ago, testing=False):
    return {
        "question": text,
        "status": status,
        "source": source,
        "priority": "medium",
        "totalAnswersCount": 1 if status == "closed" else 0,
        "isAutoAllocate": True,
        "embedding": [],
        "metrics": None,
        "isTesting": testing,
        "details": {"state": state, "district": district, "crop": crop, "season": rng.choice(["Kharif", "Rabi", "Zaid"]), "domain": [domain]},
        "createdAt": now - timedelta(days=days_ago, hours=rng.randint(0, 23), minutes=rng.randint(0, 59)),
        "updatedAt": now,
    }


def generate(now: datetime | None = None, n_days: int = 90, seed: int = 7) -> list[dict]:
    rng = random.Random(seed)
    now = now or datetime.now(timezone.utc)
    docs: list[dict] = []
    for crop, topics in TOPICS.items():
        for domain, weight, biased, templates, hot in topics:
            for tpl in templates:
                n = weight * rng.randint(14, 22)
                for _ in range(n):
                    state = rng.choice(biased) if rng.random() < 0.75 else rng.choice(list(STATES))
                    # "hot" topics accelerate in the last 3 weeks
                    if hot and rng.random() < 0.55:
                        days_ago = rng.uniform(0, 21) ** 1.0 * rng.random() ** 0.6
                    else:
                        days_ago = rng.uniform(0, n_days - 1)
                    # Staple crops are better covered by the GDB; hot/niche topics are not.
                    p_resolved = 0.55 if crop in ("Rice", "Wheat") else 0.12 if hot else 0.28
                    status = "closed" if rng.random() < p_resolved else rng.choice(["open", "in-review", "open", "delayed"])
                    if status == "closed" and days_ago < 2:
                        status = "open"
                    text = tpl.format(s=state) if "{s}" in tpl else tpl
                    if rng.random() < 0.25:
                        text = text.lower().rstrip("?") + " please advise"
                    docs.append(_mk(rng, now, crop, domain, text, state, rng.choice(STATES[state]),
                                    rng.choice(["AJRASAKHA", "WHATSAPP", "WHATSAPP"]), status, days_ago))
            # GDB answers curated by experts (non-chatbot sources) -> coverage strength
            for _ in range(weight * rng.randint(6, 14) * (3 if crop in ("Rice", "Wheat") else 1)):
                state = rng.choice(biased)
                docs.append(_mk(rng, now, crop, domain, rng.choice(templates).format(s=state), state,
                                rng.choice(STATES[state]), rng.choice(["AGRI_EXPERT", "OUTREACH"]), "closed", rng.uniform(5, 200)))
    # noise that must be ignored by the pipeline
    docs.append(_mk(rng, now, "Rice", "Plant Protection", "test question please ignore", "Punjab", "Ludhiana", "AJRASAKHA", "open", 1, testing=True))
    docs.append(_mk(rng, now, "Rice", "Plant Protection", "who won the cricket match", "Punjab", "Ludhiana", "WHATSAPP", "non_agri", 2))
    return docs


def seed_database(db, force: bool = False) -> int:
    col = db[settings.questions_collection]
    if col.estimated_document_count() and not force:
        return 0
    docs = generate()
    col.insert_many(docs)
    return len(docs)
