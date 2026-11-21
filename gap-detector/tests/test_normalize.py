from backend.app.normalize import (
    extract_crop,
    farmer_key,
    normalize_crop,
    normalize_domain,
    normalize_language,
    normalize_state,
    normalize_text,
    parse_datetime,
)


def test_language_names_and_codes():
    assert normalize_language("Hindi") == ("Hindi", "hi")
    assert normalize_language("hi") == ("Hindi", "hi")
    assert normalize_language("KANNADA") == ("Kannada", "kn")
    assert normalize_language("ml") == ("Malayalam", "ml")
    assert normalize_language("oriya") == ("Odia", "or")
    assert normalize_language("") == (None, None)
    assert normalize_language(None) == (None, None)
    assert normalize_language("Klingon") == ("Klingon", None)


def test_state_cleanup():
    assert normalize_state("Maharashtra") == "Maharashtra"
    assert normalize_state("tamilnadu") == "Tamil Nadu"
    assert normalize_state("UP") == "Uttar Pradesh"
    assert normalize_state("Telegram") is None  # channel stored as a state
    assert normalize_state("Unknown") is None
    assert normalize_state("") is None
    assert normalize_state("Atlantis") is None


def test_domain_taxonomies_collapse():
    assert normalize_domain("Pest Control") == "Pest Control"
    assert normalize_domain("Pest") == "Pest Control"  # gdb_gap_detector
    assert normalize_domain("Plant Protection") == "Pest Control"  # reviewer
    assert normalize_domain("Disease") == "Crop Disease"
    assert normalize_domain("Fertilizer") == "Fertilizers"
    assert normalize_domain("Nutrient Management") == "Fertilizers"
    # Off-topic is its own canonical domain so the gap report can exclude it
    assert normalize_domain("Off-topic") == "Off-topic"
    assert normalize_domain("Chat") == "Off-topic"
    assert normalize_domain(["Cultural Practices", "Plant Protection"]) == "General Agriculture"
    assert normalize_domain("Post harvest technology") == "Harvesting"  # keyword fallback
    assert normalize_domain(None) is None


def test_crop_extraction():
    assert extract_crop("Yellow rust on my wheat leaves") == "Wheat"
    assert extract_crop("Pink bollworm attack in cotton") == "Cotton"
    assert extract_crop("Should I sow bottle gourd or cucumber first?") == "Bottle Gourd"
    assert extract_crop("gehu me peela rog") == "Wheat"
    assert extract_crop("How to make money fast") is None
    assert extract_crop("") is None
    assert normalize_crop("Tomato") == "Tomato"
    assert normalize_crop("dhan") == "Rice"
    assert normalize_crop("Unknown") is None
    assert normalize_crop("Dragon Fruit") == "Dragon Fruit"


def test_text_and_datetime_helpers():
    assert normalize_text("  Hello,   World!! ") == "hello world"
    assert parse_datetime("2026-08-01T10:00:00Z").isoformat() == "2026-08-01T10:00:00"
    assert parse_datetime("not a date") is None
    assert parse_datetime(None) is None


def test_farmer_key_is_hashed_and_stable():
    k1 = farmer_key("9100000001")
    k2 = farmer_key("9100000001")
    assert k1 == k2 and len(k1) == 16 and "9100" not in k1
    assert farmer_key("9100000002") != k1
    assert farmer_key(None) is None
    assert farmer_key("  ") is None
