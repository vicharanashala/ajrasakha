"""
Agricultural Domain Lexicon & Equipment Calibration Standards
Author: Data Science Track (Project 5 - AjraSakha)
Based on CIBRC & ICAR Krishi Vigyan Kendra (KVK) agronomic field standards.
"""

TANKI_CAPACITY_LITERS = 15.0       # Standard manual knapsack sprayer ("15L की टंकी")
WATER_PER_ACRE_LITERS = 150.0      # Standard recommended water volume per acre
STANDARD_TANKS_PER_ACRE = 10       # 150L / 15L = 10 pumps per acre
STANDARD_CAP_ML = 10.0             # Standard chemical bottle cap ("ढक्कन", ~10 ml)
TABLESPOON_GRAMS = 5.0             # Standard household spoon for powders ("चम्मच", ~5 grams)

CHEMICAL_REGISTRY = {
    "chlorantraniliprole": {
        "scientific_name": "Chlorantraniliprole 18.5% SC",
        "hindi_scientific": "क्लोरेंट्रानिलिप्रोल",
        "brand_name_hi": "कोराजन (Coragen)",
        "brand_name_en": "Coragen",
        "form": "LIQUID",
        "default_per_tank_ml": 6.0,
        "target_pests": ["तनाव छेदक (Stem Borer)", "माहू (Aphid)", "फल छेदक (Fruit Borer)"],
        "safety_tip_hi": "छिड़काव के बाद 14 दिन तक फसल न काटें।"
    },
    "imidacloprid": {
        "scientific_name": "Imidacloprid 17.8% SL",
        "hindi_scientific": "इमिडाक्लोप्रिड",
        "brand_name_hi": "कॉन्फिडोर (Confidor)",
        "brand_name_en": "Confidor",
        "form": "LIQUID",
        "default_per_tank_ml": 5.0,
        "target_pests": ["माहू (Aphid)", "तेला / चेपा (Jassid)", "सफेद मक्खी (Whitefly)"],
        "safety_tip_hi": "मधुमक्खियों के समय (सुबह धूप आने से पहले) छिड़काव न करें।"
    },
    "thiamethoxam": {
        "scientific_name": "Thiamethoxam 25% WG",
        "hindi_scientific": "थायमेथॉक्सम",
        "brand_name_hi": "एकतारा (Actara)",
        "brand_name_en": "Actara",
        "form": "POWDER",
        "default_per_tank_grams": 8.0,
        "target_pests": ["भूरा फुदका (BPH)", "माहू (Aphid)", "दीमक (Termite)"],
        "safety_tip_hi": "दवा को पहले 1 मग पानी में घोलें, फिर टंकी में डालें।"
    },
    "carbendazim": {
        "scientific_name": "Carbendazim 50% WP",
        "hindi_scientific": "कार्बेन्डाजिम",
        "brand_name_hi": "बाविस्टिन (Bavistin)",
        "brand_name_en": "Bavistin",
        "form": "POWDER",
        "default_per_tank_grams": 25.0,
        "target_pests": ["शीथ ब्लाइट (Sheath Blight)", "झुलसा (Blast)", "जड़ गलन (Root Rot)"],
        "safety_tip_hi": "फफूंदनाशक दवा है, नमी वाले मौसम में तुरंत असर करती है।"
    },
    "mancozeb": {
        "scientific_name": "Mancozeb 75% WP",
        "hindi_scientific": "मैंकोजेब",
        "brand_name_hi": "डाइथेन एम-45 (Dithane M-45)",
        "brand_name_en": "Dithane M-45",
        "form": "POWDER",
        "default_per_tank_grams": 40.0,
        "target_pests": ["पत्ती धब्बा (Leaf Spot)", "अगेती झुलसा (Early Blight)"],
        "safety_tip_hi": "छिड़काव के समय मुंह पर गमछा या मास्क जरूर बांधें।"
    },
    "emamectin": {
        "scientific_name": "Emamectin Benzoate 5% SG",
        "hindi_scientific": "एमामेक्टिन बेंजोएट",
        "brand_name_hi": "प्रोक्लेम (Proclaim) / मिसाइल",
        "brand_name_en": "Proclaim",
        "form": "POWDER",
        "default_per_tank_grams": 8.0,
        "target_pests": ["सुंडी / इल्ली (Spodoptera / Bollworm)", "फल छेदक (Fruit Borer)"],
        "safety_tip_hi": "इल्लियों (सुंडी) पर यह सबसे असरदार दवा है।"
    },
    "cypermethrin": {
        "scientific_name": "Cypermethrin 10% EC",
        "hindi_scientific": "साइपरमेथ्रिन",
        "brand_name_hi": "उस्ताद (Ustaad) / रिपकार्ड",
        "brand_name_en": "Ustaad",
        "form": "LIQUID",
        "default_per_tank_ml": 20.0,
        "target_pests": ["कपास की इल्ली (Bollworm)", "पत्ती लपेटक (Leaf Folder)"],
        "safety_tip_hi": "दवा तेज गंध वाली है, बच्चों और पशुओं से दूर रखें।"
    },
    "hexaconazole": {
        "scientific_name": "Hexaconazole 5% SC",
        "hindi_scientific": "हेक्साकोनाजोल",
        "brand_name_hi": "कॉन्टाफ प्लस (Contaf Plus)",
        "brand_name_en": "Contaf Plus",
        "form": "LIQUID",
        "default_per_tank_ml": 20.0,
        "target_pests": ["गेरुई / रतुआ (Rust)", "शीथ ब्लाइट (Sheath Blight)", "पाउडरी मिल्ड्यू"],
        "safety_tip_hi": "गेहूँ में पीला रतुआ दिखने पर तुरंत 2 ढक्कन प्रति टंकी छिड़कें।"
    },
    "fipronil": {
        "scientific_name": "Fipronil 5% SC",
        "hindi_scientific": "फिप्रोनिल",
        "brand_name_hi": "रीजेंट (Regent)",
        "brand_name_en": "Regent",
        "form": "LIQUID",
        "default_per_tank_ml": 30.0,
        "target_pests": ["तना छेदक (Stem Borer)", "दीमक (Termite)", "माहू (Thrips)"],
        "safety_tip_hi": "जड़ और पत्ती दोनों कीटों पर काम करती है।"
    },
    "copper_oxychloride": {
        "scientific_name": "Copper Oxychloride 50% WP",
        "hindi_scientific": "कॉपर ऑक्सीक्लोराइड",
        "brand_name_hi": "ब्लाइटॉक्स (Blitox)",
        "brand_name_en": "Blitox",
        "form": "POWDER",
        "default_per_tank_grams": 40.0,
        "target_pests": ["जीवाणु झुलसा (Bacterial Blight)", "आर्द्र गलन (Damping Off)"],
        "safety_tip_hi": "नीले रंग का पाउडर है, पत्तों पर परत बनाकर बीमारी रोकता है।"
    }
}

def convert_ml_to_dhakkan(ml_volume: float) -> str:
    if ml_volume <= 4.0:
        return f"आधा ढक्कन (लगभग {round(ml_volume, 1)} ml)"
    elif 4.0 < ml_volume <= 7.5:
        return f"आधा से 1 ढक्कन (लगभग {round(ml_volume, 1)} ml)"
    elif 7.5 < ml_volume <= 12.5:
        return f"1 पूरा ढक्कन (लगभग {round(ml_volume, 1)} ml)"
    elif 12.5 < ml_volume <= 18.0:
        return f"डेढ़ ढक्कन (लगभग {round(ml_volume, 1)} ml)"
    elif 18.0 < ml_volume <= 25.0:
        return f"2 पूरे ढक्कन (लगभग {round(ml_volume, 1)} ml)"
    else:
        caps = round(ml_volume / STANDARD_CAP_ML, 1)
        return f"{caps} ढक्कन (लगभग {round(ml_volume, 1)} ml)"

def convert_grams_to_chamach(grams: float) -> str:
    if grams <= 3.0:
        return f"आधा चम्मच (लगभग {round(grams, 1)} ग्राम)"
    elif 3.0 < grams <= 7.0:
        return f"1 बड़ा चम्मच (लगभग {round(grams, 1)} ग्राम)"
    elif 7.0 < grams <= 12.0:
        return f"2 बड़े चम्मच (लगभग {round(grams, 1)} ग्राम)"
    elif 12.0 < grams <= 25.0:
        return f"3 से 4 बड़े चम्मच (लगभग {round(grams, 1)} ग्राम)"
    else:
        spoons = round(grams / TABLESPOON_GRAMS, 1)
        return f"लगभग {spoons} चम्मच (या {round(grams, 1)} ग्राम)"
