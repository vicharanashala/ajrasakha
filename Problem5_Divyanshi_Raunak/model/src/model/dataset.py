"""
Benchmark Evaluation Dataset for Agricultural Advisory Simplification
25 Paired Technical vs Simplified Field Scenarios across 8 major Indian crops.
"""

BENCHMARK_DATASET = [
    {
        "id": "BENCH-01",
        "crop": "गेहूँ (Wheat)",
        "technical_text": "Apply 60 ml of Chlorantraniliprole 18.5% SC in 200 liters of water per acre during early heading stage for armyworm control.",
        "expected_chemical": "Chlorantraniliprole",
        "expected_brand": "Coragen"
    },
    {
        "id": "BENCH-02",
        "crop": "गेहूँ (Wheat)",
        "technical_text": "Spray Hexaconazole 5% SC @ 2 ml per liter of water at the first appearance of yellow rust pustules on leaves.",
        "expected_chemical": "Hexaconazole",
        "expected_brand": "Contaf Plus"
    },
    {
        "id": "BENCH-03",
        "crop": "धान (Paddy)",
        "technical_text": "For sheath blight management, apply Carbendazim 50% WP @ 250 grams per acre in 200 liters water.",
        "expected_chemical": "Carbendazim",
        "expected_brand": "Bavistin"
    },
    {
        "id": "BENCH-04",
        "crop": "धान (Paddy)",
        "technical_text": "Dissolve Thiamethoxam 25% WG @ 0.5 g per liter of water to control brown planthopper (BPH) populations.",
        "expected_chemical": "Thiamethoxam",
        "expected_brand": "Actara"
    },
    {
        "id": "BENCH-05",
        "crop": "कपास (Cotton)",
        "technical_text": "Apply Imidacloprid 17.8% SL @ 0.4 ml/L of water to manage severe whitefly infestation on cotton leaves.",
        "expected_chemical": "Imidacloprid",
        "expected_brand": "Confidor"
    },
    {
        "id": "BENCH-06",
        "crop": "कपास (Cotton)",
        "technical_text": "For bollworm suppression, spray Cypermethrin 10% EC @ 200 ml per acre with power sprayer.",
        "expected_chemical": "Cypermethrin",
        "expected_brand": "Ustaad"
    },
    {
        "id": "BENCH-07",
        "crop": "सरसों (Mustard)",
        "technical_text": "At flowering stage, spray Mancozeb 75% WP @ 2 grams per liter to check Alternaria blight infection.",
        "expected_chemical": "Mancozeb",
        "expected_brand": "Dithane M-45"
    },
    {
        "id": "BENCH-08",
        "crop": "सरसों (Mustard)",
        "technical_text": "Apply Thiamethoxam 25% WG @ 80 grams per acre when aphid colony density exceeds 25 insects per twig.",
        "expected_chemical": "Thiamethoxam",
        "expected_brand": "Actara"
    },
    {
        "id": "BENCH-09",
        "crop": "गन्ना (Sugarcane)",
        "technical_text": "Soil drenching with Fipronil 5% SC @ 2 ml per liter against early shoot borer and termite infestation.",
        "expected_chemical": "Fipronil",
        "expected_brand": "Regent"
    },
    {
        "id": "BENCH-10",
        "crop": "टमाटर (Tomato)",
        "technical_text": "Apply Emamectin Benzoate 5% SG @ 0.5 g/L of water at fruit formation stage for fruit borer control.",
        "expected_chemical": "Emamectin",
        "expected_brand": "Proclaim"
    },
    {
        "id": "BENCH-11",
        "crop": "आलू (Potato)",
        "technical_text": "Preventive prophylactic spray of Copper Oxychloride 50% WP @ 2.5 g/L against late blight pathogen.",
        "expected_chemical": "Copper Oxychloride",
        "expected_brand": "Blitox"
    },
    {
        "id": "BENCH-12",
        "crop": "मिर्च (Chilli)",
        "technical_text": "Spray Imidacloprid 17.8% SL @ 50 ml per acre to control thrips causing leaf curling in chilli plants.",
        "expected_chemical": "Imidacloprid",
        "expected_brand": "Confidor"
    }
]
