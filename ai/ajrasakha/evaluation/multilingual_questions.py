from copy import deepcopy

from ajrasakha.evaluation.questions import TEST_CASES


def create_multilingual_case(base_case: dict, language: str, translated_query: str) -> dict:
    """
    Create a multilingual variant of an existing evaluation test case.
    """
    case = deepcopy(base_case)

    case["name"] = f"{base_case['name']}_{language.lower()}"
    case["query"] = translated_query

    case.setdefault("expected_plan", {})
    case["expected_plan"]["script_language"] = language
    case["expected_plan"]["vocal_language"] = language

    return case


TRANSLATIONS = {
    "weather_question_1": {
        "Hindi": "पंजाब के रूपनगर जिले में आज मौसम कैसा रहेगा?",
        "Tamil": "பஞ்சாப் மாநிலத்தின் ரூப்நகர் மாவட்டத்தில் இன்று வானிலை எப்படி இருக்கும்?",
        "Telugu": "పంజాబ్ రాష్ట్రంలోని రూప్‌నగర్ జిల్లాలో ఈరోజు వాతావరణం ఎలా ఉంటుంది?",
        "Kannada": "ಪಂಜಾಬ್ ರಾಜ್ಯದ ರೂಪನಗರ ಜಿಲ್ಲೆಯಲ್ಲಿ ಇಂದು ಹವಾಮಾನ ಹೇಗಿರುತ್ತದೆ?",
        "Punjabi": "ਪੰਜਾਬ ਦੇ ਰੂਪਨਗਰ ਜ਼ਿਲ੍ਹੇ ਵਿੱਚ ਅੱਜ ਮੌਸਮ ਕਿਹੋ ਜਿਹਾ ਰਹੇਗਾ?",
    },
    "weather_question_2": {
        "Hindi": "क्या आज दिल्ली में बारिश होगी?",
        "Tamil": "இன்று டெல்லியில் மழை பெய்யுமா?",
        "Telugu": "ఈరోజు ఢిల్లీలో వర్షం పడుతుందా?",
        "Kannada": "ಇಂದು ದೆಹಲಿಯಲ್ಲಿ ಮಳೆಯಾಗುತ್ತದೆಯೇ?",
        "Punjabi": "ਕੀ ਅੱਜ ਦਿੱਲੀ ਵਿੱਚ ਮੀਂਹ ਪਵੇਗਾ?",
    },
    "weather_question_3": {
        "Hindi": "पंजाब के लुधियाना में अगले कुछ दिनों का मौसम पूर्वानुमान क्या है?",
        "Tamil": "பஞ்சாப் மாநிலத்தின் லூதியானாவில் அடுத்த சில நாட்களுக்கு வானிலை முன்னறிவிப்பு என்ன?",
        "Telugu": "పంజాబ్‌లోని లూధియానాకు వచ్చే కొన్ని రోజుల వాతావరణ సూచన ఏమిటి?",
        "Kannada": "ಪಂಜಾಬಿನ ಲುಧಿಯಾನಾದ ಮುಂದಿನ ಕೆಲವು ದಿನಗಳ ಹವಾಮಾನ ಮುನ್ಸೂಚನೆ ಏನು?",
        "Punjabi": "ਪੰਜਾਬ ਦੇ ਲੁਧਿਆਣਾ ਲਈ ਅਗਲੇ ਕੁਝ ਦਿਨਾਂ ਦਾ ਮੌਸਮ ਪੂਰਵ ਅਨੁਮਾਨ ਕੀ ਹੈ?",
    },
    "market_question_1": {
    "Hindi": "हरियाणा के सिरसा मंडी में गेहूं का भाव क्या है?",
    "Tamil": "ஹரியானாவின் சிற்சா மண்டியில் கோதுமையின் விலை என்ன?",
    "Telugu": "హర్యానాలోని సిర్సా మండిలో గోధుమ ధర ఎంత?",
    "Kannada": "ಹರಿಯಾಣದ ಸಿರ್ಸಾ ಮಂಡಿಯಲ್ಲಿ ಗೋಧಿಯ ಬೆಲೆ ಎಷ್ಟು?",
    "Punjabi": "ਹਰਿਆਣਾ ਦੇ ਸਿਰਸਾ ਮੰਡੀ ਵਿੱਚ ਗੇਂਹੂਂ ਦਾ ਭਾਅ ਕੀ ਹੈ?",
    },

    "market_question_2": {
        "Hindi": "हरियाणा के करनाल मंडी में धान का वर्तमान भाव क्या है?",
        "Tamil": "ஹரியானாவின் கர்னால் மண்டியில் நெல் தற்போதைய விலை என்ன?",
        "Telugu": "హర్యానాలోని కర్నాల్ మండిలో వరి ప్రస్తుత ధర ఎంత?",
        "Kannada": "ಹರಿಯಾಣದ ಕರ್ಣಾಲ್ ಮಂಡಿಯಲ್ಲಿ ಭತ್ತದ ಇಂದಿನ ಬೆಲೆ ಎಷ್ಟು?",
        "Punjabi": "ਹਰਿਆਣਾ ਦੇ ਕਰਨਾਲ ਮੰਡੀ ਵਿੱਚ ਧਾਨ ਦਾ ਮੌਜੂਦਾ ਭਾਅ ਕੀ ਹੈ?",
    },

    "mandya_paddy_price": {
        "Hindi": "मंड्या मंडी में धान का भाव क्या है?",
        "Tamil": "மண்டியா மண்டியில் நெல் விலை என்ன?",
        "Telugu": "మండ్యా మండిలో వరి ధర ఎంత?",
        "Kannada": "ಮಂಡ್ಯಾ ಮಂಡಿಯಲ್ಲಿ ಭತ್ತದ ಬೆಲೆ ಎಷ್ಟು?",
        "Punjabi": "ਮੰਡਿਆ ਮੰਡੀ ਵਿੱਚ ਧਾਨ ਦਾ ਭਾਅ ਕੀ ਹੈ?",
    },
}


MULTILINGUAL_TEST_CASES = []

for base_case in TEST_CASES:
    translations = TRANSLATIONS.get(base_case["name"])

    if not translations:
        continue

    for language, query in translations.items():
        MULTILINGUAL_TEST_CASES.append(
            create_multilingual_case(
                base_case,
                language,
                query,
            )
        )