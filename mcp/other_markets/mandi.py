MANDI_MAPPING = {
    "azadpur": "4",
    "bagh diwar": "9",
    "gazipur": "2",
    "keshopur": "1",
    "mehrauli": "8",
    "najafgarh": "6",
    "narela": "5",
    "shahdara": "7",
    "tikrikalan": "3"
}
def normalizetext(text: str) -> str:
    return text.lower().strip().replace("-", " ").replace("", " ")
def get_mandi_code(name: str) -> str:
    normalized = normalize_text(name)

    for key, value in MANDI_MAPPING.items():
        if normalized == key or normalized in key or key in normalized:
            return value

    raise ValueError(f"Unknown mandi name: {name}")