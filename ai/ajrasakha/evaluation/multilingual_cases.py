"""Multilingual evaluation cases for AjraSakha.

The project brief asks for 30 core farming scenarios across at least six
languages. This file keeps the canonical scenario in one place and expands it
into runnable cases for the existing evaluation runner.

Translations should be validated by the agriculture/language team before a
live baseline is treated as official. The current set is intentionally
structured so the test framework can run before staging credentials exist.
"""

from __future__ import annotations


LANGUAGES = {
    "en": {"name": "English", "script": "Latin"},
    "hi": {"name": "Hindi", "script": "Devanagari"},
    "kn": {"name": "Kannada", "script": "Kannada"},
    "ta": {"name": "Tamil", "script": "Tamil"},
    "pa": {"name": "Punjabi", "script": "Gurmukhi"},
    "te": {"name": "Telugu", "script": "Telugu"},
}


DISCLAIMER_TERMS = {
    "en": "expert",
    "hi": "विशेषज्ञ",
    "kn": "ತಜ್ಞ",
    "ta": "நிபுணர்",
    "pa": "ਮਾਹਰ",
    "te": "నిపుణుడు",
}

MOCK_ANSWER_TEXT = {
    "en": "This is a mock answer for evaluation.",
    "hi": "यह मूल्यांकन के लिए नमूना उत्तर है।",
    "kn": "ಇದು ಮೌಲ್ಯಮಾಪನಕ್ಕಾಗಿ ಮಾದರಿ ಉತ್ತರವಾಗಿದೆ.",
    "ta": "இது மதிப்பீட்டிற்கான மாதிரி பதில்.",
    "pa": "ਇਹ ਮੁਲਾਂਕਣ ਲਈ ਨਮੂਨਾ ਜਵਾਬ ਹੈ।",
    "te": "ఇది మూల్యాంకనం కోసం నమూనా సమాధానం.",
}


def _translations(en: str, hi: str, kn: str, ta: str, pa: str, te: str) -> dict[str, str]:
    return {
        "en": en,
        "hi": hi,
        "kn": kn,
        "ta": ta,
        "pa": pa,
        "te": te,
    }


CORE_SCENARIOS = [
    {
        "scenario_id": "weather_rain_ludhiana",
        "domain": "weather",
        "location": {"city": "Ludhiana", "state": "Punjab"},
        "expected_tools": ["upload_question_to_reviewer_system", "weather"],
        "expected_gdb_entry_id": "",
        "expected_terms": ["Ludhiana"],
        "translations": _translations(
            "Will it rain in Ludhiana today?",
            "क्या आज लुधियाना में बारिश होगी?",
            "ಇಂದು ಲುಧಿಯಾನಾದಲ್ಲಿ ಮಳೆ ಬರುತ್ತದೆಯೇ?",
            "இன்று லூதியானாவில் மழை பெய்யுமா?",
            "ਕੀ ਅੱਜ ਲੁਧਿਆਣਾ ਵਿੱਚ ਮੀਂਹ ਪਵੇਗਾ?",
            "ఈ రోజు లుధియానాలో వర్షం పడుతుందా?",
        ),
    },
    {
        "scenario_id": "weather_forecast_delhi",
        "domain": "weather",
        "location": {"city": "Delhi", "state": "Delhi"},
        "expected_tools": ["upload_question_to_reviewer_system", "weather"],
        "expected_gdb_entry_id": "",
        "expected_terms": ["Delhi"],
        "translations": _translations(
            "What is the weather forecast for Delhi for the next few days?",
            "अगले कुछ दिनों के लिए दिल्ली का मौसम पूर्वानुमान क्या है?",
            "ಮುಂದಿನ ಕೆಲವು ದಿನಗಳಿಗೆ ದೆಹಲಿಯ ಹವಾಮಾನ ಮುನ್ಸೂಚನೆ ಏನು?",
            "அடுத்த சில நாட்களுக்கு டெல்லியின் வானிலை முன்னறிவிப்பு என்ன?",
            "ਅਗਲੇ ਕੁਝ ਦਿਨਾਂ ਲਈ ਦਿੱਲੀ ਦਾ ਮੌਸਮ ਅਨੁਮਾਨ ਕੀ ਹੈ?",
            "రాబోయే కొన్ని రోజుల ఢిల్లీ వాతావరణ సూచన ఏమిటి?",
        ),
    },
    {
        "scenario_id": "market_wheat_sirsa",
        "domain": "market",
        "location": {"city": "Sirsa", "state": "Haryana"},
        "expected_tools": ["upload_question_to_reviewer_system", "market"],
        "expected_gdb_entry_id": "",
        "expected_terms": ["wheat", "Sirsa"],
        "translations": _translations(
            "What is the price of wheat in Sirsa mandi, Haryana?",
            "हरियाणा की सिरसा मंडी में गेहूं का भाव क्या है?",
            "ಹರಿಯಾಣದ ಸಿರ್ಸಾ ಮಾರುಕಟ್ಟೆಯಲ್ಲಿ ಗೋಧಿಯ ಬೆಲೆ ಎಷ್ಟು?",
            "ஹரியானாவின் சிர்சா சந்தையில் கோதுமை விலை என்ன?",
            "ਹਰਿਆਣਾ ਦੀ ਸਿਰਸਾ ਮੰਡੀ ਵਿੱਚ ਗੈਂਹੂਂ ਦਾ ਭਾਅ ਕੀ ਹੈ?",
            "హర్యానాలోని సిర్సా మార్కెట్‌లో గోధుమ ధర ఎంత?",
        ),
    },
    {
        "scenario_id": "market_paddy_mandya",
        "domain": "market",
        "location": {"city": "Mandya", "state": "Karnataka"},
        "expected_tools": ["upload_question_to_reviewer_system", "market"],
        "expected_gdb_entry_id": "",
        "expected_terms": ["paddy", "Mandya"],
        "translations": _translations(
            "What is the price of paddy in Mandya mandi?",
            "मांड्या मंडी में धान का भाव क्या है?",
            "ಮಂಡ್ಯ ಮಾರುಕಟ್ಟೆಯಲ್ಲಿ ಭತ್ತದ ಬೆಲೆ ಎಷ್ಟು?",
            "மண்ட்யா சந்தையில் நெல் விலை என்ன?",
            "ਮਾਂਡਿਆ ਮੰਡੀ ਵਿੱਚ ਝੋਨੇ ਦਾ ਭਾਅ ਕੀ ਹੈ?",
            "మండ్య మార్కెట్‌లో వరి ధర ఎంత?",
        ),
    },
    {
        "scenario_id": "soil_rice_fertilizer",
        "domain": "soil",
        "location": {"city": "Ropar", "state": "Punjab"},
        "expected_tools": ["upload_question_to_reviewer_system", "gdb"],
        "expected_gdb_entry_id": "soil_rice_fertilizer",
        "expected_terms": ["rice", "nitrogen", "phosphorus", "potassium"],
        "translations": _translations(
            "My soil test shows nitrogen 120, phosphorus 40, potassium 30 and OC 0.5%. What fertilizer dose should I use for rice?",
            "मेरी मिट्टी जांच में नाइट्रोजन 120, फॉस्फोरस 40, पोटाश 30 और OC 0.5% है। धान के लिए कौन सी खाद मात्रा दूं?",
            "ನನ್ನ ಮಣ್ಣಿನ ಪರೀಕ್ಷೆಯಲ್ಲಿ ನೈಟ್ರೋಜನ್ 120, ಫಾಸ್ಫರಸ್ 40, ಪೊಟಾಶಿಯಂ 30 ಮತ್ತು OC 0.5% ಇದೆ. ಅಕ್ಕಿಗೆ ಯಾವ ಗೊಬ್ಬರ ಪ್ರಮಾಣ ಬಳಸಬೇಕು?",
            "என் மண் பரிசோதனையில் நைட்ரஜன் 120, பாஸ்பரஸ் 40, பொட்டாசியம் 30 மற்றும் OC 0.5% உள்ளது. நெற்கான உர அளவு என்ன?",
            "ਮੇਰੀ ਮਿੱਟੀ ਜਾਂਚ ਵਿੱਚ ਨਾਈਟ੍ਰੋਜਨ 120, ਫਾਸਫੋਰਸ 40, ਪੋਟਾਸ਼ 30 ਅਤੇ OC 0.5% ਹੈ। ਝੋਨੇ ਲਈ ਕਿੰਨੀ ਖਾਦ ਪਾਵਾਂ?",
            "నా మట్టి పరీక్షలో నైట్రోజన్ 120, ఫాస్ఫరస్ 40, పొటాషియం 30 మరియు OC 0.5% ఉంది. వరికి ఎంత ఎరువు వేయాలి?",
        ),
    },
    {
        "scenario_id": "soil_wheat_low_nitrogen",
        "domain": "soil",
        "location": {"city": "Karnal", "state": "Haryana"},
        "expected_tools": ["upload_question_to_reviewer_system", "gdb"],
        "expected_gdb_entry_id": "soil_wheat_low_nitrogen",
        "expected_terms": ["wheat", "nitrogen"],
        "translations": _translations(
            "My wheat field has low nitrogen in the soil test. What should I apply?",
            "मेरे गेहूं के खेत की मिट्टी जांच में नाइट्रोजन कम है। मुझे क्या डालना चाहिए?",
            "ನನ್ನ ಗೋಧಿ ಹೊಲದ ಮಣ್ಣಿನ ಪರೀಕ್ಷೆಯಲ್ಲಿ ನೈಟ್ರೋಜನ್ ಕಡಿಮೆ ಇದೆ. ನಾನು ಏನು ಹಾಕಬೇಕು?",
            "என் கோதுமை வயல் மண் பரிசோதனையில் நைட்ரஜன் குறைவாக உள்ளது. என்ன இட வேண்டும்?",
            "ਮੇਰੇ ਗੈਂਹੂਂ ਦੇ ਖੇਤ ਦੀ ਮਿੱਟੀ ਜਾਂਚ ਵਿੱਚ ਨਾਈਟ੍ਰੋਜਨ ਘੱਟ ਹੈ। ਮੈਂ ਕੀ ਪਾਵਾਂ?",
            "నా గోధుమ పొలం మట్టి పరీక్షలో నైట్రోజన్ తక్కువగా ఉంది. నేను ఏమి వేయాలి?",
        ),
    },
    {
        "scenario_id": "pest_wheat_yellow_rust",
        "domain": "pest",
        "location": {"city": "Ludhiana", "state": "Punjab"},
        "expected_tools": ["upload_question_to_reviewer_system", "gdb"],
        "expected_gdb_entry_id": "wheat_yellow_rust",
        "expected_terms": ["wheat", "yellow rust"],
        "translations": _translations(
            "What should I do for yellow rust in wheat?",
            "गेहूं में पीला रतुआ हो तो क्या करना चाहिए?",
            "ಗೋಧಿಯಲ್ಲಿ ಯೆಲ್ಲೋ ರಸ್ಟ್ ಬಂದರೆ ಏನು ಮಾಡಬೇಕು?",
            "கோதுமையில் மஞ்சள் துரு நோய் வந்தால் என்ன செய்ய வேண்டும்?",
            "ਗੈਂਹੂਂ ਵਿੱਚ ਪੀਲਾ ਰੱਤਾ ਆਵੇ ਤਾਂ ਕੀ ਕਰਨਾ ਚਾਹੀਦਾ ਹੈ?",
            "గోధుమలో పసుపు తుప్పు వస్తే ఏమి చేయాలి?",
        ),
    },
    {
        "scenario_id": "pest_cotton_bollworm",
        "domain": "pest",
        "location": {"city": "Nagpur", "state": "Maharashtra"},
        "expected_tools": ["upload_question_to_reviewer_system", "gdb"],
        "expected_gdb_entry_id": "cotton_bollworm",
        "expected_terms": ["cotton", "bollworm"],
        "translations": _translations(
            "How can I control bollworm in cotton?",
            "कपास में बॉलवर्म को कैसे नियंत्रित करूं?",
            "ಹತ್ತಿಯಲ್ಲಿ ಬೋಲ್‌ವರ್ಮ್ ಅನ್ನು ಹೇಗೆ ನಿಯಂತ್ರಿಸಬೇಕು?",
            "பருத்தியில் பால் வார்மை எப்படி கட்டுப்படுத்துவது?",
            "ਕਪਾਹ ਵਿੱਚ ਬੋਲਵਰਮ ਨੂੰ ਕਿਵੇਂ ਕਾਬੂ ਕਰੀਏ?",
            "పత్తిలో బోల్‌వార్మ్‌ను ఎలా నియంత్రించాలి?",
        ),
    },
    {
        "scenario_id": "scheme_drip_irrigation",
        "domain": "scheme",
        "location": {"city": "Jaipur", "state": "Rajasthan"},
        "expected_tools": ["upload_question_to_reviewer_system", "schemes"],
        "expected_gdb_entry_id": "",
        "expected_terms": ["drip irrigation", "subsidy"],
        "translations": _translations(
            "How can I get a subsidy for drip irrigation?",
            "ड्रिप सिंचाई के लिए सब्सिडी कैसे मिल सकती है?",
            "ಡ್ರಿಪ್ ನೀರಾವರಿಗೆ ಸಹಾಯಧನವನ್ನು ಹೇಗೆ ಪಡೆಯಬಹುದು?",
            "டிரிப் பாசனத்திற்கு மானியம் எப்படி பெறலாம்?",
            "ਡ੍ਰਿਪ ਸਿੰਚਾਈ ਲਈ ਸਬਸਿਡੀ ਕਿਵੇਂ ਮਿਲ ਸਕਦੀ ਹੈ?",
            "డ్రిప్ సాగునీటి కోసం సబ్సిడీ ఎలా పొందగలను?",
        ),
    },
    {
        "scenario_id": "scheme_pm_kisan",
        "domain": "scheme",
        "location": {"city": "Patiala", "state": "Punjab"},
        "expected_tools": ["upload_question_to_reviewer_system", "schemes"],
        "expected_gdb_entry_id": "",
        "expected_terms": ["PM-KISAN"],
        "translations": _translations(
            "Am I eligible for PM-KISAN benefits?",
            "क्या मैं पीएम-किसान लाभ के लिए पात्र हूं?",
            "ನಾನು PM-KISAN ಪ್ರಯೋಜನಗಳಿಗೆ ಅರ್ಹನೇ?",
            "நான் PM-KISAN நலன்களுக்கு தகுதியானவரா?",
            "ਕੀ ਮੈਂ PM-KISAN ਲਾਭ ਲਈ ਯੋਗ ਹਾਂ?",
            "నేను PM-KISAN ప్రయోజనాలకు అర్హుడినా?",
        ),
    },
    {
        "scenario_id": "gdb_paddy_cultivation_punjab",
        "domain": "gdb",
        "location": {"city": "Ropar", "state": "Punjab"},
        "expected_tools": ["upload_question_to_reviewer_system", "gdb"],
        "expected_gdb_entry_id": "paddy_cultivation_punjab",
        "expected_terms": ["paddy", "Punjab"],
        "translations": _translations(
            "How should I grow paddy in Punjab?",
            "पंजाब में धान की खेती कैसे करूं?",
            "ಪಂಜಾಬ್‌ನಲ್ಲಿ ಭತ್ತವನ್ನು ಹೇಗೆ ಬೆಳೆಸಬೇಕು?",
            "பஞ்சாபில் நெல் சாகுபடி எப்படி செய்ய வேண்டும்?",
            "ਪੰਜਾਬ ਵਿੱਚ ਝੋਨੇ ਦੀ ਖੇਤੀ ਕਿਵੇਂ ਕਰੀਏ?",
            "పంజాబ్‌లో వరి ఎలా పండించాలి?",
        ),
    },
    {
        "scenario_id": "gdb_tomato_leaf_curl",
        "domain": "pest",
        "location": {"city": "Nashik", "state": "Maharashtra"},
        "expected_tools": ["upload_question_to_reviewer_system", "gdb"],
        "expected_gdb_entry_id": "tomato_leaf_curl",
        "expected_terms": ["tomato", "leaf curl"],
        "translations": _translations(
            "What should I do for leaf curl in tomato?",
            "टमाटर में लीफ कर्ल हो तो क्या करना चाहिए?",
            "ಟೊಮೇಟೊದಲ್ಲಿ ಲೀಫ್ ಕರ್‌ಲ್ ಬಂದರೆ ಏನು ಮಾಡಬೇಕು?",
            "தக்காளியில் இலை சுருட்டல் வந்தால் என்ன செய்ய வேண்டும்?",
            "ਟਮਾਟਰ ਵਿੱਚ ਪੱਤਾ ਮੁਰਝਾਉਣ ਦੀ ਬਿਮਾਰੀ ਹੋਵੇ ਤਾਂ ਕੀ ਕਰੀਏ?",
            "టమాటాలో ఆకు ముడుచుకుపోవడం వస్తే ఏమి చేయాలి?",
        ),
    },
]

for scenario in CORE_SCENARIOS:
    scenario["source_scenario_id"] = scenario["scenario_id"]
    scenario["is_fixture"] = False
    scenario["translation_status"] = "draft_needs_agri_validation"


# Expand to the requested 30 scenario slots without inventing unvalidated
# translations. The repeated scenario ids are suffixed, making it obvious that
# these are framework fixtures until the agri team replaces them with the final
# validated set.
while len(CORE_SCENARIOS) < 30:
    source_seed = CORE_SCENARIOS[len(CORE_SCENARIOS) % 12]
    source = source_seed.copy()
    source["scenario_id"] = f"{source['scenario_id']}_fixture_{len(CORE_SCENARIOS) + 1}"
    source["source_scenario_id"] = source_seed["source_scenario_id"]
    source["is_fixture"] = True
    source["translation_status"] = "fixture_replace_with_agri_validated_scenario"
    CORE_SCENARIOS.append(source)


def _mock_response_for(language_code: str, scenario: dict) -> str:
    disclaimer_term = DISCLAIMER_TERMS[language_code]
    query = scenario["translations"][language_code]
    answer = MOCK_ANSWER_TEXT[language_code]
    return f"{query}\n{disclaimer_term}: {answer}"


def build_multilingual_cases() -> list[dict]:
    cases: list[dict] = []

    for scenario in CORE_SCENARIOS:
        for language_code, language_meta in LANGUAGES.items():
            query = scenario["translations"][language_code]
            cases.append(
                {
                    "name": f"{scenario['scenario_id']}_{language_code}",
                    "scenario_id": scenario["scenario_id"],
                    "query": query,
                    "language_code": language_code,
                    "language": language_meta["name"],
                    "expected_language": language_meta["name"],
                    "expected_script": language_meta["script"],
                    "domain": scenario["domain"],
                    "expected_domain": scenario["domain"],
                    "location": scenario.get("location"),
                    "expected_tools": scenario.get("expected_tools", []),
                    "expected_gdb_entry_id": scenario.get("expected_gdb_entry_id", ""),
                    "expected_terms": scenario.get("expected_terms", []),
                    "source_scenario_id": scenario.get("source_scenario_id", scenario["scenario_id"]),
                    "is_fixture": scenario.get("is_fixture", False),
                    "translation_status": scenario.get("translation_status", ""),
                    "expect_2hr_disclaimer": True,
                    "expected_disclaimer_marker": DISCLAIMER_TERMS[language_code],
                    "mock_response_text": _mock_response_for(language_code, scenario),
                    "mock_retrieved_gdb_entry_id": scenario.get("expected_gdb_entry_id", ""),
                    "stable": False,
                }
            )

    return cases


MULTILINGUAL_TEST_CASES = build_multilingual_cases()
