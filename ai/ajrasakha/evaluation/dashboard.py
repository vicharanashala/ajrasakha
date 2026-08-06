"""Local web interface for multilingual evaluation probes."""

from __future__ import annotations

import re
import json
import os
import urllib.error
import urllib.request
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field, field_validator

from ajrasakha.evaluation.executors import run_live_case, run_mock_case
from ajrasakha.evaluation.golden_index_setup import (
    REQUIRED_INDEXES,
    create_required_search_indexes,
    golden_index_readiness,
    golden_index_env_values,
)
from ajrasakha.evaluation.language_recommendations import (
    build_language_quality_recommendations,
    build_language_quality_recommendations_markdown,
)
from ajrasakha.evaluation.mock_deepeval import (
    DEEPEVAL_METRIC_LABELS,
    evaluate_answer_with_mock_deepeval,
)
from ajrasakha.evaluation.multilingual_cases import (
    DISCLAIMER_TERMS,
    LANGUAGES,
    MULTILINGUAL_TEST_CASES,
    ROMANIZED_INPUT_TEST_CASES,
)
from ajrasakha.evaluation.validators.language_quality import evaluate_language_quality


class AskRequest(BaseModel):
    """User question submitted from the multilingual evaluation dashboard."""

    question: str = Field(..., min_length=1)
    mode: str = Field("mock", pattern="^(mock|live)$")

    @field_validator("question")
    @classmethod
    def clean_question(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Question cannot be empty.")
        return cleaned


MOCK_DASHBOARD_ANSWERS = {
    "en": (
        "Whiteflies in cotton can reduce plant vigor and spread leaf curl disease. "
        "Check the underside of leaves, remove heavily infested leaves, and avoid excess nitrogen. "
        "Use yellow sticky traps and consult a local agriculture expert before spraying any pesticide."
    ),
    "hi": (
        "कपास में सफेद मक्खी पौधे को कमजोर कर सकती है और लीफ कर्ल रोग फैला सकती है। "
        "पत्तियों के नीचे जांच करें, अधिक प्रभावित पत्तियां हटाएं और नाइट्रोजन का अधिक प्रयोग न करें। "
        "पीले चिपचिपे ट्रैप लगाएं और किसी भी कीटनाशक के छिड़काव से पहले स्थानीय कृषि विशेषज्ञ से सलाह लें।"
    ),
    "kn": (
        "ಹತ್ತಿಯಲ್ಲಿ ಬಿಳಿ ಈಗೆ ಸಸ್ಯದ ಬೆಳವಣಿಗೆಯನ್ನು ಕಡಿಮೆ ಮಾಡಬಹುದು ಮತ್ತು ಲೀಫ್ ಕರ್ ರೋಗವನ್ನು ಹರಡಬಹುದು. "
        "ಎಲೆಗಳ ಕೆಳಭಾಗ ಪರಿಶೀಲಿಸಿ, ಹೆಚ್ಚು ಬಾಧಿತ ಎಲೆಗಳನ್ನು ತೆಗೆದುಹಾಕಿ ಮತ್ತು ಅಧಿಕ ನೈಟ್ರೋಜನ್ ಬಳಕೆ ತಪ್ಪಿಸಿ. "
        "ಹಳದಿ ಅಂಟು ಬಲೆಗಳನ್ನು ಬಳಸಿ, ಯಾವುದೇ ಕೀಟನಾಶಕ ಸಿಂಪಡಿಸುವ ಮೊದಲು ಸ್ಥಳೀಯ ಕೃಷಿ ತಜ್ಞರನ್ನು ಸಂಪರ್ಕಿಸಿ."
    ),
    "ta": (
        "பருத்தியில் வெள்ளை ஈ செடியின் வளர்ச்சியை குறைத்து இலை சுருள் நோயை பரப்பலாம். "
        "இலைகளின் கீழ்புறத்தை பார்க்கவும், அதிகமாக பாதிக்கப்பட்ட இலைகளை அகற்றவும், அதிக நைட்ரஜன் இடுவதை தவிர்க்கவும். "
        "மஞ்சள் ஒட்டும் வலைகளை பயன்படுத்தி, பூச்சிக்கொல்லி தெளிப்பதற்கு முன் உள்ளூர் வேளாண் நிபுணரை அணுகவும்."
    ),
    "pa": (
        "ਕਪਾਹ ਵਿੱਚ ਚਿੱਟੀ ਮੱਖੀ ਪੌਦੇ ਨੂੰ ਕਮਜ਼ੋਰ ਕਰ ਸਕਦੀ ਹੈ ਅਤੇ ਲੀਫ ਕਰਲ ਬਿਮਾਰੀ ਫੈਲਾ ਸਕਦੀ ਹੈ। "
        "ਪੱਤਿਆਂ ਦੇ ਹੇਠਲੇ ਪਾਸੇ ਜਾਂਚ ਕਰੋ, ਬਹੁਤ ਪ੍ਰਭਾਵਿਤ ਪੱਤੇ ਹਟਾਓ ਅਤੇ ਨਾਈਟ੍ਰੋਜਨ ਦੀ ਵੱਧ ਵਰਤੋਂ ਤੋਂ ਬਚੋ। "
        "ਪੀਲੇ ਚਿਪਚਿਪੇ ਟ੍ਰੈਪ ਲਗਾਓ ਅਤੇ ਕਿਸੇ ਵੀ ਕੀਟਨਾਸ਼ਕ ਦੇ ਛਿੜਕਾਅ ਤੋਂ ਪਹਿਲਾਂ ਸਥਾਨਕ ਖੇਤੀ ਮਾਹਰ ਨਾਲ ਸਲਾਹ ਕਰੋ।"
    ),
    "te": (
        "పత్తిలో తెల్ల ఈగలు మొక్క బలాన్ని తగ్గించి లీఫ్ కర్ల్ వ్యాధిని వ్యాప్తి చేయవచ్చు. "
        "ఆకుల క్రింద భాగాన్ని పరిశీలించండి, ఎక్కువగా ప్రభావితమైన ఆకులను తొలగించండి, అధిక నైట్రోజన్ వాడకాన్ని నివారించండి. "
        "పసుపు స్టిక్కీ ట్రాప్స్ వాడండి మరియు ఏ పురుగుమందు పిచికారీ చేసే ముందు స్థానిక వ్యవసాయ నిపుణుడిని సంప్రదించండి."
    ),
}


NO_CONFIDENT_MATCH_ANSWERS = {
    "en": (
        "I could not find a reliable matching entry in the current test-case DB for this exact question. "
        "This should be reviewed as a Golden DB coverage gap before giving a specific farming recommendation."
    ),
    "hi": (
        "इस सवाल के लिए मौजूदा टेस्ट-केस DB में भरोसेमंद मेल खाती एंट्री नहीं मिली। "
        "किसी खास कृषि सलाह से पहले इसे Golden DB coverage gap के रूप में जांचना चाहिए।"
    ),
    "kn": (
        "ಈ ಪ್ರಶ್ನೆಗೆ ಪ್ರಸ್ತುತ test-case DB ನಲ್ಲಿ ನಂಬಲರ್ಹವಾಗಿ ಹೊಂದುವ ದಾಖಲೆ ಸಿಗಲಿಲ್ಲ. "
        "ನಿರ್ದಿಷ್ಟ ಕೃಷಿ ಸಲಹೆ ನೀಡುವ ಮೊದಲು ಇದನ್ನು Golden DB coverage gap ಆಗಿ ಪರಿಶೀಲಿಸಬೇಕು."
    ),
    "ta": (
        "இந்த கேள்விக்கு தற்போதைய test-case DB-இல் நம்பகமான பொருத்தமான பதிவு கிடைக்கவில்லை. "
        "குறிப்பிட்ட வேளாண் ஆலோசனை வழங்குவதற்கு முன் இதை Golden DB coverage gap ஆக பரிசீலிக்க வேண்டும்."
    ),
    "pa": (
        "ਇਸ ਸਵਾਲ ਲਈ ਮੌਜੂਦਾ test-case DB ਵਿੱਚ ਭਰੋਸੇਯੋਗ ਮਿਲਦੀ ਐਂਟਰੀ ਨਹੀਂ ਮਿਲੀ। "
        "ਖਾਸ ਖੇਤੀ ਸਲਾਹ ਦੇਣ ਤੋਂ ਪਹਿਲਾਂ ਇਸਨੂੰ Golden DB coverage gap ਵਜੋਂ ਜਾਂਚਣਾ ਚਾਹੀਦਾ ਹੈ।"
    ),
    "te": (
        "ఈ ప్రశ్నకు ప్రస్తుత test-case DBలో నమ్మదగిన సరిపోలే ఎంట్రీ దొరకలేదు. "
        "నిర్దిష్ట వ్యవసాయ సలహా ఇవ్వడానికి ముందు దీన్ని Golden DB coverage gapగా సమీక్షించాలి."
    ),
}


ROMANIZED_DISCLAIMER_TERMS = {
    "hi": "visheshagya",
    "kn": "tajna",
    "ta": "nipunar",
    "pa": "mahar",
    "te": "nipunudu",
}


ROMANIZED_DOMAIN_MOCK_ANSWERS = {
    "weather": {
        "hi": "Spray, sinchai ya katai se pehle local mausam forecast dekhein. Agar tez baarish ya garmi ki sambhavna ho to fasal ki suraksha karein.",
        "kn": "Spray, neeravari athava koylu modalu local havamana forecast nodi. Jasti male athava bisilu iddare beleyannu rakshisi.",
        "ta": "Spray, paasanam allathu aruvadai mun local vaanilai forecast paarunga. Kanamazhai allathu veppam irundhaal payirai paadhukaakkavum.",
        "pa": "Spray, sinchai ya katai ton pehla local mausam forecast vekho. Je tez meeh ya garmi di sambhavna hove ta fasal di rakhiya karo.",
        "te": "Spray, neetiparudala leda kotha mundu local vatavaranam forecast chudandi. Bhari varsham leda vedi unte pantanu rakshinchandi.",
    },
    "pest": {
        "hi": "Prabhavit paudhon ko dhyan se dekhein, zyada nuksan wale hisson ko hataein, aur lakshan confirm hone ke baad hi pest control use karein.",
        "kn": "Badita gidagalannu chennagi nodi, hechu haaniyada bhagagalannu tegedu, lakshana confirm aadamele matra pest control balasi.",
        "ta": "Paathikkappatta sedigalai nandraaga paarunga, adhiga sedham irukkum pagudigalai agatunga, symptoms confirm aana piragu mattum pest control use pannunga.",
        "pa": "Prabhavit paudeyan nu dhyan naal vekho, zyada nuksan wale hisse hatao, te lakshan pakke hon ton baad hi pest control varato.",
        "te": "Prabhavita mokkalanu jagrattaga chudandi, ekkuva nashtamaina bhagalanu teeseyandi, symptoms confirm ayyaka matrame pest control vadandi.",
    },
    "soil": {
        "hi": "Fertilizer dose ke liye recent soil test dekhein, nutrients split dose mein dein, aur zyada khaad se bachein.",
        "kn": "Gobbara dose ge recent soil test nodi, nutrients split dose alli kodi, mattu ati gobbara balake tappisi.",
        "ta": "Uram dose ku recent soil test paarunga, nutrients split dose la podunga, adhigama uram podaradhu thaviringa.",
        "pa": "Khaad dose lai recent soil test vekho, nutrients split dose vich pao, te zyada khaad ton bacho.",
        "te": "Eruvu dose kosam recent soil test chudandi, nutrients split dose lo ivvandi, ekkuva eruvu vadakanni tappinchandi.",
    },
    "market": {
        "hi": "Nazdeeki mandi bhav compare karein, crop grade aur transport cost dekhein, phir better net price par bechein.",
        "kn": "Hattirada market bele compare madi, crop grade mattu transport cost nodi, better net price iddaga marata madi.",
        "ta": "Pakkathula irukkum sandhai vilai compare pannunga, crop grade matrum transport cost paarunga, better net price irundha sell pannunga.",
        "pa": "Nerle mandi bhav compare karo, crop grade te transport cost vekho, phir better net price te vecho.",
        "te": "Daggaralo market dharalu compare cheyandi, crop grade mariyu transport cost chudandi, better net price unte ammandi.",
    },
    "scheme": {
        "hi": "Eligibility check karein, zameen aur identity documents ready rakhein, aur official portal ya najdeeki krishi office se apply karein.",
        "kn": "Eligibility check madi, land mattu identity documents ready idi, official portal athava hattirada agriculture office alli apply madi.",
        "ta": "Eligibility check pannunga, land matrum identity documents ready vechukonga, official portal allathu nearby agriculture office la apply pannunga.",
        "pa": "Eligibility check karo, zameen te identity documents ready rakho, official portal ya nerle agriculture office ton apply karo.",
        "te": "Eligibility check cheyandi, land mariyu identity documents ready ga pettukondi, official portal leda daggara agriculture office lo apply cheyandi.",
    },
}


ROMANIZED_NO_CONFIDENT_MATCH_ANSWERS = {
    "hi": "Is sawal ke liye current test-case DB mein reliable matching entry nahi mili. Specific farming advice dene se pehle ise Golden DB coverage gap ke roop mein review karna chahiye.",
    "kn": "Ee prashnege current test-case DB alli reliable matching entry sigalilla. Specific farming advice koduva modalu idannu Golden DB coverage gap aagi review madabeku.",
    "ta": "Indha kelvikku current test-case DB la reliable matching entry kidaikkavillai. Specific farming advice kudukkum mun idhai Golden DB coverage gap ah review pannanum.",
    "pa": "Is sawal lai current test-case DB vich reliable matching entry nahi mili. Specific farming advice den ton pehla isnu Golden DB coverage gap vajon review karna chahida hai.",
    "te": "Ee prashnaku current test-case DB lo reliable matching entry dorakaledu. Specific farming advice ivvadam mundu dinni Golden DB coverage gap ga review cheyali.",
}


SCRIPT_RANGES = {
    "hi": (0x0900, 0x097F),
    "kn": (0x0C80, 0x0CFF),
    "ta": (0x0B80, 0x0BFF),
    "pa": (0x0A00, 0x0A7F),
    "te": (0x0C00, 0x0C7F),
}


ROMANIZED_LANGUAGE_HINTS = {
    "hi": {
        "hai",
        "kya",
        "karu",
        "kaise",
        "ke",
        "ki",
        "mein",
        "me",
        "fasal",
        "gehun",
        "khaad",
        "bhav",
    },
    "kn": {
        "enu",
        "madabeku",
        "hege",
        "alli",
        "bele",
        "gobbara",
        "hatti",
        "bhatha",
        "salahe",
    },
    "ta": {
        "enna",
        "seiyanum",
        "eppadi",
        "irukku",
        "vilai",
        "sandhai",
        "paruthi",
        "uram",
    },
    "pa": {
        "ki",
        "kara",
        "kiven",
        "vich",
        "lai",
        "da",
        "di",
        "kapah",
        "bhav",
    },
    "te": {
        "enti",
        "emi",
        "cheyali",
        "ela",
        "entha",
        "dhara",
        "patti",
        "eruvu",
        "kosam",
    },
}


SEARCH_STOPWORDS = {
    "a",
    "an",
    "and",
    "any",
    "are",
    "can",
    "do",
    "for",
    "have",
    "how",
    "i",
    "if",
    "in",
    "is",
    "it",
    "me",
    "my",
    "of",
    "or",
    "should",
    "the",
    "there",
    "this",
    "to",
    "what",
    "with",
    "when",
    "which",
}


DOMAIN_HINTS = {
    "weather": {"rain", "forecast", "weather", "heat", "cyclone", "sowing", "harvest"},
    "pest": {"pest", "disease", "whitefly", "whiteflies", "bollworm", "rust", "curl", "thrips", "mildew", "leaves"},
    "soil": {"soil", "fertilizer", "nitrogen", "phosphorus", "potash", "organic", "carbon", "deficiency"},
    "market": {"price", "market", "mandi", "bhav", "rate"},
    "scheme": {"scheme", "subsidy", "apply", "eligible", "insurance", "claim", "pm", "kisan"},
}


CROP_HINTS = {
    "banana",
    "chilli",
    "cotton",
    "grape",
    "grapes",
    "mango",
    "onion",
    "paddy",
    "rice",
    "sugarcane",
    "tomato",
    "wheat",
}


PEST_HINTS = {
    "bollworm",
    "curl",
    "firefly",
    "fireflies",
    "mildew",
    "planthopper",
    "rust",
    "thrips",
    "whitefly",
    "whiteflies",
}


ROMANIZED_SEARCH_ALIASES = {
    "kapas": "cotton",
    "kapah": "cotton",
    "hatti": "cotton",
    "paruthi": "cotton",
    "patti": "cotton",
    "safed": "white",
    "whiteflies": "whitefly",
    "whitefly": "whitefly",
    "fireflies": "firefly",
    "firefly": "firefly",
    "chitti": "white",
    "makkhi": "whitefly",
    "makhi": "whitefly",
    "bili": "white",
    "nona": "whitefly",
    "vellai": "white",
    "ee": "whitefly",
    "tella": "white",
    "eegalu": "whitefly",
    "gehun": "wheat",
    "gandum": "wheat",
    "godhi": "wheat",
    "godhumi": "wheat",
    "dhan": "paddy",
    "bhatha": "paddy",
    "nel": "paddy",
    "vari": "paddy",
    "tamatar": "tomato",
    "tomato": "tomato",
    "thakkali": "tomato",
    "tameta": "tomato",
    "mirch": "chilli",
    "menasinakayi": "chilli",
    "milagai": "chilli",
    "mirapa": "chilli",
    "khaad": "fertilizer",
    "khad": "fertilizer",
    "gobbara": "fertilizer",
    "uram": "fertilizer",
    "eruvu": "fertilizer",
    "bhav": "price",
    "bele": "price",
    "vilai": "price",
    "dhara": "price",
    "mandi": "market",
    "sandhai": "market",
    "subsidy": "subsidy",
    "yojana": "scheme",
    "scheme": "scheme",
    "baarish": "rain",
    "barish": "rain",
    "aayegi": "rain",
    "ayegi": "rain",
    "ludhiyana": "ludhiana",
    "spray": "spraying",
}


def _search_tokens(text: str) -> set[str]:
    words = re.findall(r"[a-zA-Z0-9]+", text.lower())
    tokens = {
        ROMANIZED_SEARCH_ALIASES.get(word, word)
        for word in words
        if len(word) > 1 and word not in SEARCH_STOPWORDS
    }
    if "white" in tokens and "whitefly" in tokens:
        tokens.add("whiteflies")
    return tokens


def _domain_from_tokens(tokens: set[str]) -> str:
    best_domain = ""
    best_count = 0
    for domain, hints in DOMAIN_HINTS.items():
        count = len(tokens & hints)
        if count > best_count:
            best_domain = domain
            best_count = count
    return best_domain


def _english_db_cases() -> list[dict[str, Any]]:
    return [case for case in MULTILINGUAL_TEST_CASES if case["language_code"] == "en"]


def _matching_case_for_language(scenario_id: str, language_code: str) -> dict[str, Any] | None:
    return next(
        (
            case
            for case in MULTILINGUAL_TEST_CASES
            if case["scenario_id"] == scenario_id and case["language_code"] == language_code
        ),
        None,
    )


def _gemini_prompt(question: str) -> str:
    db_lines = [
        f"{index}. id={case['scenario_id']} | domain={case['domain']} | question={case['query']}"
        for index, case in enumerate(_english_db_cases(), start=1)
    ]
    return (
        "You match farmer questions to a fixed agriculture question database.\n"
        "The farmer may ask in English, romanized Hindi, or another romanized Indic language.\n"
        "Choose the single closest DB question only if the DB really contains the same intent.\n"
        "If the DB does not contain a reliable match, return matched_question_id as null.\n\n"
        f"Farmer question:\n{question}\n\n"
        "DB questions:\n"
        + "\n".join(db_lines)
        + "\n\nReturn only JSON with this shape:\n"
        '{"matched_question_id": string|null, "confidence": 0-100, "reason": "short reason"}'
    )


def _extract_json_object(text: str) -> dict[str, Any]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            return json.loads(text[start : end + 1])
        raise


def _match_db_case_with_gemini(question: str) -> dict[str, Any] | None:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None

    model = os.getenv("GEMINI_MATCHER_MODEL", "gemini-2.5-flash").strip()
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={api_key}"
    )
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": _gemini_prompt(question)}
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0,
            "responseMimeType": "application/json",
        },
    }
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            body = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None

    try:
        text = body["candidates"][0]["content"]["parts"][0]["text"]
        parsed = _extract_json_object(text)
    except (KeyError, IndexError, TypeError, json.JSONDecodeError):
        return None

    matched_question_id = parsed.get("matched_question_id")
    confidence = int(parsed.get("confidence") or 0)
    matched_case = next(
        (
            case
            for case in _english_db_cases()
            if case["scenario_id"] == matched_question_id
        ),
        None,
    )
    if matched_case is None:
        fallback = _match_db_case(question)
        return {
            **fallback,
            "score": min(confidence, fallback["score"]),
            "matcher": "gemini",
            "gemini_reason": str(parsed.get("reason") or "Gemini returned no reliable DB match."),
            "gemini_no_match": True,
        }

    return {
        "case": matched_case,
        "score": max(0, min(100, confidence)),
        "matcher": "gemini",
        "gemini_reason": str(parsed.get("reason") or ""),
        "gemini_no_match": False,
    }


def _match_db_case(question: str) -> dict[str, Any]:
    query_tokens = _search_tokens(question)
    best_case = _english_db_cases()[0]
    best_score = -1.0
    query_domain = _domain_from_tokens(query_tokens)
    query_crops = query_tokens & CROP_HINTS
    query_pests = query_tokens & PEST_HINTS

    for case in _english_db_cases():
        db_tokens = _search_tokens(
            " ".join(
                [
                    case["query"],
                    case.get("domain", ""),
                    " ".join(case.get("expected_terms", [])),
                    case.get("expected_gdb_entry_id", ""),
                ]
            )
        )
        shared_tokens = query_tokens & db_tokens
        score = float(len(shared_tokens))

        shared_crops = query_crops & db_tokens
        score += len(shared_crops) * 5

        shared_pests = query_pests & db_tokens
        score += len(shared_pests) * 8

        if query_domain and case.get("domain") == query_domain:
            score += 4
        elif query_domain and case.get("domain") != query_domain:
            score -= 3

        if query_crops and not shared_crops:
            score -= 4

        if query_pests and case.get("domain") == "pest" and not shared_pests:
            score -= 8

        if score > best_score:
            best_case = case
            best_score = score

    confidence = min(100, max(0, round(best_score * 8)))
    return {
        "case": best_case,
        "score": confidence,
        "matcher": "deterministic",
        "gemini_reason": "",
        "gemini_no_match": False,
    }


def _match_db_case_optional_gemini(question: str) -> dict[str, Any]:
    return _match_db_case_with_gemini(question) or _match_db_case(question)


def _gemini_term_prompt(
    question: str,
    source_question: str,
    source_answer: str,
    generated_answer: str,
) -> str:
    return (
        "You are evaluating agricultural term consistency.\n"
        "Verified source is the matched DB question and matched DB answer.\n"
        "Check whether important crop names, pest/disease names, scheme names, "
        "fertilizer names, market terms, and location names from the verified "
        "source are preserved, translated, or transliterated correctly in the "
        "generated answer.\n"
        "Do not judge general answer quality. Only judge agriculture term consistency.\n\n"
        f"Farmer question:\n{question}\n\n"
        f"Matched DB question:\n{source_question or 'N/A'}\n\n"
        f"Matched DB answer:\n{source_answer or 'N/A'}\n\n"
        f"Generated answer:\n{generated_answer}\n\n"
        "Return only JSON:\n"
        '{"passed": true|false, "score": 0-100, "reason": "short reason"}'
    )


def _evaluate_terms_with_gemini(
    question: str,
    source_question: str,
    source_answer: str,
    generated_answer: str,
) -> dict[str, Any] | None:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key or not source_question.strip():
        return None

    model = os.getenv("GEMINI_MATCHER_MODEL", "gemini-2.5-flash").strip()
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={api_key}"
    )
    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": _gemini_term_prompt(
                            question,
                            source_question,
                            source_answer,
                            generated_answer,
                        )
                    }
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0,
            "responseMimeType": "application/json",
        },
    }
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            body = json.loads(response.read().decode("utf-8"))
        text = body["candidates"][0]["content"]["parts"][0]["text"]
        parsed = _extract_json_object(text)
        return {
            "passed": bool(parsed.get("passed")),
            "score": int(parsed.get("score") or 0),
            "reason": str(parsed.get("reason") or ""),
            "judge": "gemini",
        }
    except (
        urllib.error.URLError,
        TimeoutError,
        json.JSONDecodeError,
        KeyError,
        IndexError,
        TypeError,
        ValueError,
    ) as exc:
        return {
            "passed": None,
            "score": None,
            "reason": f"Gemini term judge unavailable: {exc}",
            "judge": "fallback",
        }


def _detect_language_code(question: str) -> str:
    script_counts = {
        language_code: sum(
            1 for char in question if start <= ord(char) <= end
        )
        for language_code, (start, end) in SCRIPT_RANGES.items()
    }
    script_match = max(script_counts, key=script_counts.get)
    if script_counts[script_match] > 0:
        return script_match

    words = set(re.findall(r"[a-zA-Z]+", question.lower()))
    romanized_scores = {
        language_code: len(words & hints)
        for language_code, hints in ROMANIZED_LANGUAGE_HINTS.items()
    }
    romanized_match = max(romanized_scores, key=romanized_scores.get)
    if romanized_scores[romanized_match] > 0:
        return romanized_match

    return "en"


def _has_native_indic_script(question: str) -> bool:
    return any(
        start <= ord(char) <= end
        for char in question
        for start, end in SCRIPT_RANGES.values()
    )


def _case_from_request(body: AskRequest) -> dict[str, Any]:
    language_code = _detect_language_code(body.question)
    language = LANGUAGES[language_code]
    romanized_input = language_code != "en" and not _has_native_indic_script(body.question)
    match = _match_db_case_optional_gemini(body.question)
    matched_english_case = match["case"]
    matched_language_case = _matching_case_for_language(
        matched_english_case["scenario_id"], language_code
    )
    confident_match = match["score"] >= 40
    mock_answer = (
        (matched_language_case or {}).get("mock_answer_text")
        or MOCK_DASHBOARD_ANSWERS[language_code]
    )
    expected_script = language["script"]
    expected_disclaimer_marker = DISCLAIMER_TERMS[language_code]
    if romanized_input:
        mock_answer = ROMANIZED_DOMAIN_MOCK_ANSWERS.get(
            matched_english_case["domain"], {}
        ).get(language_code, mock_answer)
        expected_script = "Latin"
        expected_disclaimer_marker = ROMANIZED_DISCLAIMER_TERMS[language_code]
    if not confident_match:
        mock_answer = (
            ROMANIZED_NO_CONFIDENT_MATCH_ANSWERS[language_code]
            if romanized_input
            else NO_CONFIDENT_MATCH_ANSWERS[language_code]
        )
    return {
        "name": "dashboard_probe",
        "scenario_id": matched_english_case["scenario_id"]
        if confident_match
        else "unmatched_db_coverage_gap",
        "query": body.question,
        "language_code": language_code,
        "language": f"Romanized {language['name']}" if romanized_input else language["name"],
        "input_style": "romanized" if romanized_input else "native",
        "expected_language": f"Romanized {language['name']}" if romanized_input else language["name"],
        "expected_script": expected_script,
        "domain": matched_english_case["domain"] if confident_match else "unmatched",
        "expected_domain": matched_english_case["domain"] if confident_match else "unmatched",
        "expected_tools": matched_english_case.get("expected_tools", []),
        "expected_gdb_entry_id": matched_english_case.get("expected_gdb_entry_id", ""),
        "matched_db_question": matched_english_case["query"] if confident_match else "",
        "closest_db_question": matched_english_case["query"],
        "matched_db_answer": matched_english_case.get("mock_answer_text", ""),
        "expected_answer_text": mock_answer,
        "mock_answer_text": mock_answer,
        "match_score": match["score"],
        "matcher": match.get("matcher", "deterministic"),
        "matcher_reason": match.get("gemini_reason", ""),
        "confident_db_match": confident_match,
        "expect_2hr_disclaimer": True,
        "expected_disclaimer_marker": expected_disclaimer_marker,
        "mock_response_text": f"{mock_answer}\n\n{expected_disclaimer_marker}: mock evaluation response.",
        "mock_retrieved_gdb_entry_id": matched_english_case.get("expected_gdb_entry_id", "")
        if confident_match
        else "",
        "stable": False,
    }


def _checklist(language_quality: dict[str, Any]) -> list[dict[str, Any]]:
    language = language_quality.get("language") or "selected language"
    script = language_quality.get("expected_script") or "expected script"
    domain = language_quality.get("domain") or "selected domain"
    scenario_id = language_quality.get("scenario_id") or "manual question"
    term_judge = language_quality.get("agricultural_term_judge", "deterministic")
    term_score = language_quality.get("agricultural_term_score")
    term_reason = language_quality.get("agricultural_term_reason")
    term_judge_text = (
        f"Gemini judged agricultural terms with score {term_score}/100. Reason: {term_reason}"
        if term_judge == "gemini"
        else "Deterministic fallback checked configured agricultural term markers."
    )
    checks = [
        {
            "label": "DB question matching",
            "key": "db_match_pass",
            "passed": (
                "What it checks: verifies that the farmer question was mapped "
                "to one of the 30 English DB reference questions even when the "
                "wording is different. "
                f"How it passed: the closest DB question matched scenario "
                f"'{scenario_id}'."
            ),
            "failed": (
                "What it checks: verifies that the farmer question was mapped "
                "to one of the 30 English DB reference questions even when the "
                "wording is different. "
                "How it failed: no reliable DB question match was found."
            ),
        },
        {
            "label": "Response language",
            "key": "answer_language_pass",
            "passed": (
                "What it checks: verifies that the generated answer is written "
                f"in the expected language/script for the selected query. "
                f"How it passed: the answer text is dominated by {script} script, "
                f"which matches {language}."
            ),
            "failed": (
                "What it checks: verifies that the generated answer is written "
                f"in the expected language/script for the selected query. "
                f"How it failed: the answer did not look like {language}/{script}."
            ),
        },
        {
            "label": "Disclaimer localization",
            "key": "disclaimer_language_pass",
            "passed": (
                "What it checks: verifies that the required expert/disclaimer "
                "message is localized instead of appearing only in English. "
                f"How it passed: the expected disclaimer marker for {language} "
                "was found in the answer."
            ),
            "failed": (
                "What it checks: verifies that the required expert/disclaimer "
                "message is localized instead of appearing only in English. "
                "How it failed: the localized expert/disclaimer marker was missing."
            ),
        },
        {
            "label": "Mixed-language detection",
            "key": "language_switching_pass",
            "passed": (
                "What it checks: detects whether the answer suddenly switches "
                "between unrelated Indian scripts/languages mid-response. "
                "How it passed: no unexpected script mixing was detected, so "
                "the response stayed language-consistent."
            ),
            "failed": (
                "What it checks: detects whether the answer suddenly switches "
                "between unrelated Indian scripts/languages mid-response. "
                "How it failed: unexpected script mixing was detected."
            ),
        },
        {
            "label": "GDB retrieval check",
            "key": "gdb_entry_pass",
            "passed": (
                "What it checks: verifies that the answer used the expected "
                "Golden DB entry when the test case declares one. "
                f"How it passed: the retrieval condition matched for scenario "
                f"'{scenario_id}', or this question did not require a specific "
                "GDB entry."
            ),
            "failed": (
                "What it checks: verifies that the answer used the expected "
                "Golden DB entry when the test case declares one. "
                "How it failed: the retrieved Golden DB entry did not match "
                "the expected entry."
            ),
        },
        {
            "label": "Agricultural term coverage",
            "key": "term_translation_pass",
            "passed": (
                "What it checks: verifies that important crop, pest, scheme, "
                "market, or fertilizer terms are preserved, translated, or "
                "transliterated consistently. "
                f"How it passed: {term_judge_text}"
            ),
            "failed": (
                "What it checks: verifies that important crop, pest, scheme, "
                "market, or fertilizer terms are preserved, translated, or "
                "transliterated consistently. "
                f"How it failed: {term_judge_text}"
            ),
        },
    ]
    reason = language_quality.get("language_quality_reason", "")
    return [
        {
            "label": check["label"],
            "passed": bool(language_quality.get(check["key"], True)),
            "description": check["passed"]
            if language_quality.get(check["key"], True)
            else f"{check['failed']} {reason or 'Review this answer manually.'}",
        }
        for check in checks
    ]


def _response_text(result: dict[str, Any], mode: str) -> str:
    response = str(result.get("response_text") or "").strip()
    if response:
        return response
    if mode == "live":
        error = str(result.get("error") or "").strip()
        if error:
            return (
                "Live mode did not return an answer. "
                "The evaluation dashboard is still working, but the live backend "
                f"returned this error: {error}"
            )
        return (
            "Live mode did not return an answer. Check LIVE_API_URL, ASSISTANT_ID, "
            "and whether the local AjraSakha backend is running."
        )
    return "Mock mode did not return an answer."


def _mock_index_readiness() -> dict[str, Any]:
    required = [
        {
            "collection": index.collection,
            "name": index.name,
            "kind": index.kind,
            "exists": True,
        }
        for index in REQUIRED_INDEXES
    ]
    collections: dict[str, list[str]] = {}
    for index in REQUIRED_INDEXES:
        collections.setdefault(index.collection, []).append(index.name)

    return {
        "mode": "mock",
        "database": "agriai",
        "env": golden_index_env_values(),
        "collections": collections,
        "required_indexes": required,
        "ready": True,
        "missing_indexes": [],
        "note": "Mock index readiness is simulated for local interface demos.",
    }


def _mock_index_creation() -> dict[str, Any]:
    return {
        "mode": "mock",
        "database": "agriai",
        "created": [
            {"collection": index.collection, "name": index.name}
            for index in REQUIRED_INDEXES
        ],
        "skipped_existing": [],
        "note": "Mock mode does not modify MongoDB Atlas.",
    }


def _mock_db_rows() -> list[dict[str, Any]]:
    return [
        {
            "scenario_id": case["scenario_id"],
            "domain": case["domain"],
            "language_code": case["language_code"],
            "language": case["language"],
            "question": case["query"],
            "answer": case.get("mock_answer_text") or case.get("expected_answer_text") or "",
            "expected_tools": case.get("expected_tools", []),
            "expected_gdb_entry_id": case.get("expected_gdb_entry_id", ""),
        }
        for case in MULTILINGUAL_TEST_CASES
        if case["language_code"] == "en"
    ]


def _romanized_examples() -> dict[str, str]:
    examples: dict[str, str] = {}
    for case in ROMANIZED_INPUT_TEST_CASES:
        examples.setdefault(case["language_code"], case["query"])
    return examples


app = FastAPI(title="AjraSakha Multilingual Evaluation Dashboard")


@app.get("/", response_class=HTMLResponse)
async def dashboard() -> str:
    return DASHBOARD_HTML


@app.get("/recommendations", response_class=HTMLResponse)
async def recommendations_page() -> str:
    return RECOMMENDATIONS_HTML


@app.get("/db", response_class=HTMLResponse)
async def mock_db_page() -> str:
    return DB_HTML


@app.get("/api/languages")
async def languages() -> dict[str, Any]:
    return {"languages": LANGUAGES}


@app.get("/api/mock-db")
async def mock_db() -> dict[str, Any]:
    rows = _mock_db_rows()
    return {"total": len(rows), "rows": rows}


@app.get("/api/romanized-examples")
async def romanized_examples() -> dict[str, Any]:
    return {"examples": _romanized_examples()}


@app.post("/api/ask")
async def ask(body: AskRequest) -> dict[str, Any]:
    case = _case_from_request(body)
    result = run_mock_case(case) if body.mode == "mock" else run_live_case(case)
    result = {**result, "response_text": _response_text(result, body.mode)}
    language_quality = evaluate_language_quality(result, case)
    language_quality["db_match_pass"] = bool(case.get("matched_db_question")) and case.get("match_score", 0) >= 40
    term_judge = _evaluate_terms_with_gemini(
        question=body.question,
        source_question=case.get("matched_db_question", ""),
        source_answer=case.get("matched_db_answer", ""),
        generated_answer=result.get("response_text", ""),
    )
    if term_judge and term_judge.get("passed") is not None:
        language_quality["term_translation_pass"] = bool(term_judge["passed"])
        language_quality["agricultural_term_score"] = term_judge["score"]
        language_quality["agricultural_term_reason"] = term_judge["reason"]
        language_quality["agricultural_term_judge"] = term_judge["judge"]
    mock_deepeval = evaluate_answer_with_mock_deepeval(
        query=body.question,
        answer=result.get("response_text", ""),
        context=[
            value
            for value in [
                case.get("matched_db_question", ""),
                case.get("matched_db_answer", ""),
                case.get("expected_answer_text", ""),
                case.get("mock_answer_text", ""),
            ]
            if value
        ],
    )
    combined = {**result, **language_quality}
    recommendation = build_language_quality_recommendations_markdown(
        build_language_quality_recommendations([combined])
    )

    return {
        "mode": body.mode,
        "query": body.question,
        "detected_language_code": case["language_code"],
        "language": language_quality.get("language"),
        "matched_db_question": case.get("matched_db_question", ""),
        "closest_db_question": case.get("closest_db_question", ""),
        "matched_db_answer": case.get("matched_db_answer", ""),
        "match_score": case.get("match_score", 0),
        "matcher": case.get("matcher", "deterministic"),
        "matcher_reason": case.get("matcher_reason", ""),
        "confident_db_match": case.get("confident_db_match", False),
        "expected_gdb_entry_id": case.get("expected_gdb_entry_id", ""),
        "observed_gdb_entry_id": result.get("observed_gdb_entry_id", ""),
        "gdb_entry_pass": language_quality.get("gdb_entry_pass", False),
        "agricultural_term_judge": term_judge,
        "deepeval_metrics": mock_deepeval,
        "deepeval_metric_labels": DEEPEVAL_METRIC_LABELS,
        "response_text": result.get("response_text", ""),
        "checklist": _checklist(language_quality),
        "language_quality": language_quality,
        "recommendation_markdown": recommendation,
    }


@app.get("/api/indexes")
async def indexes(mode: str = Query("mock", pattern="^(mock|live)$")) -> dict[str, Any]:
    if mode == "mock":
        return _mock_index_readiness()
    try:
        return golden_index_readiness()
    except Exception as exc:  # pragma: no cover - depends on local credentials.
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/indexes/create")
async def create_indexes(mode: str = Query("mock", pattern="^(mock|live)$")) -> dict[str, Any]:
    if mode == "mock":
        return _mock_index_creation()
    try:
        return create_required_search_indexes()
    except Exception as exc:  # pragma: no cover - depends on Atlas permissions.
        raise HTTPException(status_code=503, detail=str(exc)) from exc


DASHBOARD_HTML = """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AjraSakha Multilingual Evaluation</title>
  <style>
    :root {
      color-scheme: light;
      --bg:#eef3f0; --panel:#ffffff; --ink:#13221c; --muted:#5f6f67;
      --line:#d5dfd9; --soft:#f7faf8; --accent:#0c6f87; --accent-2:#247a4b;
      --ok:#157347; --bad:#b42318; --warn:#9a5b13; --shadow:0 14px 32px rgba(20,40,31,.08);
    }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color:var(--ink); background:var(--bg); }
    header { background:#ffffff; border-bottom:1px solid var(--line); }
    .topbar { max-width:1220px; margin:0 auto; padding:18px 24px; display:flex; align-items:center; justify-content:space-between; gap:16px; }
    .brand { display:flex; align-items:center; gap:12px; }
    .mark { width:38px; height:38px; border-radius:8px; background:#0c6f87; color:#fff; display:grid; place-items:center; font-weight:800; }
    h1 { margin:0; font-size:21px; letter-spacing:0; line-height:1.2; }
    .subtitle { margin-top:3px; color:var(--muted); font-size:13px; }
    nav { display:flex; gap:10px; align-items:center; }
    nav a { color:var(--accent); text-decoration:none; font-weight:700; border:1px solid var(--line); padding:8px 10px; border-radius:6px; background:#fff; }
    .db-icon-link { width:40px; height:40px; padding:0; display:grid; place-items:center; }
    .db-icon { width:21px; height:24px; border:2px solid var(--accent); border-top:0; border-radius:0 0 8px 8px; position:relative; }
    .db-icon::before, .db-icon::after { content:""; position:absolute; left:-2px; width:21px; height:8px; border:2px solid var(--accent); border-radius:50%; background:#fff; }
    .db-icon::before { top:-5px; }
    .db-icon::after { top:8px; border-top:0; border-left-color:transparent; border-right-color:transparent; border-bottom-color:var(--accent); background:transparent; }
    main { max-width:1220px; margin:0 auto; padding:22px 24px 34px; display:grid; gap:18px; }
    .workspace { display:grid; grid-template-columns:minmax(330px, .82fr) minmax(430px, 1.18fr); gap:18px; align-items:start; }
    section { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:18px; box-shadow:var(--shadow); }
    h2 { margin:0 0 14px; font-size:16px; line-height:1.25; }
    label { display:block; margin:14px 0 6px; color:var(--muted); font-size:13px; font-weight:650; }
    textarea, select { width:100%; border:1px solid var(--line); border-radius:6px; padding:11px 12px; font:inherit; background:#fff; color:var(--ink); }
    textarea { min-height:145px; resize:vertical; line-height:1.45; }
    .controls { display:grid; grid-template-columns:1fr; gap:12px; }
    .actions { display:flex; gap:10px; flex-wrap:wrap; margin-top:16px; }
    button { border:0; border-radius:6px; padding:10px 14px; background:var(--accent); color:#fff; font-weight:750; cursor:pointer; min-height:40px; }
    button.secondary { background:#eef6f2; color:#17382a; border:1px solid #cce0d5; }
    button.ghost { background:#fff; color:var(--accent); border:1px solid var(--line); }
    .status { margin:12px 0 0; color:var(--muted); font-size:13px; min-height:20px; }
    .answer { white-space:pre-wrap; min-height:118px; padding:14px; background:var(--soft); border:1px solid var(--line); border-radius:8px; line-height:1.5; }
    .match-box { margin-top:12px; padding:12px; border:1px solid #cce0d5; border-radius:8px; background:#f3fbf6; }
    .match-box strong { display:block; font-size:13px; margin-bottom:4px; }
    .match-box .gdb-title { margin-top:10px; }
    .match-box div { color:var(--muted); font-size:13px; line-height:1.45; }
    .metric-grid { display:grid; grid-template-columns:1fr; gap:10px; }
    .metric { border:1px solid var(--line); border-radius:8px; padding:12px; background:#fff; }
    .metric.pass { border-color:#b9dac7; background:#f3fbf6; }
    .metric.fail { border-color:#efc6c1; background:#fff7f6; }
    .metric-head { display:flex; justify-content:space-between; gap:10px; align-items:center; margin-bottom:5px; }
    .metric-head strong { font-size:14px; }
    .score { font-size:12px; font-weight:800; color:var(--accent); }
    .result-head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }
    .badge { border-radius:999px; padding:5px 9px; background:#eef6f2; color:#17523a; font-size:12px; font-weight:750; border:1px solid #cae0d3; }
    .checks { display:grid; grid-template-columns:1fr; gap:10px; margin-top:12px; }
    .check { display:flex; gap:10px; align-items:flex-start; padding:13px; border:1px solid var(--line); border-radius:8px; background:#fff; min-height:78px; }
    .check.pass { border-color:#b9dac7; background:#f3fbf6; }
    .check.fail { border-color:#efc6c1; background:#fff7f6; }
    .dot { width:22px; height:22px; border-radius:50%; display:grid; place-items:center; color:#fff; font-size:13px; font-weight:800; flex:0 0 auto; }
    .pass .dot { background:var(--ok); }
    .fail .dot { background:var(--bad); }
    .check strong { display:block; font-size:14px; margin-bottom:3px; }
    .reason { color:var(--muted); font-size:13px; margin-top:3px; line-height:1.45; }
    .report-grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
    .report-box { white-space:pre-wrap; background:#101715; color:#e9f4ee; border-radius:8px; padding:14px; overflow:auto; min-height:180px; font-size:12px; line-height:1.55; }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    th, td { text-align:left; padding:10px; border-bottom:1px solid var(--line); }
    th { color:var(--muted); font-size:12px; }
    .small { color:var(--muted); font-size:12px; }
    .notice { margin-top:14px; padding:11px 12px; border-radius:8px; border:1px solid #ead6ad; background:#fff8eb; color:#62410f; font-size:13px; line-height:1.4; }
    @media (max-width:900px) { .workspace, .report-grid, .controls { grid-template-columns:1fr; } .topbar { align-items:flex-start; flex-direction:column; } }
  </style>
</head>
<body>
  <header>
    <div class="topbar">
      <div class="brand">
        <div class="mark">A</div>
        <div>
          <h1>AjraSakha Multilingual Evaluation</h1>
          <div class="subtitle">Manual question probe, language-quality checklist, mock index readiness, and recommendations.</div>
        </div>
      </div>
      <nav><a class="db-icon-link" href="/db" title="Open 30 English test-case DB" aria-label="Open 30 English test-case DB"><span class="db-icon"></span></a><a href="/recommendations">Recommendations</a></nav>
    </div>
  </header>
  <main>
    <div class="workspace">
      <section>
        <h2>Ask A Question</h2>
        <label for="question">Farmer question</label>
        <textarea id="question" placeholder="Type a farmer question in English, native script, or romanized Indic text."></textarea>
        <div class="controls">
          <div>
            <label for="mode">Evaluation mode</label>
            <select id="mode">
              <option value="mock">Mock</option>
              <option value="live">Live</option>
            </select>
          </div>
        </div>
        <div class="actions">
          <button id="ask">Run Evaluation</button>
        </div>
        <div class="notice">Mock mode is for framework validation and demo. Romanized input means a farmer types an Indic language with English keyboard letters.</div>
        <p class="status" id="status">Ready. Mock mode does not require credentials.</p>
      </section>

      <section>
        <div class="result-head">
          <h2>Answer And Checklist</h2>
          <span class="badge" id="resultBadge">Not run</span>
        </div>
        <div class="answer" id="answer">Run an evaluation to see the answer.</div>
        <div class="match-box" id="matchBox" hidden>
          <strong>Matched DB Question</strong>
          <div id="matchedQuestion"></div>
          <strong class="gdb-title">GDB Retrieval Proof</strong>
          <div id="gdbProof"></div>
        </div>
        <div class="checks" id="checks"></div>
      </section>
    </div>

    <div class="report-grid">
      <section>
        <h2>Human Readable Report</h2>
        <div id="humanReport" class="report-box">No report yet.</div>
      </section>
      <section>
        <h2>Mock DeepEval Semantic Metrics</h2>
        <div class="small">Mock mode uses deterministic DeepEval-compatible metrics without external API keys.</div>
        <div id="deepevalMetrics" class="metric-grid"></div>
      </section>
    </div>
  </main>
  <script>
    const statusEl = document.getElementById("status");
    const answerEl = document.getElementById("answer");
    const matchBoxEl = document.getElementById("matchBox");
    const matchedQuestionEl = document.getElementById("matchedQuestion");
    const gdbProofEl = document.getElementById("gdbProof");
    const checksEl = document.getElementById("checks");
    const humanReportEl = document.getElementById("humanReport");
    const deepevalMetricsEl = document.getElementById("deepevalMetrics");
    const resultBadge = document.getElementById("resultBadge");
    const askButton = document.getElementById("ask");

    function renderChecks(checks) {
      checksEl.innerHTML = "";
      checks.forEach((check) => {
        const div = document.createElement("div");
        div.className = "check " + (check.passed ? "pass" : "fail");
        const dot = document.createElement("span");
        dot.className = "dot";
        dot.textContent = check.passed ? "✓" : "!";
        const content = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = `${check.passed ? "Passed" : "Needs review"}: ${check.label}`;
        const reason = document.createElement("div");
        reason.className = "reason";
        reason.textContent = check.description || "";
        content.appendChild(title);
        content.appendChild(reason);
        div.appendChild(dot);
        div.appendChild(content);
        checksEl.appendChild(div);
      });
    }

    function readableReport(data) {
      const passed = (data.checklist || []).filter((item) => item.passed).length;
      const total = (data.checklist || []).length;
      const deepevalLines = Object.entries(data.deepeval_metrics || {}).map(([key, metric]) => {
        const label = (data.deepeval_metric_labels || {})[key] || key;
        return `- ${metric.passed ? "PASS" : "FAIL"}: ${label} - score ${metric.score}/100 - ${metric.reason}`;
      });
      return [
        `Mode: ${data.mode}`,
        `Detected language: ${data.language}`,
        `Question: ${data.query}`,
        `Matcher: ${data.matcher || "deterministic"}`,
        `Matched DB question: ${data.matched_db_question || "N/A"}`,
        `Match score: ${data.match_score || 0}%`,
        `Expected GDB ID: ${data.expected_gdb_entry_id || "N/A"}`,
        `Observed GDB ID: ${data.observed_gdb_entry_id || "N/A"}`,
        `GDB retrieval passed: ${data.gdb_entry_pass}`,
        `Agricultural term judge: ${(data.agricultural_term_judge || {}).judge || "deterministic"}`,
        `Agricultural term reason: ${(data.agricultural_term_judge || {}).reason || "N/A"}`,
        ``,
        `Overall: ${passed}/${total} checks passed`,
        ``,
        `Checklist:`,
        ...(data.checklist || []).map((item) => `- ${item.passed ? "PASS" : "FAIL"}: ${item.label} - ${item.description || ""}`),
        ``,
        `Mock DeepEval semantic metrics:`,
        ...deepevalLines,
      ].join("\\n");
    }

    function renderDeepEvalMetrics(data) {
      deepevalMetricsEl.innerHTML = "";
      const labels = data.deepeval_metric_labels || {};
      Object.entries(data.deepeval_metrics || {}).forEach(([key, metric]) => {
        const div = document.createElement("div");
        div.className = "metric " + (metric.passed ? "pass" : "fail");
        const head = document.createElement("div");
        head.className = "metric-head";
        const title = document.createElement("strong");
        title.textContent = `${metric.passed ? "Passed" : "Needs review"}: ${labels[key] || key}`;
        const score = document.createElement("span");
        score.className = "score";
        score.textContent = `${metric.score}/100`;
        const reason = document.createElement("div");
        reason.className = "reason";
        reason.textContent = `Reason: ${metric.reason}. Mode: ${metric.mode}.`;
        head.appendChild(title);
        head.appendChild(score);
        div.appendChild(head);
        div.appendChild(reason);
        deepevalMetricsEl.appendChild(div);
      });
    }

    askButton.addEventListener("click", async () => {
      const question = document.getElementById("question").value.trim();
      if (!question) {
        statusEl.textContent = "Enter a question before running evaluation.";
        resultBadge.textContent = "Needs input";
        answerEl.textContent = "No question entered.";
        return;
      }
      statusEl.textContent = "Running evaluation...";
      resultBadge.textContent = "Running";
      askButton.disabled = true;
      const payload = {
        question,
        mode: document.getElementById("mode").value,
      };
      try {
        const response = await fetch("/api/ask", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
        const data = await response.json();
        if (!response.ok) {
          const detail = Array.isArray(data.detail) ? data.detail.map((item) => item.msg).join("; ") : data.detail;
          statusEl.textContent = detail || "Request failed";
          resultBadge.textContent = "Failed";
          answerEl.textContent = detail || "The evaluation request failed.";
          return;
        }
        const hasNotes = data.language_quality && data.language_quality.language_quality_reason;
        const allPassed = (data.checklist || []).every((item) => item.passed);
        statusEl.textContent = hasNotes ? `Detected ${data.language}. Completed in ${data.mode} mode with review notes` : `Detected ${data.language}. Completed in ${data.mode} mode`;
        resultBadge.textContent = allPassed ? "All checks passed" : "Needs review";
        answerEl.textContent = data.response_text || "No answer text returned.";
        matchBoxEl.hidden = false;
        const matchScore = data.match_score || 0;
        const matcher = data.matcher === "gemini" ? "Gemini matcher" : "Deterministic fallback matcher";
        const matcherReason = data.matcher_reason ? ` Reason: ${data.matcher_reason}` : "";
        if (data.confident_db_match) {
          matchedQuestionEl.textContent = `${data.matched_db_question} (${matchScore}% confident match). ${matcher}.${matcherReason}`;
        } else {
          matchedQuestionEl.textContent = `No reliable DB match found. Closest weak candidate: ${data.closest_db_question || "N/A"} (${matchScore}% confidence). ${matcher}.${matcherReason}`;
        }
        const expectedGdb = data.expected_gdb_entry_id || "N/A";
        const observedGdb = data.observed_gdb_entry_id || "N/A";
        const gdbStatus = data.gdb_entry_pass ? "Passed" : "Needs review";
        gdbProofEl.textContent = `${gdbStatus}. Expected GDB ID: ${expectedGdb}. Observed GDB ID: ${observedGdb}.`;
        renderChecks(data.checklist || []);
        renderDeepEvalMetrics(data);
        humanReportEl.textContent = readableReport(data);
        localStorage.setItem("last_recommendation", data.recommendation_markdown || "");
      } catch (error) {
        statusEl.textContent = "Dashboard request failed. Check that the server is still running.";
        resultBadge.textContent = "Failed";
        answerEl.textContent = String(error);
      } finally {
        askButton.disabled = false;
      }
    });

  </script>
</body>
</html>
"""


RECOMMENDATIONS_HTML = """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AjraSakha Recommendations</title>
  <style>
    body { margin:0; font-family:Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color:#13221c; background:#eef3f0; }
    header { background:#fff; border-bottom:1px solid #d5dfd9; }
    .topbar { max-width:980px; margin:0 auto; padding:18px 24px; display:flex; justify-content:space-between; align-items:center; gap:12px; }
    a { color:#0c6f87; text-decoration:none; font-weight:750; border:1px solid #d5dfd9; border-radius:6px; padding:8px 10px; }
    main { max-width:980px; margin:0 auto; padding:24px; }
    section { background:#fff; border:1px solid #d5dfd9; border-radius:8px; padding:20px; box-shadow:0 14px 32px rgba(20,40,31,.08); }
    h1 { margin:0; font-size:21px; }
    pre { white-space:pre-wrap; margin:0; line-height:1.6; font:14px/1.6 ui-sans-serif, system-ui, sans-serif; }
  </style>
</head>
<body>
  <header><div class="topbar"><h1>Language Quality Recommendations</h1><div><a href="/">Evaluation</a><a href="/db">Test Case DB</a></div></div></header>
  <main><section><pre id="recommendations">No recommendations yet. Run an evaluation first.</pre></section></main>
  <script>
    document.getElementById("recommendations").textContent = localStorage.getItem("last_recommendation") || "No recommendations yet. Run an evaluation first.";
  </script>
</body>
</html>
"""


DB_HTML = """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AjraSakha Mock Golden DB</title>
  <style>
    :root {
      color-scheme: light;
      --bg:#eef3f0; --panel:#ffffff; --ink:#13221c; --muted:#5f6f67;
      --line:#d5dfd9; --soft:#f7faf8; --accent:#0c6f87; --ok:#157347;
      --shadow:0 14px 32px rgba(20,40,31,.08);
    }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color:var(--ink); background:var(--bg); }
    header { background:#fff; border-bottom:1px solid var(--line); }
    .topbar { max-width:1220px; margin:0 auto; padding:18px 24px; display:flex; align-items:center; justify-content:space-between; gap:16px; }
    .brand { display:flex; align-items:center; gap:12px; }
    .mark { width:38px; height:38px; border-radius:8px; background:#0c6f87; color:#fff; display:grid; place-items:center; font-weight:800; }
    h1 { margin:0; font-size:21px; line-height:1.2; }
    .subtitle { margin-top:3px; color:var(--muted); font-size:13px; }
    nav, .navlinks { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
    a { color:var(--accent); text-decoration:none; font-weight:750; border:1px solid var(--line); border-radius:6px; padding:8px 10px; background:#fff; }
    main { max-width:1220px; margin:0 auto; padding:22px 24px 34px; display:grid; gap:16px; }
    .stats { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:12px; }
    .stat { background:#fff; border:1px solid var(--line); border-radius:8px; padding:14px 16px; box-shadow:var(--shadow); }
    .stat span { color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.04em; }
    .stat strong { display:block; margin-top:6px; font-size:22px; }
    section { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:18px; box-shadow:var(--shadow); }
    .filters { display:grid; grid-template-columns:2fr 1fr; gap:12px; align-items:end; }
    label { display:block; margin:0 0 6px; color:var(--muted); font-size:13px; font-weight:650; }
    input, select { width:100%; border:1px solid var(--line); border-radius:6px; padding:10px 12px; font:inherit; background:#fff; color:var(--ink); }
    .small { color:var(--muted); font-size:12px; margin-top:10px; }
    .table-wrap { overflow:auto; border:1px solid var(--line); border-radius:8px; background:#fff; }
    table { width:100%; border-collapse:collapse; font-size:13px; min-width:980px; }
    th, td { text-align:left; vertical-align:top; padding:11px 12px; border-bottom:1px solid var(--line); }
    th { color:var(--muted); font-size:12px; background:#f7faf8; position:sticky; top:0; z-index:1; }
    tr:hover td { background:#fbfdfc; }
    .pill { display:inline-block; border:1px solid #cce0d5; background:#eef6f2; color:#17382a; border-radius:999px; padding:3px 8px; font-size:12px; font-weight:750; }
    .answer { line-height:1.45; max-width:420px; }
    .question { line-height:1.45; max-width:360px; font-weight:650; }
    .empty { padding:22px; color:var(--muted); text-align:center; }
    @media (max-width:900px) { .stats, .filters { grid-template-columns:1fr; } .topbar { align-items:flex-start; flex-direction:column; } }
  </style>
</head>
<body>
  <header>
    <div class="topbar">
      <div class="brand">
        <div class="mark">A</div>
        <div>
          <h1>Test Case DB</h1>
          <div class="subtitle">The 30 English farming scenarios used as the local demo database.</div>
        </div>
      </div>
      <nav><a href="/">Evaluation</a><a href="/recommendations">Recommendations</a></nav>
    </div>
  </header>
  <main>
    <div class="stats">
      <div class="stat"><span>Total Rows</span><strong id="totalRows">0</strong></div>
      <div class="stat"><span>Language</span><strong>English</strong></div>
      <div class="stat"><span>Scenarios</span><strong>30</strong></div>
      <div class="stat"><span>Source</span><strong>Cases</strong></div>
    </div>

    <section>
      <div class="filters">
        <div>
          <label for="search">Search question or answer</label>
          <input id="search" placeholder="Try cotton, mandi, rainfall, PM-KISAN..." />
        </div>
        <div>
          <label for="domain">Domain</label>
          <select id="domain">
            <option value="">All domains</option>
            <option value="weather">Weather</option>
            <option value="pest">Pest & Disease</option>
            <option value="soil">Soil & Fertilizer</option>
            <option value="market">Market</option>
            <option value="scheme">Government Schemes</option>
          </select>
        </div>
      </div>
      <div class="small" id="summary">Loading English test-case database rows...</div>
    </section>

    <section>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Domain</th>
              <th>Question</th>
              <th>Answer</th>
              <th>Expected GDB ID</th>
            </tr>
          </thead>
          <tbody id="rows"><tr><td colspan="4" class="empty">Loading...</td></tr></tbody>
        </table>
      </div>
    </section>
  </main>
  <script>
    const rowsEl = document.getElementById("rows");
    const totalRowsEl = document.getElementById("totalRows");
    const summaryEl = document.getElementById("summary");
    const searchEl = document.getElementById("search");
    const domainEl = document.getElementById("domain");
    let allRows = [];

    function cell(text, className) {
      const td = document.createElement("td");
      td.textContent = text || "";
      if (className) td.className = className;
      return td;
    }

    function render() {
      const query = searchEl.value.trim().toLowerCase();
      const domain = domainEl.value;
      const filtered = allRows.filter((row) => {
        const searchable = `${row.scenario_id} ${row.domain} ${row.language} ${row.question} ${row.answer} ${row.expected_gdb_entry_id}`.toLowerCase();
        return (!query || searchable.includes(query))
          && (!domain || row.domain === domain);
      });

      rowsEl.innerHTML = "";
      if (!filtered.length) {
        const tr = document.createElement("tr");
        const td = cell("No matching rows found.", "empty");
        td.colSpan = 4;
        tr.appendChild(td);
        rowsEl.appendChild(tr);
      } else {
        filtered.forEach((row) => {
          const tr = document.createElement("tr");
          const domainCell = cell("");
          const pill = document.createElement("span");
          pill.className = "pill";
          pill.textContent = row.domain;
          domainCell.appendChild(pill);
          tr.appendChild(domainCell);
          tr.appendChild(cell(row.question, "question"));
          tr.appendChild(cell(row.answer, "answer"));
          tr.appendChild(cell(row.expected_gdb_entry_id || "N/A"));
          rowsEl.appendChild(tr);
        });
      }
      summaryEl.textContent = `Showing ${filtered.length} of ${allRows.length} English test-case DB rows.`;
    }

    async function loadRows() {
      try {
        const response = await fetch("/api/mock-db");
        const data = await response.json();
        allRows = data.rows || [];
        totalRowsEl.textContent = String(data.total || allRows.length);
        render();
      } catch (error) {
        summaryEl.textContent = "Could not load English test-case database rows. Check that the dashboard server is running.";
        rowsEl.innerHTML = "";
        const tr = document.createElement("tr");
        const td = cell(String(error), "empty");
        td.colSpan = 4;
        tr.appendChild(td);
        rowsEl.appendChild(tr);
      }
    }

    searchEl.addEventListener("input", render);
    domainEl.addEventListener("change", render);
    loadRows();
  </script>
</body>
</html>
"""
