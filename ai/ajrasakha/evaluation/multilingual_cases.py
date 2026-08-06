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


ROMANIZED_LANGUAGE_CODES = ("hi", "kn", "ta", "pa", "te")


def _translations(en: str, hi: str, kn: str, ta: str, pa: str, te: str) -> dict[str, str]:
    return {
        "en": en,
        "hi": hi,
        "kn": kn,
        "ta": ta,
        "pa": pa,
        "te": te,
    }


DOMAIN_MOCK_ANSWERS = {
    "weather": _translations(
        "Check the latest local forecast before spraying, irrigation, or harvest work, and protect the crop if heavy rain or heat is expected.",
        "छिड़काव, सिंचाई या कटाई से पहले स्थानीय मौसम पूर्वानुमान देखें और भारी बारिश या गर्मी की संभावना हो तो फसल की सुरक्षा करें।",
        "ಸಿಂಪಡಣೆ, ನೀರಾವರಿ ಅಥವಾ ಕೊಯ್ಲಿಗೆ ಮುನ್ನ ಸ್ಥಳೀಯ ಹವಾಮಾನ ಮುನ್ಸೂಚನೆ ಪರಿಶೀಲಿಸಿ; ಭಾರಿ ಮಳೆ ಅಥವಾ ಬಿಸಿಲು ಸಾಧ್ಯವಾದರೆ ಬೆಳೆಯನ್ನು ರಕ್ಷಿಸಿ.",
        "தெளிப்பு, பாசனம் அல்லது அறுவடைக்கு முன் உள்ளூர் வானிலை முன்னறிவிப்பை பார்க்கவும்; கனமழை அல்லது வெப்பம் இருந்தால் பயிரை பாதுகாக்கவும்.",
        "ਛਿੜਕਾਅ, ਸਿੰਚਾਈ ਜਾਂ ਕਟਾਈ ਤੋਂ ਪਹਿਲਾਂ ਸਥਾਨਕ ਮੌਸਮ ਅਨੁਮਾਨ ਵੇਖੋ ਅਤੇ ਭਾਰੀ ਮੀਂਹ ਜਾਂ ਗਰਮੀ ਦੀ ਸੰਭਾਵਨਾ ਹੋਵੇ ਤਾਂ ਫਸਲ ਦੀ ਰੱਖਿਆ ਕਰੋ।",
        "పిచికారీ, నీటిపారుదల లేదా కోతకు ముందు స్థానిక వాతావరణ సూచన చూడండి; భారీ వర్షం లేదా వేడి ఉంటే పంటను రక్షించండి.",
    ),
    "pest": _translations(
        "Inspect affected plants closely, remove heavily damaged parts, and use recommended pest or disease control only after confirming the symptoms.",
        "प्रभावित पौधों की अच्छी तरह जांच करें, ज्यादा खराब हिस्से हटाएं और लक्षणों की पुष्टि के बाद ही सुझाया गया कीट या रोग नियंत्रण अपनाएं।",
        "ಬಾಧಿತ ಸಸ್ಯಗಳನ್ನು ಚೆನ್ನಾಗಿ ಪರಿಶೀಲಿಸಿ, ಹೆಚ್ಚು ಹಾನಿಯಾದ ಭಾಗಗಳನ್ನು ತೆಗೆದುಹಾಕಿ ಮತ್ತು ಲಕ್ಷಣ ದೃಢವಾದ ನಂತರ ಮಾತ್ರ ಶಿಫಾರಸು ಮಾಡಿದ ಕೀಟ ಅಥವಾ ರೋಗ ನಿಯಂತ್ರಣ ಬಳಸಿ.",
        "பாதிக்கப்பட்ட செடிகளை நன்றாக பார்க்கவும், அதிக சேதமான பகுதிகளை அகற்றவும், அறிகுறி உறுதியான பிறகு மட்டுமே பரிந்துரைக்கப்பட்ட பூச்சி அல்லது நோய் கட்டுப்பாட்டை பயன்படுத்தவும்.",
        "ਪ੍ਰਭਾਵਿਤ ਪੌਦਿਆਂ ਦੀ ਧਿਆਨ ਨਾਲ ਜਾਂਚ ਕਰੋ, ਬਹੁਤ ਨੁਕਸਾਨ ਵਾਲੇ ਹਿੱਸੇ ਹਟਾਓ ਅਤੇ ਲੱਛਣ ਪੱਕੇ ਹੋਣ ਤੋਂ ਬਾਅਦ ਹੀ ਸਿਫਾਰਸ਼ੀ ਕੀਟ ਜਾਂ ਰੋਗ ਨਿਯੰਤਰਣ ਵਰਤੋ।",
        "ప్రభావిత మొక్కలను జాగ్రత్తగా పరిశీలించండి, ఎక్కువగా దెబ్బతిన్న భాగాలను తొలగించండి, లక్షణాలు నిర్ధారించిన తర్వాత మాత్రమే సిఫార్సు చేసిన పురుగు లేదా వ్యాధి నియంత్రణ వాడండి.",
    ),
    "soil": _translations(
        "Use a recent soil test to decide fertilizer dose, apply nutrients in split doses, and avoid overuse because it can reduce crop health and profit.",
        "उर्वरक मात्रा तय करने के लिए हाल की मिट्टी जांच का उपयोग करें, पोषक तत्वों को विभाजित मात्रा में दें और अधिक प्रयोग से बचें क्योंकि इससे फसल और लाभ घट सकते हैं।",
        "ರಸಗೊಬ್ಬರ ಪ್ರಮಾಣ ನಿರ್ಧರಿಸಲು ಇತ್ತೀಚಿನ ಮಣ್ಣು ಪರೀಕ್ಷೆ ಬಳಸಿ, ಪೋಷಕಾಂಶಗಳನ್ನು ಹಂತ ಹಂತವಾಗಿ ನೀಡಿ ಮತ್ತು ಅತಿಯಾದ ಬಳಕೆ ತಪ್ಪಿಸಿ.",
        "உர அளவை தீர்மானிக்க சமீபத்திய மண் பரிசோதனையை பயன்படுத்தவும், சத்துக்களை பிரித்து அளிக்கவும், அதிகமாக இடுவதை தவிர்க்கவும்.",
        "ਖਾਦ ਦੀ ਮਾਤਰਾ ਤੈਅ ਕਰਨ ਲਈ ਤਾਜ਼ਾ ਮਿੱਟੀ ਟੈਸਟ ਵਰਤੋ, ਪੋਸ਼ਕ ਤੱਤ ਵੰਡ ਕੇ ਦਿਓ ਅਤੇ ਵੱਧ ਵਰਤੋਂ ਤੋਂ ਬਚੋ।",
        "ఎరువు మోతాదు నిర్ణయించడానికి తాజా మట్టి పరీక్షను ఉపయోగించండి, పోషకాలను విడతలుగా ఇవ్వండి, అధిక వాడకాన్ని నివారించండి.",
    ),
    "market": _translations(
        "Compare nearby mandi prices, check crop grade and transport cost, and sell when the net price is better than local alternatives.",
        "नजदीकी मंडियों के भाव मिलाएं, फसल की ग्रेड और परिवहन लागत देखें और जब शुद्ध भाव स्थानीय विकल्पों से बेहतर हो तब बिक्री करें।",
        "ಹತ್ತಿರದ ಮಾರುಕಟ್ಟೆ ಬೆಲೆಗಳನ್ನು ಹೋಲಿಸಿ, ಬೆಳೆ ದರ್ಜೆ ಮತ್ತು ಸಾಗಣೆ ವೆಚ್ಚ ಪರಿಶೀಲಿಸಿ; ನಿವ್ವಳ ಬೆಲೆ ಉತ್ತಮವಾಗಿದ್ದಾಗ ಮಾರಾಟ ಮಾಡಿ.",
        "அருகிலுள்ள சந்தை விலைகளை ஒப்பிடவும், பயிர் தரம் மற்றும் போக்குவரத்து செலவை பார்க்கவும்; நிகர விலை நல்லதாக இருந்தால் விற்கவும்.",
        "ਨੇੜਲੀਆਂ ਮੰਡੀਆਂ ਦੇ ਭਾਅ ਮਿਲਾਓ, ਫਸਲ ਦੀ ਗ੍ਰੇਡ ਅਤੇ ਆਵਾਜਾਈ ਖਰਚਾ ਵੇਖੋ ਅਤੇ ਜਦੋਂ ਨਿੱਜੀ ਭਾਅ ਵਧੀਆ ਹੋਵੇ ਤਾਂ ਵੇਚੋ।",
        "సమీప మార్కెట్ ధరలను పోల్చండి, పంట గ్రేడ్ మరియు రవాణా ఖర్చు చూడండి; నికర ధర మెరుగ్గా ఉన్నప్పుడు అమ్మండి.",
    ),
    "scheme": _translations(
        "Check eligibility, keep land and identity documents ready, and apply through the official portal or nearest agriculture office.",
        "पात्रता जांचें, जमीन और पहचान के दस्तावेज तैयार रखें और आधिकारिक पोर्टल या नजदीकी कृषि कार्यालय से आवेदन करें।",
        "ಅರ್ಹತೆ ಪರಿಶೀಲಿಸಿ, ಭೂಮಿ ಮತ್ತು ಗುರುತಿನ ದಾಖಲೆಗಳನ್ನು ಸಿದ್ಧವಾಗಿಡಿ ಮತ್ತು ಅಧಿಕೃತ ಪೋರ್ಟಲ್ ಅಥವಾ ಹತ್ತಿರದ ಕೃಷಿ ಕಚೇರಿಯಲ್ಲಿ ಅರ್ಜಿ ಸಲ್ಲಿಸಿ.",
        "தகுதியை சரிபார்த்து, நிலம் மற்றும் அடையாள ஆவணங்களை தயார் வைத்து, அதிகாரப்பூர்வ தளம் அல்லது அருகிலுள்ள வேளாண் அலுவலகத்தில் விண்ணப்பிக்கவும்.",
        "ਯੋਗਤਾ ਜਾਂਚੋ, ਜ਼ਮੀਨ ਅਤੇ ਪਛਾਣ ਦਸਤਾਵੇਜ਼ ਤਿਆਰ ਰੱਖੋ ਅਤੇ ਅਧਿਕਾਰਕ ਪੋਰਟਲ ਜਾਂ ਨੇੜਲੇ ਖੇਤੀ ਦਫ਼ਤਰ ਰਾਹੀਂ ਅਰਜ਼ੀ ਦਿਓ।",
        "అర్హతను తనిఖీ చేయండి, భూమి మరియు గుర్తింపు పత్రాలు సిద్ధంగా ఉంచండి, అధికారిక పోర్టల్ లేదా సమీప వ్యవసాయ కార్యాలయం ద్వారా దరఖాస్తు చేయండి.",
    ),
}


ROMANIZED_QUERY_TEMPLATES = {
    "hi": {
        "weather": "{subject} ke liye mausam ka kya salah hai?",
        "pest": "{subject} ke liye kya karu?",
        "soil": "{subject} ke liye kaunsi khaad dalu?",
        "market": "{subject} ka mandi bhav kya hai?",
        "scheme": "{subject} ke liye kaise apply karu?",
    },
    "kn": {
        "weather": "{subject} ge havamana salahe enu?",
        "pest": "{subject} ge enu madabeku?",
        "soil": "{subject} ge yava gobbara hakabeku?",
        "market": "{subject} bele market alli eshtu?",
        "scheme": "{subject} ge hege apply madabeku?",
    },
    "ta": {
        "weather": "{subject} ku vaanilai aalosanai enna?",
        "pest": "{subject} ku enna seiyanum?",
        "soil": "{subject} ku entha uram podanum?",
        "market": "{subject} oda sandhai vilai enna?",
        "scheme": "{subject} ku eppadi apply pannanum?",
    },
    "pa": {
        "weather": "{subject} lai mausam di salah ki hai?",
        "pest": "{subject} lai ki kara?",
        "soil": "{subject} lai kehri khaad paava?",
        "market": "{subject} da mandi bhav ki hai?",
        "scheme": "{subject} lai apply kiven kara?",
    },
    "te": {
        "weather": "{subject} kosam vatavaranam salah enti?",
        "pest": "{subject} kosam emi cheyali?",
        "soil": "{subject} kosam ye eruvu veyali?",
        "market": "{subject} market dhara entha?",
        "scheme": "{subject} kosam ela apply cheyali?",
    },
}


CORE_SCENARIOS = [
    {
        "scenario_id": "weather_rain_ludhiana_today",
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
        "scenario_id": "weather_forecast_delhi_next_days",
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
        "scenario_id": "weather_harvest_rain_nashik_grapes",
        "domain": "weather",
        "location": {"city": "Nashik", "state": "Maharashtra"},
        "expected_tools": ["upload_question_to_reviewer_system", "weather"],
        "expected_gdb_entry_id": "",
        "expected_terms": ["Nashik", "grapes"],
        "translations": _translations(
            "Is rain expected in Nashik this week before grape harvest?",
            "अंगूर की कटाई से पहले इस हफ्ते नाशिक में बारिश की संभावना है क्या?",
            "ದ್ರಾಕ್ಷಿ ಕೊಯ್ಲಿಗೆ ಮೊದಲು ಈ ವಾರ ನಾಶಿಕ್‌ನಲ್ಲಿ ಮಳೆಯ ಸಾಧ್ಯತೆ ಇದೆಯೇ?",
            "திராட்சை அறுவடைக்கு முன் இந்த வாரம் நாசிக்கில் மழை எதிர்பார்க்கப்படுகிறதா?",
            "ਅੰਗੂਰ ਦੀ ਕਟਾਈ ਤੋਂ ਪਹਿਲਾਂ ਇਸ ਹਫ਼ਤੇ ਨਾਸ਼ਿਕ ਵਿੱਚ ਮੀਂਹ ਦੀ ਸੰਭਾਵਨਾ ਹੈ?",
            "ద్రాక్ష కోతకు ముందు ఈ వారం నాశిక్‌లో వర్షం పడే అవకాశముందా?",
        ),
    },
    {
        "scenario_id": "weather_heat_wave_cotton_nagpur",
        "domain": "weather",
        "location": {"city": "Nagpur", "state": "Maharashtra"},
        "expected_tools": ["upload_question_to_reviewer_system", "weather"],
        "expected_gdb_entry_id": "",
        "expected_terms": ["cotton", "Nagpur"],
        "translations": _translations(
            "Is there a heat wave warning for cotton fields near Nagpur?",
            "नागपुर के पास कपास के खेतों के लिए लू की चेतावनी है क्या?",
            "ನಾಗ್ಪುರದ ಬಳಿ ಹತ್ತಿ ಹೊಲಗಳಿಗೆ ಬಿಸಿಗಾಳಿ ಎಚ್ಚರಿಕೆ ಇದೆಯೇ?",
            "நாக்பூர் அருகிலுள்ள பருத்தி வயல்களுக்கு வெப்ப அலை எச்சரிக்கை உள்ளதா?",
            "ਨਾਗਪੁਰ ਨੇੜੇ ਕਪਾਹ ਦੇ ਖੇਤਾਂ ਲਈ ਲੂ ਦੀ ਚੇਤਾਵਨੀ ਹੈ?",
            "నాగ్‌పూర్ దగ్గర పత్తి పొలాలకు వేడి గాలుల హెచ్చరిక ఉందా?",
        ),
    },
    {
        "scenario_id": "weather_cyclone_rice_cuddalore",
        "domain": "weather",
        "location": {"city": "Cuddalore", "state": "Tamil Nadu"},
        "expected_tools": ["upload_question_to_reviewer_system", "weather"],
        "expected_gdb_entry_id": "",
        "expected_terms": ["rice", "Cuddalore"],
        "translations": _translations(
            "Is there any cyclone or heavy rain alert for rice fields in Cuddalore?",
            "कडलूर में धान के खेतों के लिए चक्रवात या तेज बारिश की चेतावनी है क्या?",
            "ಕಡಲೂರಿನ ಅಕ್ಕಿ ಹೊಲಗಳಿಗೆ ಚಂಡಮಾರುತ ಅಥವಾ ಭಾರಿ ಮಳೆ ಎಚ್ಚರಿಕೆ ಇದೆಯೇ?",
            "கடலூரில் நெல் வயல்களுக்கு புயல் அல்லது கனமழை எச்சரிக்கை உள்ளதா?",
            "ਕੱਡਲੂਰ ਵਿੱਚ ਝੋਨੇ ਦੇ ਖੇਤਾਂ ਲਈ ਚਕਰਵਾਤ ਜਾਂ ਭਾਰੀ ਮੀਂਹ ਦੀ ਚੇਤਾਵਨੀ ਹੈ?",
            "కడలూరులో వరి పొలాలకు తుఫాను లేదా భారీ వర్ష హెచ్చరిక ఉందా?",
        ),
    },
    {
        "scenario_id": "weather_sowing_rain_dharwad",
        "domain": "weather",
        "location": {"city": "Dharwad", "state": "Karnataka"},
        "expected_tools": ["upload_question_to_reviewer_system", "weather"],
        "expected_gdb_entry_id": "",
        "expected_terms": ["Dharwad", "sowing"],
        "translations": _translations(
            "Is this week suitable for sowing after rain in Dharwad?",
            "धारवाड़ में बारिश के बाद क्या यह हफ्ता बुवाई के लिए सही है?",
            "ಧಾರವಾಡದಲ್ಲಿ ಮಳೆಯ ನಂತರ ಈ ವಾರ ಬಿತ್ತನೆಗೆ ಸೂಕ್ತವೇ?",
            "தார்வாடில் மழைக்குப் பிறகு இந்த வாரம் விதைப்புக்கு ஏற்றதா?",
            "ਧਾਰਵਾਡ ਵਿੱਚ ਮੀਂਹ ਤੋਂ ਬਾਅਦ ਕੀ ਇਹ ਹਫ਼ਤਾ ਬਿਜਾਈ ਲਈ ਠੀਕ ਹੈ?",
            "ధారవాడ్‌లో వర్షం తర్వాత ఈ వారం విత్తనాలకు అనుకూలమా?",
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
        "scenario_id": "pest_cotton_pink_bollworm",
        "domain": "pest",
        "location": {"city": "Nagpur", "state": "Maharashtra"},
        "expected_tools": ["upload_question_to_reviewer_system", "gdb"],
        "expected_gdb_entry_id": "cotton_pink_bollworm",
        "expected_terms": ["cotton", "pink bollworm"],
        "translations": _translations(
            "How can I control pink bollworm in cotton?",
            "कपास में गुलाबी सुंडी को कैसे नियंत्रित करूं?",
            "ಹತ್ತಿಯಲ್ಲಿ ಪಿಂಕ್ ಬೋಲ್‌ವರ್ಮ್ ಅನ್ನು ಹೇಗೆ ನಿಯಂತ್ರಿಸಬೇಕು?",
            "பருத்தியில் பிங்க் பால் வார்மை எப்படி கட்டுப்படுத்துவது?",
            "ਕਪਾਹ ਵਿੱਚ ਗੁਲਾਬੀ ਸੁੰਡੀ ਨੂੰ ਕਿਵੇਂ ਕਾਬੂ ਕਰੀਏ?",
            "పత్తిలో పింక్ బోల్‌వార్మ్‌ను ఎలా నియంత్రించాలి?",
        ),
    },
    {
        "scenario_id": "pest_paddy_brown_planthopper",
        "domain": "pest",
        "location": {"city": "Mandya", "state": "Karnataka"},
        "expected_tools": ["upload_question_to_reviewer_system", "gdb"],
        "expected_gdb_entry_id": "paddy_brown_planthopper",
        "expected_terms": ["paddy", "brown planthopper"],
        "translations": _translations(
            "What should I do for brown planthopper in paddy?",
            "धान में भूरा तेला हो तो क्या करना चाहिए?",
            "ಭತ್ತದಲ್ಲಿ ಬ್ರೌನ್ ಪ್ಲಾಂಟ್‌ಹಾಪರ್ ಬಂದರೆ ಏನು ಮಾಡಬೇಕು?",
            "நெலில் பழுப்பு தண்டு தாவி வந்தால் என்ன செய்ய வேண்டும்?",
            "ਝੋਨੇ ਵਿੱਚ ਭੂਰਾ ਤੇਲਾ ਆ ਜਾਵੇ ਤਾਂ ਕੀ ਕਰਨਾ ਚਾਹੀਦਾ ਹੈ?",
            "వరిలో బ్రౌన్ ప్లాంట్‌హాపర్ వస్తే ఏమి చేయాలి?",
        ),
    },
    {
        "scenario_id": "pest_tomato_leaf_curl",
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
    {
        "scenario_id": "pest_chilli_thrips",
        "domain": "pest",
        "location": {"city": "Guntur", "state": "Andhra Pradesh"},
        "expected_tools": ["upload_question_to_reviewer_system", "gdb"],
        "expected_gdb_entry_id": "chilli_thrips",
        "expected_terms": ["chilli", "thrips"],
        "translations": _translations(
            "How can I manage thrips in chilli crop?",
            "मिर्च की फसल में थ्रिप्स को कैसे संभालूं?",
            "ಮೆಣಸಿನಕಾಯಿ ಬೆಳೆಯಲ್ಲಿ ಥ್ರಿಪ್ಸ್ ಅನ್ನು ಹೇಗೆ ನಿರ್ವಹಿಸಬೇಕು?",
            "மிளகாய் பயிரில் த்ரிப்ஸை எப்படி கட்டுப்படுத்துவது?",
            "ਮਿਰਚ ਦੀ ਫਸਲ ਵਿੱਚ ਥ੍ਰਿਪਸ ਨੂੰ ਕਿਵੇਂ ਸੰਭਾਲੀਏ?",
            "మిరప పంటలో త్రిప్స్‌ను ఎలా నియంత్రించాలి?",
        ),
    },
    {
        "scenario_id": "pest_mango_powdery_mildew",
        "domain": "pest",
        "location": {"city": "Krishnagiri", "state": "Tamil Nadu"},
        "expected_tools": ["upload_question_to_reviewer_system", "gdb"],
        "expected_gdb_entry_id": "mango_powdery_mildew",
        "expected_terms": ["mango", "powdery mildew"],
        "translations": _translations(
            "What is the treatment for powdery mildew in mango?",
            "आम में पाउडरी मिल्ड्यू का उपचार क्या है?",
            "ಮಾವಿನಲ್ಲಿ ಪೌಡರಿ ಮಿಲ್ಡ್ಯೂಗೆ ಚಿಕಿತ್ಸೆ ಏನು?",
            "மாம்பழத்தில் மாவு பூஞ்சை நோய்க்கு சிகிச்சை என்ன?",
            "ਅੰਬ ਵਿੱਚ ਪਾਊਡਰੀ ਮਿਲਡਿਊ ਦਾ ਇਲਾਜ ਕੀ ਹੈ?",
            "మామిడిలో పౌడరీ మిల్డ్యూ చికిత్స ఏమిటి?",
        ),
    },
    {
        "scenario_id": "soil_rice_fertilizer_ropar",
        "domain": "soil",
        "location": {"city": "Ropar", "state": "Punjab"},
        "expected_tools": ["upload_question_to_reviewer_system", "gdb"],
        "expected_gdb_entry_id": "soil_rice_fertilizer_ropar",
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
        "scenario_id": "soil_wheat_low_nitrogen_karnal",
        "domain": "soil",
        "location": {"city": "Karnal", "state": "Haryana"},
        "expected_tools": ["upload_question_to_reviewer_system", "gdb"],
        "expected_gdb_entry_id": "soil_wheat_low_nitrogen_karnal",
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
        "scenario_id": "soil_cotton_low_potash",
        "domain": "soil",
        "location": {"city": "Akola", "state": "Maharashtra"},
        "expected_tools": ["upload_question_to_reviewer_system", "gdb"],
        "expected_gdb_entry_id": "soil_cotton_low_potash",
        "expected_terms": ["cotton", "potash"],
        "translations": _translations(
            "My cotton field has low potash in the soil report. What fertilizer is needed?",
            "मेरे कपास के खेत की मिट्टी रिपोर्ट में पोटाश कम है। कौन सी खाद चाहिए?",
            "ನನ್ನ ಹತ್ತಿ ಹೊಲದ ಮಣ್ಣಿನ ವರದಿಯಲ್ಲಿ ಪೊಟಾಶ್ ಕಡಿಮೆ ಇದೆ. ಯಾವ ಗೊಬ್ಬರ ಬೇಕು?",
            "என் பருத்தி வயல் மண் அறிக்கையில் பொட்டாஷ் குறைவாக உள்ளது. எந்த உரம் தேவை?",
            "ਮੇਰੇ ਕਪਾਹ ਦੇ ਖੇਤ ਦੀ ਮਿੱਟੀ ਰਿਪੋਰਟ ਵਿੱਚ ਪੋਟਾਸ਼ ਘੱਟ ਹੈ। ਕਿਹੜੀ ਖਾਦ ਚਾਹੀਦੀ ਹੈ?",
            "నా పత్తి పొలం మట్టి నివేదికలో పొటాష్ తక్కువగా ఉంది. ఏ ఎరువు అవసరం?",
        ),
    },
    {
        "scenario_id": "soil_tomato_phosphorus_deficiency",
        "domain": "soil",
        "location": {"city": "Kolar", "state": "Karnataka"},
        "expected_tools": ["upload_question_to_reviewer_system", "gdb"],
        "expected_gdb_entry_id": "soil_tomato_phosphorus_deficiency",
        "expected_terms": ["tomato", "phosphorus"],
        "translations": _translations(
            "My tomato crop shows phosphorus deficiency. What should I apply?",
            "मेरी टमाटर फसल में फॉस्फोरस की कमी दिख रही है। मुझे क्या डालना चाहिए?",
            "ನನ್ನ ಟೊಮೇಟೊ ಬೆಳೆಯಲ್ಲಿ ಫಾಸ್ಫರಸ್ ಕೊರತೆ ಕಾಣುತ್ತಿದೆ. ನಾನು ಏನು ಹಾಕಬೇಕು?",
            "என் தக்காளி பயிரில் பாஸ்பரஸ் குறைபாடு தெரிகிறது. என்ன இட வேண்டும்?",
            "ਮੇਰੀ ਟਮਾਟਰ ਫਸਲ ਵਿੱਚ ਫਾਸਫੋਰਸ ਦੀ ਘਾਟ ਦਿਖ ਰਹੀ ਹੈ। ਮੈਂ ਕੀ ਪਾਵਾਂ?",
            "నా టమాటా పంటలో ఫాస్ఫరస్ లోపం కనిపిస్తోంది. నేను ఏమి వేయాలి?",
        ),
    },
    {
        "scenario_id": "soil_banana_organic_carbon_low",
        "domain": "soil",
        "location": {"city": "Jalgaon", "state": "Maharashtra"},
        "expected_tools": ["upload_question_to_reviewer_system", "gdb"],
        "expected_gdb_entry_id": "soil_banana_organic_carbon_low",
        "expected_terms": ["banana", "organic carbon"],
        "translations": _translations(
            "My banana field has low organic carbon. How can I improve the soil?",
            "मेरे केले के खेत में जैविक कार्बन कम है। मिट्टी कैसे सुधारूं?",
            "ನನ್ನ ಬಾಳೆ ತೋಟದಲ್ಲಿ ಜೈವಿಕ ಕಾರ್ಬನ್ ಕಡಿಮೆ ಇದೆ. ಮಣ್ಣನ್ನು ಹೇಗೆ ಸುಧಾರಿಸಬೇಕು?",
            "என் வாழை வயலில் கரிம கார்பன் குறைவாக உள்ளது. மண்ணை எப்படி மேம்படுத்துவது?",
            "ਮੇਰੇ ਕੇਲੇ ਦੇ ਖੇਤ ਵਿੱਚ ਜੈਵਿਕ ਕਾਰਬਨ ਘੱਟ ਹੈ। ਮਿੱਟੀ ਕਿਵੇਂ ਸੁਧਾਰਾਂ?",
            "నా అరటి తోటలో ఆర్గానిక్ కార్బన్ తక్కువగా ఉంది. మట్టిని ఎలా మెరుగుపరచాలి?",
        ),
    },
    {
        "scenario_id": "soil_sugarcane_fertilizer_dose",
        "domain": "soil",
        "location": {"city": "Kolhapur", "state": "Maharashtra"},
        "expected_tools": ["upload_question_to_reviewer_system", "gdb"],
        "expected_gdb_entry_id": "soil_sugarcane_fertilizer_dose",
        "expected_terms": ["sugarcane", "fertilizer"],
        "translations": _translations(
            "What fertilizer dose should I use for sugarcane after soil testing?",
            "मिट्टी जांच के बाद गन्ने के लिए कितनी खाद देनी चाहिए?",
            "ಮಣ್ಣಿನ ಪರೀಕ್ಷೆಯ ನಂತರ ಕಬ್ಬಿಗೆ ಎಷ್ಟು ಗೊಬ್ಬರ ಬಳಸಬೇಕು?",
            "மண் பரிசோதனைக்குப் பிறகு கரும்புக்கு எவ்வளவு உரம் இட வேண்டும்?",
            "ਮਿੱਟੀ ਜਾਂਚ ਤੋਂ ਬਾਅਦ ਗੰਨੇ ਲਈ ਕਿੰਨੀ ਖਾਦ ਪਾਉਣੀ ਚਾਹੀਦੀ ਹੈ?",
            "మట్టి పరీక్ష తర్వాత చెరకుకు ఎంత ఎరువు వేయాలి?",
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
        "scenario_id": "market_onion_lasalgaon",
        "domain": "market",
        "location": {"city": "Lasalgaon", "state": "Maharashtra"},
        "expected_tools": ["upload_question_to_reviewer_system", "market"],
        "expected_gdb_entry_id": "",
        "expected_terms": ["onion", "Lasalgaon"],
        "translations": _translations(
            "What is today's onion price in Lasalgaon market?",
            "आज लासलगांव मंडी में प्याज का भाव क्या है?",
            "ಇಂದು ಲಾಸಲ್ಗಾಂವ್ ಮಾರುಕಟ್ಟೆಯಲ್ಲಿ ಈರುಳ್ಳಿ ಬೆಲೆ ಎಷ್ಟು?",
            "இன்று லாசல்கான் சந்தையில் வெங்காய விலை என்ன?",
            "ਅੱਜ ਲਾਸਲਗਾਂਵ ਮੰਡੀ ਵਿੱਚ ਪਿਆਜ਼ ਦਾ ਭਾਅ ਕੀ ਹੈ?",
            "ఈ రోజు లాసల్‌గావ్ మార్కెట్‌లో ఉల్లి ధర ఎంత?",
        ),
    },
    {
        "scenario_id": "market_tomato_kolar",
        "domain": "market",
        "location": {"city": "Kolar", "state": "Karnataka"},
        "expected_tools": ["upload_question_to_reviewer_system", "market"],
        "expected_gdb_entry_id": "",
        "expected_terms": ["tomato", "Kolar"],
        "translations": _translations(
            "What is the current tomato price in Kolar market?",
            "कोलार मंडी में टमाटर का वर्तमान भाव क्या है?",
            "ಕೋಲಾರ ಮಾರುಕಟ್ಟೆಯಲ್ಲಿ ಟೊಮೇಟೊದ ಈಗಿನ ಬೆಲೆ ಎಷ್ಟು?",
            "கோலார் சந்தையில் தக்காளியின் தற்போதைய விலை என்ன?",
            "ਕੋਲਾਰ ਮੰਡੀ ਵਿੱਚ ਟਮਾਟਰ ਦਾ ਮੌਜੂਦਾ ਭਾਅ ਕੀ ਹੈ?",
            "కోలార్ మార్కెట్‌లో ప్రస్తుత టమాటా ధర ఎంత?",
        ),
    },
    {
        "scenario_id": "market_cotton_akola",
        "domain": "market",
        "location": {"city": "Akola", "state": "Maharashtra"},
        "expected_tools": ["upload_question_to_reviewer_system", "market"],
        "expected_gdb_entry_id": "",
        "expected_terms": ["cotton", "Akola"],
        "translations": _translations(
            "What is the cotton price in Akola mandi today?",
            "आज अकोला मंडी में कपास का भाव क्या है?",
            "ಇಂದು ಅಕೋಲಾ ಮಾರುಕಟ್ಟೆಯಲ್ಲಿ ಹತ್ತಿಯ ಬೆಲೆ ಎಷ್ಟು?",
            "இன்று அகோலா சந்தையில் பருத்தி விலை என்ன?",
            "ਅੱਜ ਅਕੋਲਾ ਮੰਡੀ ਵਿੱਚ ਕਪਾਹ ਦਾ ਭਾਅ ਕੀ ਹੈ?",
            "ఈ రోజు అకోలా మార్కెట్‌లో పత్తి ధర ఎంత?",
        ),
    },
    {
        "scenario_id": "market_chilli_guntur",
        "domain": "market",
        "location": {"city": "Guntur", "state": "Andhra Pradesh"},
        "expected_tools": ["upload_question_to_reviewer_system", "market"],
        "expected_gdb_entry_id": "",
        "expected_terms": ["chilli", "Guntur"],
        "translations": _translations(
            "What is the dry chilli price in Guntur market?",
            "गुंटूर मंडी में सूखी मिर्च का भाव क्या है?",
            "ಗುಂಟೂರು ಮಾರುಕಟ್ಟೆಯಲ್ಲಿ ಒಣ ಮೆಣಸಿನಕಾಯಿ ಬೆಲೆ ಎಷ್ಟು?",
            "குண்டூர் சந்தையில் உலர் மிளகாய் விலை என்ன?",
            "ਗੁੰਟੂਰ ਮੰਡੀ ਵਿੱਚ ਸੁੱਕੀ ਮਿਰਚ ਦਾ ਭਾਅ ਕੀ ਹੈ?",
            "గుంటూరు మార్కెట్‌లో ఎండు మిరప ధర ఎంత?",
        ),
    },
    {
        "scenario_id": "scheme_drip_irrigation_rajasthan",
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
        "scenario_id": "scheme_pm_kisan_eligibility",
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
        "scenario_id": "scheme_crop_insurance_claim",
        "domain": "scheme",
        "location": {"city": "Hisar", "state": "Haryana"},
        "expected_tools": ["upload_question_to_reviewer_system", "schemes"],
        "expected_gdb_entry_id": "",
        "expected_terms": ["crop insurance", "claim"],
        "translations": _translations(
            "How can I file a crop insurance claim after hail damage?",
            "ओलावृष्टि से नुकसान के बाद फसल बीमा दावा कैसे करूं?",
            "ಆಲಿಕಲ್ಲು ಹಾನಿಯ ನಂತರ ಬೆಳೆ ವಿಮೆ ದಾವೆ ಹೇಗೆ ಸಲ್ಲಿಸಬೇಕು?",
            "கல் மழை சேதத்திற்குப் பிறகு பயிர் காப்பீட்டு கோரிக்கை எப்படி செய்வது?",
            "ਓਲਾਵਰਖਾ ਦੇ ਨੁਕਸਾਨ ਤੋਂ ਬਾਅਦ ਫਸਲ ਬੀਮਾ ਕਲੇਮ ਕਿਵੇਂ ਕਰੀਏ?",
            "వడగళ్ల నష్టం తర్వాత పంట బీమా క్లెయిమ్ ఎలా చేయాలి?",
        ),
    },
    {
        "scenario_id": "scheme_farm_pond_subsidy",
        "domain": "scheme",
        "location": {"city": "Aurangabad", "state": "Maharashtra"},
        "expected_tools": ["upload_question_to_reviewer_system", "schemes"],
        "expected_gdb_entry_id": "",
        "expected_terms": ["farm pond", "subsidy"],
        "translations": _translations(
            "Which scheme gives subsidy for building a farm pond?",
            "खेत तालाब बनाने के लिए किस योजना में सब्सिडी मिलती है?",
            "ಕೃಷಿ ಕೆರೆ ನಿರ್ಮಿಸಲು ಯಾವ ಯೋಜನೆಯಲ್ಲಿ ಸಹಾಯಧನ ಸಿಗುತ್ತದೆ?",
            "பண்ணை குளம் அமைக்க எந்த திட்டத்தில் மானியம் கிடைக்கும்?",
            "ਖੇਤ ਤਲਾਬ ਬਣਾਉਣ ਲਈ ਕਿਹੜੀ ਯੋਜਨਾ ਵਿੱਚ ਸਬਸਿਡੀ ਮਿਲਦੀ ਹੈ?",
            "ఫార్మ్ పాండ్ నిర్మాణానికి ఏ పథకంలో సబ్సిడీ లభిస్తుంది?",
        ),
    },
    {
        "scenario_id": "scheme_women_farmer_support",
        "domain": "scheme",
        "location": {"city": "Mysuru", "state": "Karnataka"},
        "expected_tools": ["upload_question_to_reviewer_system", "schemes"],
        "expected_gdb_entry_id": "",
        "expected_terms": ["women farmer", "scheme"],
        "translations": _translations(
            "Which government schemes support women farmers in Karnataka?",
            "कर्नाटक में महिला किसानों के लिए कौन सी सरकारी योजनाएं हैं?",
            "ಕರ್ನಾಟಕದ ಮಹಿಳಾ ರೈತರಿಗೆ ಯಾವ ಸರ್ಕಾರಿ ಯೋಜನೆಗಳು ಸಹಾಯ ಮಾಡುತ್ತವೆ?",
            "கர்நாடகாவில் பெண்கள் விவசாயிகளுக்கு எந்த அரசு திட்டங்கள் உதவுகின்றன?",
            "ਕਰਨਾਟਕ ਵਿੱਚ ਮਹਿਲਾ ਕਿਸਾਨਾਂ ਲਈ ਕਿਹੜੀਆਂ ਸਰਕਾਰੀ ਯੋਜਨਾਵਾਂ ਹਨ?",
            "కర్ణాటకలో మహిళా రైతులకు ఏ ప్రభుత్వ పథకాలు సహాయం చేస్తాయి?",
        ),
    },
    {
        "scenario_id": "scheme_solar_pump_subsidy",
        "domain": "scheme",
        "location": {"city": "Bikaner", "state": "Rajasthan"},
        "expected_tools": ["upload_question_to_reviewer_system", "schemes"],
        "expected_gdb_entry_id": "",
        "expected_terms": ["solar pump", "subsidy"],
        "translations": _translations(
            "How can I apply for a solar pump subsidy?",
            "सोलर पंप सब्सिडी के लिए आवेदन कैसे करूं?",
            "ಸೌರ ಪಂಪ್ ಸಹಾಯಧನಕ್ಕೆ ಹೇಗೆ ಅರ್ಜಿ ಸಲ್ಲಿಸಬೇಕು?",
            "சோலார் பம்ப் மானியத்திற்கு எப்படி விண்ணப்பிப்பது?",
            "ਸੋਲਰ ਪੰਪ ਸਬਸਿਡੀ ਲਈ ਅਰਜ਼ੀ ਕਿਵੇਂ ਦੇਵਾਂ?",
            "సోలార్ పంప్ సబ్సిడీకి ఎలా దరఖాస్తు చేయాలి?",
        ),
    },
]

for scenario in CORE_SCENARIOS:
    scenario["source_scenario_id"] = scenario["scenario_id"]
    scenario["is_fixture"] = False
    scenario["translation_status"] = "draft_needs_agri_validation"


def _mock_answer_for(language_code: str, scenario: dict) -> str:
    return DOMAIN_MOCK_ANSWERS[scenario["domain"]][language_code]


def _mock_response_for(language_code: str, scenario: dict) -> str:
    disclaimer_term = DISCLAIMER_TERMS[language_code]
    query = scenario["translations"][language_code]
    answer = _mock_answer_for(language_code, scenario)
    return f"{query}\n\n{answer}\n\n{disclaimer_term}: mock evaluation response."


def _romanized_subject(scenario: dict) -> str:
    terms = scenario.get("expected_terms", [])
    if terms:
        return " ".join(terms[:2])
    location = scenario.get("location") or {}
    city = location.get("city")
    if city:
        return city
    return scenario["domain"]


def _romanized_query_for(language_code: str, scenario: dict) -> str:
    template = ROMANIZED_QUERY_TEMPLATES[language_code][scenario["domain"]]
    return template.format(subject=_romanized_subject(scenario))


def build_multilingual_cases() -> list[dict]:
    cases: list[dict] = []

    for scenario in CORE_SCENARIOS:
        for language_code, language_meta in LANGUAGES.items():
            query = scenario["translations"][language_code]
            answer = _mock_answer_for(language_code, scenario)
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
                    "expected_answer_text": answer,
                    "mock_answer_text": answer,
                    "mock_response_text": _mock_response_for(language_code, scenario),
                    "mock_retrieved_gdb_entry_id": scenario.get("expected_gdb_entry_id", ""),
                    "stable": False,
                }
            )

    return cases


def build_romanized_input_cases() -> list[dict]:
    """Build Latin-keyboard farmer input cases for Indic languages.

    These cases are intentionally separate from MULTILINGUAL_TEST_CASES so the
    existing 30 x 6 native-script evaluation matrix remains backward compatible.
    """
    cases: list[dict] = []

    for scenario in CORE_SCENARIOS:
        for language_code in ROMANIZED_LANGUAGE_CODES:
            language_meta = LANGUAGES[language_code]
            query = _romanized_query_for(language_code, scenario)
            answer = _mock_answer_for(language_code, scenario)
            cases.append(
                {
                    "name": f"{scenario['scenario_id']}_{language_code}_romanized",
                    "scenario_id": scenario["scenario_id"],
                    "query": query,
                    "language_code": language_code,
                    "language": language_meta["name"],
                    "input_script": "Latin",
                    "input_style": "romanized",
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
                    "translation_status": "romanized_draft_needs_agri_validation",
                    "expect_2hr_disclaimer": True,
                    "expected_disclaimer_marker": DISCLAIMER_TERMS[language_code],
                    "expected_answer_text": answer,
                    "mock_answer_text": answer,
                    "mock_response_text": f"{query}\n\n{answer}\n\n{DISCLAIMER_TERMS[language_code]}: mock evaluation response.",
                    "mock_retrieved_gdb_entry_id": scenario.get("expected_gdb_entry_id", ""),
                    "stable": False,
                }
            )

    return cases


MULTILINGUAL_TEST_CASES = build_multilingual_cases()
ROMANIZED_INPUT_TEST_CASES = build_romanized_input_cases()
