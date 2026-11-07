"""
Core Agri-Jargon Simplifier Engine
Extracts chemical entities, calculates pump math, and formats village-friendly Hindi.
"""
import re
from typing import Dict, Any, Optional
from .agri_lexicon import (
    CHEMICAL_REGISTRY,
    TANKI_CAPACITY_LITERS,
    STANDARD_TANKS_PER_ACRE,
    convert_ml_to_dhakkan,
    convert_grams_to_chamach
)

class AgriSimplifier:
    def __init__(self):
        self.registry = CHEMICAL_REGISTRY
        # Compile search regex for active ingredients (English and Hindi)
        self.patterns = {}
        for key, data in self.registry.items():
            words = [key, key.replace("_", " "), data["scientific_name"].split()[0].lower(), data["hindi_scientific"]]
            esc = [re.escape(w) for w in words if w]
            self.patterns[key] = re.compile(r"\b(" + "|".join(esc) + r")\b", re.IGNORECASE)

    def detect_chemical(self, text: str) -> Optional[Dict[str, Any]]:
        text_lower = text.lower()
        for key, pattern in self.patterns.items():
            if pattern.search(text_lower):
                matched = dict(self.registry[key])
                matched["key"] = key
                return matched
        return None

    def extract_numerical_dosage(self, text: str, chem_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Parses concentration (e.g. 0.5 ml/L, 2g/L) or total dosage (e.g. 60 ml per acre).
        Calculates exact per-tanki dose.
        """
        # Case 1: X ml/L or X g/L (per liter concentration)
        per_liter_match = re.search(r"(\d+\.?\d*)\s*(ml|g|gm|ग्राम|मिली)\s*(?:per|/|प्रति)?\s*(?:liter|litre|लीटर)", text, re.IGNORECASE)
        if per_liter_match:
            amount = float(per_liter_match.group(1))
            unit = per_liter_match.group(2).lower()
            dose_per_tank = amount * TANKI_CAPACITY_LITERS
            return {
                "calculation_mode": "PER_LITER_CONCENTRATION",
                "extracted_rate": f"{amount} {unit}/L",
                "calculated_dose_per_tank": dose_per_tank,
                "form": "LIQUID" if "ml" in unit or "मिली" in unit else "POWDER"
            }

        # Case 2: X ml/acre or X g/acre (per acre rate)
        per_acre_match = re.search(r"(\d+\.?\d*)\s*(ml|g|gm|ग्राम|मिली)\s*(?:per|/|प्रति)?\s*(?:acre|एकड़)", text, re.IGNORECASE)
        if per_acre_match:
            amount = float(per_acre_match.group(1))
            unit = per_acre_match.group(2).lower()
            dose_per_tank = amount / STANDARD_TANKS_PER_ACRE
            return {
                "calculation_mode": "PER_ACRE_TOTAL",
                "extracted_rate": f"{amount} {unit}/acre",
                "calculated_dose_per_tank": dose_per_tank,
                "form": "LIQUID" if "ml" in unit or "मिली" in unit else "POWDER"
            }

        # Default: Fallback to registered manufacturer field dose
        form = chem_data.get("form", "LIQUID")
        dose_per_tank = chem_data.get("default_per_tank_ml") if form == "LIQUID" else chem_data.get("default_per_tank_grams", 20.0)
        return {
            "calculation_mode": "REGISTRY_DEFAULT",
            "extracted_rate": "Standard KVK recommendation",
            "calculated_dose_per_tank": dose_per_tank,
            "form": form
        }

    def simplify(self, text: str, crop_name: str = "फसल") -> Dict[str, Any]:
        """
        Main simplification pipeline:
        Input: Scientific technical recommendation
        Output: Structured village-level Hindi advisory
        """
        chem = self.detect_chemical(text)
        if not chem:
            # If no chemical salt detected, return original with readability note
            return {
                "simplified_text": text,
                "is_simplified": False,
                "reason": "No technical chemical salt identified."
            }

        dosage_info = self.extract_numerical_dosage(text, chem)
        form = dosage_info["form"]
        dose_val = dosage_info["calculated_dose_per_tank"]

        # Human-friendly physical measurement
        if form == "LIQUID":
            practical_measurement = convert_ml_to_dhakkan(dose_val)
        else:
            practical_measurement = convert_grams_to_chamach(dose_val)

        brand = chem["brand_name_hi"]
        safety = chem.get("safety_tip_hi", "सावधानीपूर्वक छिड़काव करें।")

        # Assemble clean, 3-step actionable Hindi
        lines = [
            f"🌾 *{crop_name} के लिए सरल सलाह:*",
            "",
            f"1️⃣ *दवा का नाम:* **{brand}**",
            "   (यह किसी भी खाद-बीज की दुकान पर आसानी से मिल जाएगी।)",
            "",
            "2️⃣ *टंकी में नाप (खुराक):*",
            f"   अपनी **15 लीटर वाली स्प्रे टंकी** में **{practical_measurement}** दवा मिलाएं।",
            "",
            "3️⃣ *छिड़काव का सही तरीका:*",
            "   एक एकड़ खेत के लिए लगभग **10 टंकी** पानी लगेगा। तेज धूप में छिड़काव न करें; सुबह या शाम को छिड़कें।",
            "",
            f"💡 *जरूरी सावधानी:* {safety}"
        ]
        simplified_hindi = "\n".join(lines)

        return {
            "original_text": text,
            "simplified_text": simplified_hindi,
            "is_simplified": True,
            "detected_chemical": chem["scientific_name"],
            "recommended_brand": chem["brand_name_en"],
            "practical_unit": practical_measurement,
            "spray_pumps_per_acre": STANDARD_TANKS_PER_ACRE,
            "calculation_details": dosage_info
        }
