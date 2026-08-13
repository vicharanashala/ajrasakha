"""
Simulates 12 weeks of disclaimer-triggered queries from ACE (the farmer-facing
advisory assistant). In production this data is written by ACE directly into
MongoDB's `disclaimer_queries` collection at the moment the 2-hour disclaimer
is shown. Here we synthesize a realistic dataset so the rest of the pipeline
(clustering, gap detection, reporting, dashboard) can be built and demoed
end-to-end.
"""
import random
import json
from datetime import datetime, timedelta

random.seed(42)

STATES = ["Rajasthan", "Punjab", "Uttar Pradesh", "Madhya Pradesh", "Maharashtra",
          "Gujarat", "Haryana", "Bihar", "Karnataka", "Andhra Pradesh"]

CROPS = ["Wheat", "Mustard", "Cotton", "Soybean", "Paddy", "Sugarcane",
         "Bajra", "Chana", "Groundnut", "Maize", "Tur (Arhar)", "Onion"]

DOMAINS = ["Pest Management", "Disease Diagnosis", "Nutrient/Fertilizer",
           "Irrigation/Water", "Weather Impact", "Market Price",
           "Govt Scheme", "Soil Health", "Seed/Variety", "Post-Harvest"]

INTENTS = ["Diagnosis (what is this)", "Treatment (how to fix)",
           "Preventive advice", "Price/Market query", "Scheme eligibility",
           "Product recommendation"]

QUESTION_TEMPLATES = {
    "Pest Management": [
        "My {crop} leaves have small holes, which pest is this and what spray should I use in {state}?",
        "Pink bollworm seen in {crop} field in {state}, what should I do?",
        "White fly attack on {crop} in {state}, organic treatment available?",
    ],
    "Disease Diagnosis": [
        "Yellow rust appearing on {crop} in {state}, is this dangerous and how to control it?",
        "{crop} plants wilting suddenly in {state}, what disease is this?",
        "Black spots on {crop} leaves in {state}, please identify the disease.",
    ],
    "Nutrient/Fertilizer": [
        "What is the correct DAP dose for {crop} this season in {state}?",
        "{crop} leaves turning yellow, is this nitrogen deficiency in {state}?",
        "Best micronutrient mix for {crop} in {state} soil?",
    ],
    "Irrigation/Water": [
        "How many irrigations needed for {crop} in {state} this season?",
        "Drip irrigation schedule for {crop} in {state}?",
        "Water is scarce this year, minimum irrigation plan for {crop} in {state}?",
    ],
    "Weather Impact": [
        "Unseasonal rain damaged {crop} in {state}, what should I do now?",
        "Heatwave effect on {crop} flowering in {state}, any protection measure?",
        "Frost warning issued in {state}, how to protect {crop}?",
    ],
    "Market Price": [
        "What is today's mandi price for {crop} in {state}?",
        "Should I sell {crop} now or wait, prices in {state} are falling?",
        "Which mandi gives best rate for {crop} near {state}?",
    ],
    "Govt Scheme": [
        "Am I eligible for PM-Kisan benefit for {crop} farming in {state}?",
        "How to apply for crop insurance for {crop} in {state}?",
        "Subsidy available for {crop} seeds in {state}?",
    ],
    "Soil Health": [
        "My soil health card shows low organic carbon, what to do for {crop} in {state}?",
        "Soil is becoming saline in {state}, can I still grow {crop}?",
        "How to improve soil structure for {crop} cultivation in {state}?",
    ],
    "Seed/Variety": [
        "Which {crop} variety is best for {state} climate this season?",
        "Is there a drought-resistant {crop} variety suitable for {state}?",
        "Where to get certified {crop} seeds in {state}?",
    ],
    "Post-Harvest": [
        "How to store {crop} safely to avoid fungus in {state} humidity?",
        "{crop} grains showing weevils after storage in {state}, what to do?",
        "Best packaging for {crop} before selling in {state}?",
    ],
}

# Deliberately engineered "gap clusters" so the pipeline has real signal to find.
# Each entry: (crop, domain, state, weekly_volume_curve over 12 weeks)
ENGINEERED_GAPS = [
    # Fast-growing: pink bollworm resurgence in cotton belt (Punjab)
    dict(crop="Cotton", domain="Pest Management", state="Punjab",
         curve=[3, 4, 3, 5, 6, 8, 11, 15, 22, 31, 40, 52]),
    # Fast-growing: new soybean pest/disease in Maharashtra
    dict(crop="Soybean", domain="Disease Diagnosis", state="Maharashtra",
         curve=[2, 3, 2, 4, 5, 7, 9, 14, 19, 27, 33, 41]),
    # High-volume, steady: wheat yellow rust in Rajasthan (chronic gap)
    dict(crop="Wheat", domain="Disease Diagnosis", state="Rajasthan",
         curve=[28, 30, 27, 33, 29, 31, 35, 30, 32, 34, 31, 33]),
    # High-volume, steady: PM-Kisan/scheme confusion nationwide proxy (UP)
    dict(crop="Chana", domain="Govt Scheme", state="Uttar Pradesh",
         curve=[20, 22, 19, 24, 21, 25, 23, 26, 24, 27, 25, 28]),
    # High-volume: mustard nutrient deficiency, Rajasthan (largest mustard state)
    dict(crop="Mustard", domain="Nutrient/Fertilizer", state="Rajasthan",
         curve=[18, 20, 17, 19, 22, 20, 24, 21, 23, 25, 22, 26]),
    # Fast-growing: heatwave stress on onion in Maharashtra (climate-driven, recent spike)
    dict(crop="Onion", domain="Weather Impact", state="Maharashtra",
         curve=[1, 2, 1, 3, 2, 4, 6, 10, 15, 21, 28, 36]),
    # Moderate, growing slowly: sugarcane post-harvest storage UP
    dict(crop="Sugarcane", domain="Post-Harvest", state="Uttar Pradesh",
         curve=[5, 6, 5, 7, 6, 8, 9, 8, 10, 11, 10, 12]),
    # Flat/low: groundnut soil health Gujarat (not a priority gap)
    dict(crop="Groundnut", domain="Soil Health", state="Gujarat",
         curve=[4, 3, 5, 4, 3, 4, 5, 4, 3, 4, 5, 4]),
]

def week_start_dates(n_weeks=12, end_date=None):
    end_date = end_date or datetime(2026, 7, 19)  # most recent Sunday before "today"
    starts = []
    for i in range(n_weeks):
        starts.append(end_date - timedelta(weeks=(n_weeks - 1 - i)))
    return starts

def gen_question(domain, crop, state):
    tmpl = random.choice(QUESTION_TEMPLATES[domain])
    return tmpl.format(crop=crop, state=state)

def build_dataset():
    weeks = week_start_dates()
    records = []
    rid = 1

    # 1) Engineered signal clusters
    for gap in ENGINEERED_GAPS:
        for w_idx, count in enumerate(gap["curve"]):
            week_date = weeks[w_idx]
            for _ in range(count):
                ts = week_date + timedelta(days=random.randint(0, 6),
                                            hours=random.randint(6, 20))
                intent = random.choice(INTENTS)
                records.append({
                    "id": f"Q{rid:05d}",
                    "timestamp": ts.isoformat(),
                    "week_start": week_date.date().isoformat(),
                    "crop": gap["crop"],
                    "domain": gap["domain"],
                    "state": gap["state"],
                    "intent": intent,
                    "question_text": gen_question(gap["domain"], gap["crop"], gap["state"]),
                })
                rid += 1

    # 2) Background noise: random low-frequency queries across all combos
    for week_date in weeks:
        n_noise = random.randint(35, 55)
        for _ in range(n_noise):
            crop = random.choice(CROPS)
            domain = random.choice(DOMAINS)
            state = random.choice(STATES)
            intent = random.choice(INTENTS)
            ts = week_date + timedelta(days=random.randint(0, 6), hours=random.randint(6, 20))
            records.append({
                "id": f"Q{rid:05d}",
                "timestamp": ts.isoformat(),
                "week_start": week_date.date().isoformat(),
                "crop": crop,
                "domain": domain,
                "state": state,
                "intent": intent,
                "question_text": gen_question(domain, crop, state),
            })
            rid += 1

    random.shuffle(records)
    return records

if __name__ == "__main__":
    data = build_dataset()
    with open("disclaimer_queries.json", "w") as f:
        json.dump(data, f, indent=2)
    print(f"Generated {len(data)} disclaimer-triggered query records across 12 weeks.")
