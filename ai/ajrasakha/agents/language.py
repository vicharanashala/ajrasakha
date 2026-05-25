"""Detect farmer query language and script for output matching."""

from __future__ import annotations

import logging
import re
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# 12 native Indian script Unicode ranges
_DEVANAGARI = re.compile(r"[\u0900-\u097F]")
_BENGALI_ASSAMESE = re.compile(r"[\u0980-\u09FF]")
_GURMUKHI = re.compile(r"[\u0A00-\u0A7F]")
_GUJARATI = re.compile(r"[\u0A80-\u0AFF]")
_ODIA = re.compile(r"[\u0B00-\u0B7F]")
_TAMIL = re.compile(r"[\u0B80-\u0BFF]")
_TELUGU = re.compile(r"[\u0C00-\u0C7F]")
_KANNADA = re.compile(r"[\u0C80-\u0CFF]")
_MALAYALAM = re.compile(r"[\u0D00-\u0DFF]")
_PERSO_ARABIC = re.compile(r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]")
_OL_CHIKI = re.compile(r"[\u1C50-\u1C7F]")
_MEITEI_MAYEK = re.compile(r"[\uABC0-\uABFF\uAAE0-\uAAFF]")


def detect_script(text: str) -> str:
    """Return the name of the detected script, defaulting to 'Latin'."""
    t = text or ""
    if _DEVANAGARI.search(t):
        return "Devanagari"
    if _BENGALI_ASSAMESE.search(t):
        return "Bengali-Assamese"
    if _GURMUKHI.search(t):
        return "Gurmukhi"
    if _GUJARATI.search(t):
        return "Gujarati"
    if _ODIA.search(t):
        return "Odia"
    if _TAMIL.search(t):
        return "Tamil"
    if _TELUGU.search(t):
        return "Telugu"
    if _KANNADA.search(t):
        return "Kannada"
    if _MALAYALAM.search(t):
        return "Malayalam"
    if _PERSO_ARABIC.search(t):
        return "Perso-Arabic"
    if _OL_CHIKI.search(t):
        return "Ol Chiki"
    if _MEITEI_MAYEK.search(t):
        return "Meitei Mayek"
    return "Latin"


# detect_script label → OFFICIAL_LANGUAGES name when script maps 1:1 to a language
_SCRIPT_TO_OFFICIAL_LANGUAGE: dict[str, str] = {
    "Telugu": "Telugu",
    "Tamil": "Tamil",
    "Kannada": "Kannada",
    "Malayalam": "Malayalam",
    "Odia": "Odia",
    "Gujarati": "Gujarati",
    "Gurmukhi": "Punjabi",
    "Ol Chiki": "Santali",
    "Meitei Mayek": "Manipuri (Meitei)",
}

_DEVANAGARI_VOCAL_LANGUAGES = frozenset(
    {
        "Hindi",
        "Marathi",
        "Nepali",
        "Sanskrit",
        "Konkani",
        "Maithili",
        "Bodo",
        "Dogri",
        "Kashmiri",
    }
)

_PERSO_ARABIC_VOCAL_LANGUAGES = frozenset({"Urdu", "Sindhi", "Kashmiri"})

_BENGALI_ASSAMESE_VOCAL_LANGUAGES = frozenset({"Bengali", "Assamese"})


def _coerce_official_language(name: str) -> str | None:
    """Case-insensitive match against OFFICIAL_LANGUAGES; None if unknown."""
    from ajrasakha.agents.translation_catalog import OFFICIAL_LANGUAGES

    raw = (name or "").strip()
    if not raw:
        return None
    lower = raw.lower()
    for lang in OFFICIAL_LANGUAGES:
        if lang.lower() == lower:
            return lang
    return None


def resolve_planner_language_pair(
    farmer_text: str,
    vocal_language: str,
    script_language: str,
) -> tuple[str, str]:
    """Normalize planner vocal/script using Unicode script on the raw farmer message.

    Roman/Latin typing → script_language=English, vocal unchanged (if valid).
    Native script blocks → script_language aligns with detected script (vocal matched).
    """
    detected = detect_script(farmer_text or "")
    vocal = _coerce_official_language(vocal_language) or "English"
    script = _coerce_official_language(script_language) or "English"

    if detected == "Latin":
        return vocal, "English"

    if detected == "Devanagari":
        script_out = vocal if vocal in _DEVANAGARI_VOCAL_LANGUAGES else "Hindi"
        return vocal, script_out

    if detected == "Perso-Arabic":
        if vocal in _PERSO_ARABIC_VOCAL_LANGUAGES:
            return vocal, vocal
        return "Urdu", "Urdu"

    if detected == "Bengali-Assamese":
        if vocal in _BENGALI_ASSAMESE_VOCAL_LANGUAGES:
            return vocal, vocal
        return "Bengali", "Bengali"

    official = _SCRIPT_TO_OFFICIAL_LANGUAGE.get(detected)
    if official:
        return official, official

    logger.warning(
        "resolve_planner_language_pair: unknown detect_script=%s — keeping planner pair (%s, %s)",
        detected,
        vocal,
        script,
    )
    return vocal, script


def _llm_detect_language(text: str) -> str:
    """Analyze the text and return the underlying spoken language name (e.g. Hindi, English, Punjabi)."""
    t = (text or "").strip()
    if not t:
        return "English"
    try:
        from langchain_anthropic import ChatAnthropic
        from ajrasakha.agents.config import CLAUDE_MODEL
        llm = ChatAnthropic(model=CLAUDE_MODEL)
        
        prompt = (
            "Analyze the following text from an Indian farmer and identify the underlying spoken language. "
            "Even if the text is written in English/Latin alphabets, identify the spoken language (e.g., if the text is "
            "'Mera sawal gehu ke baare me hai', the underlying language is Hindi, not English).\n\n"
            "Spoken languages include: English, Hindi, Punjabi, Bengali, Assamese, Gujarati, Odia, Tamil, Telugu, Kannada, Malayalam, Urdu, Kashmiri, Sindhi, Santali, Manipuri.\n\n"
            "Return ONLY the language name as a single word (e.g., 'Hindi', 'English', 'Punjabi', 'Tamil'). Do not include any other text, reasoning, or punctuation.\n\n"
            f"Text: {t}\n"
            "Language:"
        )
        
        response = llm.invoke(prompt)
        lang = str(response.content).strip()
        
        known_languages = [
            "Hindi", "English", "Punjabi", "Bengali", "Assamese", "Gujarati", 
            "Odia", "Tamil", "Telugu", "Kannada", "Malayalam", "Urdu", 
            "Kashmiri", "Sindhi", "Santali", "Manipuri"
        ]
        
        # Check if any known language name is contained as a standalone word
        for l in known_languages:
            if re.search(rf"\b{l}\b", lang, re.IGNORECASE):
                return l
                
        # Clean up any non-alphabetic characters as a fallback
        lang_title = lang.title()
        cleaned = re.sub(r'[^a-zA-Z-]', '', lang_title)
        return cleaned if cleaned else "English"
    except Exception as e:
        logger.warning("LLM language detection failed with exception: %s", e, exc_info=True)
        return "English"


async def _allm_detect_language(text: str) -> str:
    """Analyze the text and return the underlying spoken language name asynchronously."""
    t = (text or "").strip()
    if not t:
        return "English"
    try:
        from langchain_anthropic import ChatAnthropic
        from ajrasakha.agents.config import CLAUDE_MODEL
        llm = ChatAnthropic(model=CLAUDE_MODEL)
        
        prompt = (
            "Analyze the following text from an Indian farmer and identify the underlying spoken language. "
            "Even if the text is written in English/Latin alphabets, identify the spoken language (e.g., if the text is "
            "'Mera sawal gehu ke baare me hai', the underlying language is Hindi, not English).\n\n"
            "Spoken languages include: English, Hindi, Punjabi, Bengali, Assamese, Gujarati, Odia, Tamil, Telugu, Kannada, Malayalam, Urdu, Kashmiri, Sindhi, Santali, Manipuri.\n\n"
            "Return ONLY the language name as a single word (e.g., 'Hindi', 'English', 'Punjabi', 'Tamil'). Do not include any other text, reasoning, or punctuation.\n\n"
            f"Text: {t}\n"
            "Language:"
        )
        
        response = await llm.ainvoke(prompt)
        lang = str(response.content).strip()
        
        known_languages = [
            "Hindi", "English", "Punjabi", "Bengali", "Assamese", "Gujarati", 
            "Odia", "Tamil", "Telugu", "Kannada", "Malayalam", "Urdu", 
            "Kashmiri", "Sindhi", "Santali", "Manipuri"
        ]
        
        # Check if any known language name is contained as a standalone word
        for l in known_languages:
            if re.search(rf"\b{l}\b", lang, re.IGNORECASE):
                return l
                
        # Clean up any non-alphabetic characters as a fallback
        lang_title = lang.title()
        cleaned = re.sub(r'[^a-zA-Z-]', '', lang_title)
        return cleaned if cleaned else "English"
    except Exception as e:
        logger.warning("Async LLM language detection failed with exception: %s", e, exc_info=True)
        return "English"


async def adetect_farmer_language(text: str) -> str:
    """Asynchronously return a display label representing the script and language used."""
    t = (text or "").strip()
    if not t:
        return "English"
        
    script = detect_script(t)
    lang = await _allm_detect_language(t)
    
    if script == "Latin":
        if lang == "English":
            return "English"
        if lang == "Hindi":
            return "Hinglish"
        return f"Romanized {lang}"
    else:
        return lang


def detect_farmer_language(text: str) -> str:
    """
    Return a display label representing the script and language used.
    If script is Latin:
        - underlying language English -> "English"
        - underlying language Hindi -> "Hinglish"
        - other Indian language -> e.g. "Romanized Punjabi", "Romanized Tamil"
    If script is native (e.g. Devanagari):
        - returns the exact spoken language (e.g. "Hindi", "Marathi")
    """
    t = (text or "").strip()
    if not t:
        return "English"
        
    script = detect_script(t)
    lang = _llm_detect_language(t)
    
    if script == "Latin":
        if lang == "English":
            return "English"
        if lang == "Hindi":
            return "Hinglish"
        return f"Romanized {lang}"
    else:
        return lang


def text_matches_user_language(answer: str, user_message: str) -> bool:
    """True when answer script aligns with the farmer's message."""
    user_script = detect_script(user_message)
    answer_script = detect_script(answer)
    
    if user_script == "Latin":
        # Latin input requires Latin output (no native script characters of the 12 scripts)
        return answer_script == "Latin"
    else:
        # Native script input requires output in that exact native script
        return answer_script == user_script


def language_directive_for_synthesis(
    vocal_language: str,
    script_language: Optional[str] = None,
    *,
    lang_label: Optional[str] = None,
) -> str:
    """Force synthesizer to emit English body; translation uses vocal + script from plan."""
    if lang_label is not None and script_language is None:
        from ajrasakha.agents.translation_catalog import synthesis_lang_label
        return _language_directive_legacy_label(lang_label)

    from ajrasakha.agents.translation_catalog import synthesis_lang_label

    script = (script_language or vocal_language or "English").strip()
    vocal = (vocal_language or "English").strip()
    label = synthesis_lang_label(script, vocal)
    return (
        "OUTPUT CONTRACT (NON-NEGOTIABLE):\n"
        "Write ONLY the farming answer body in clear English.\n"
        "Translate all tool facts into English in the body.\n"
        "Do NOT add sources, testing disclaimers, 2-hour expert-queue text, or footers.\n"
        f"A later step will deliver the answer to the farmer in vocal language {vocal} "
        f"using script {script} (display label: {label})."
    )


def _language_directive_legacy_label(lang_label: str) -> str:
    """System text that forces the synthesizer to match the farmer's language and script."""
    
    if lang_label == "English":
        return (
            "REQUIRED OUTPUT LANGUAGE: English (NON-NEGOTIABLE)\n"
            "The farmer wrote in English. Your ENTIRE reply must be in English only.\n"
            "Tool results (GDB, reviewer, weather, etc.) may be in Hindi or mixed languages — "
            "you MUST translate every fact into English before answering.\n"
            "Do NOT use Devanagari or Hindi sentences. Technical terms may stay as standard "
            "English agrochemical names (e.g. Chlorantraniliprole).\n"
            "The testing disclaimer at the end may stay as provided in English."
        )
        
    if lang_label == "Hinglish":
        return (
            "REQUIRED OUTPUT LANGUAGE: Hindi in Latin Script (Hinglish/Romanized Hindi) (NON-NEGOTIABLE)\n"
            "The farmer wrote in Hinglish. Your ENTIRE reply must be in Hindi language but written in the Latin alphabet (Hinglish/Romanized Hindi).\n"
            "Do NOT use Devanagari script. Do NOT use English sentences.\n"
            "Every sentence must be Hindi written in English letters.\n"
            "Example: Instead of 'आप यूरिया का उपयोग कर सकते हैं' (Devanagari) or 'You can use Urea' (English), "
            "write 'Aap Urea ka upyog kar sakte hain' (Hinglish).\n"
            "Technical terms may stay as standard English names (e.g., Urea, Chlorantraniliprole).\n"
            "Ensure the testing disclaimer at the end is also written in Hinglish."
        )
        
    if lang_label.startswith("Romanized "):
        clean_lang = lang_label.replace("Romanized ", "").strip()
        return (
            f"REQUIRED OUTPUT LANGUAGE: {clean_lang} in Latin Script (Romanized {clean_lang}) (NON-NEGOTIABLE)\n"
            f"The farmer wrote in Romanized {clean_lang}. Your ENTIRE reply must be in {clean_lang} language but written in the Latin alphabet (Romanized {clean_lang}).\n"
            f"Do NOT use native scripts. Do NOT use English sentences.\n"
            f"Every sentence must be {clean_lang} written in English letters.\n"
            f"Technical terms may stay as standard English names.\n"
            f"Ensure the testing disclaimer at the end is also written in Romanized {clean_lang}."
        )
        
    # Native script languages (e.g. Hindi, Punjabi, Tamil, etc.)
    return (
        f"REQUIRED OUTPUT LANGUAGE: {lang_label} (NON-NEGOTIABLE)\n"
        f"The farmer wrote in {lang_label}. Your ENTIRE reply must be in {lang_label} only, using its native script.\n"
        "If tool results are in a different language, translate all facts into "
        f"{lang_label} before answering. Never switch to English or other scripts."
    )


# ── Disclaimer, Canned Reply, and Source Localization Maps ────────────────

_LOCALIZED_WARNINGS = {
    "English": """⚠️ *Important Notice (Testing)* ⚠️

This AjraSakha application is under development and intended only for testing and validation. 
Advisories are experimental and currently cover major crops in selected states. 
Weather data is sourced from IMD.
Market data from eNAM, Agmarknet, and State APMCs.
Soil health guidance from https://soilhealth.dac.gov.in/fertilizer-dosage.
Government schemes from https://www.myscheme.gov.in/. 
Other agricultural information and advisories are expert-verified by Annam.ai. 

Users should independently validate recommendations before acting.""",

    "Hinglish": """⚠️ *Important Notice (Testing)* ⚠️

Yeh AjraSakha application abhi under development hai aur sirf testing aur validation ke liye hai.
Salah experimental hain aur abhi chuni hui states mein badi faslon ke liye hain.
Mausam ka data IMD se liya gaya hai.
Mandi ka data eNAM, Agmarknet, aur State APMCs se hai.
Mitti ki sehat ki jankari https://soilhealth.dac.gov.in/fertilizer-dosage se hai.
Sarkari yojanaayein https://www.myscheme.gov.in/ se hain.
Baki kheti ki jankari aur salah Annam.ai dwara expert-verified hain.

Users ko koi bhi kadam uthane se pehle khud jankari ki pushti karni chahiye.""",

    "Hindi": """⚠️ *महत्वपूर्ण सूचना (परीक्षण)* ⚠️

यह अजरासखा (AjraSakha) एप्लीकेशन अभी विकास के अधीन है और केवल परीक्षण और सत्यापन के लिए है।
सलाह प्रायोगिक हैं और वर्तमान में चयनित राज्यों में प्रमुख फसलों को कवर करती हैं।
मौसम का डेटा IMD से लिया गया है।
मंडी का डेटा eNAM, Agmarknet और राज्य APMCs से है।
मृदा स्वास्थ्य मार्गदर्शन https://soilhealth.dac.gov.in/fertilizer-dosage से है।
सरकारी योजनाएं https://www.myscheme.gov.in/ से हैं।
अन्य कृषि जानकारी और सलाह Annam.ai द्वारा विशेषज्ञ-सत्यापित हैं।

उपयोगकर्ताओं को कोई भी कदम उठाने से पहले स्वतंत्र रूप से सिफारिशों को सत्यापित करना चाहिए।""",

    "Punjabi": """⚠️ *ਖਾਸ ਨੋਟਿਸ (ਟੈਸਟਿੰਗ)* ⚠️

ਇਹ ਅਜਰਾਸਖਾ (AjraSakha) ਐਪਲੀਕੇਸ਼ਨ ਅਜੇ ਵਿਕਾਸ ਅਧੀਨ ਹੈ ਅਤੇ ਸਿਰਫ ਟੈਸਟਿੰਗ ਅਤੇ ਤਸਦੀਕ ਲਈ ਹੈ।
ਸਲਾਹਾਂ ਪ੍ਰਯੋਗਾਤਮਕ ਹਨ ਅਤੇ ਵਰਤਮਾਨ ਵਿੱਚ ਚੁਣੇ ਹੋਏ ਰਾਜਾਂ ਵਿੱਚ ਮੁੱਖ ਫਸਲਾਂ ਨੂੰ ਕਵਰ ਕਰਦੀਆਂ ਹਨ।
ਮੌਸਮ ਦਾ ਡੇਟਾ IMD ਤੋਂ ਲਿਆ ਗਿਆ ਹੈ।
ਮੰਡੀ ਦਾ ਡੇਟਾ eNAM, Agmarknet ਅਤੇ ਰਾਜ ਦੇ APMCs ਤੋਂ ਹੈ।
ਮਿੱਟੀ ਦੀ ਸਿਹਤ ਸੰਬੰਧੀ ਮਾਰਗਦਰਸ਼ਨ https://soilhealth.dac.gov.in/fertilizer-dosage ਤੋਂ ਹੈ।
ਸਰਕਾਰੀ ਸਕੀਮਾਂ https://www.myscheme.gov.in/ ਤੋਂ ਹਨ।
ਹੋਰ ਖੇਤੀਬਾੜੀ ਜਾਣਕਾਰੀ ਅਤੇ ਸਲਾਹਾਂ Annam.ai ਦੁਆਰਾ ਮਾਹਰ-ਪ੍ਰਮਾਣਿਤ ਹਨ।

ਉਪਭੋਗਤਾਵਾਂ ਨੂੰ ਕੋਈ ਵੀ ਕਦਮ ਚੁੱਕਣ ਤੋਂ ਪਹਿਲਾਂ ਸੁਤੰਤਰ ਤੌਰ 'ਤੇ ਸਿਫ਼ਾਰਸ਼ਾਂ ਦੀ ਪੁਸ਼ਟੀ ਕਰਨੀ ਚਾਹੀਦੀ ਹੈ।""",

    "Romanized Punjabi": """⚠️ *Important Notice (Testing)* ⚠️

Eh AjraSakha application aje under development hai te sirf testing te validation layi hai.
Salah experimental han te hale chune hoye states vich vaddiya fasla layi han.
Mausam da data IMD ton leya gya hai.
Mandi da data eNAM, Agmarknet, te State APMCs ton hai.
Mitti di sehat di jankari https://soilhealth.dac.gov.in/fertilizer-dosage ton hai.
Sarkari schemes https://www.myscheme.gov.in/ ton han.
Baki kheti di jankari te salah Annam.ai valon expert-verified han.

Users nu koi vi kadam chukan ton pehla khud jankari di tasdeek karni chahidi hai.""",

    "Tamil": """⚠️ *முக்கிய அறிவிப்பு (சோதனை)* ⚠️

இந்த அஜ்ராசகா (AjraSakha) செயலி தற்போது உருவாக்கத்தில் உள்ளது மற்றும் சோதனை மற்றும் சரிபார்ப்புக்கு மட்டுமேயானது.
ஆலோசனைகள் சோதனை ரீதியானவை மற்றும் தற்போது தேர்ந்தெடுக்கப்பட்ட மாநிலங்களில் உள்ள முக்கிய பயிர்களை மட்டுமே உள்ளடக்கியது.
வானிலை தரவு IMD-யிலிருந்து பெறப்பட்டது.
சந்தைத் தரவு eNAM, Agmarknet மற்றும் மாநில APMC-களிலிருந்து பெறப்பட்டது.
மண்வள வழிகாட்டுதல் https://soilhealth.dac.gov.in/fertilizer-dosage இலிருந்து பெறப்பட்டது.
அரசு திட்டங்கள் https://www.myscheme.gov.in/ இலிருந்து பெறப்பட்டது.
இதர விவசாய தகவல்கள் மற்றும் ஆலோசனைகள் Annam.ai ஆல் நிபுணத்துவம் பெற்று சரிபார்க்கப்பட்டது.

பயனர்கள் எந்த ஒரு செயலையும் செய்வதற்கு முன் பரிந்துரைகளை சுயாதீனமாக சரிபார்க்க வேண்டும்.""",

    "Romanized Tamil": """⚠️ *Important Notice (Testing)* ⚠️

Indha AjraSakha seiyali tharpothu uruvakkathil ullathu matrum sothanai verification-ukkaga mattume.
Aalosanai sothanai muraiyilanavaigal, ithu tharpothu thernthu edukapatta manilangalil ulla mukkiya payirkalai mattume ulladakkiyathu.
Vaanilai tharavu IMD-yilirundhu perappattathu.
Sandhai tharavu eNAM, Agmarknet, matrum State APMC-galilirundhu perappattathu.
Man vala vazhikaattuthal https://soilhealth.dac.gov.in/fertilizer-dosage ilirundhu perappattathu.
Arasu thittangal https://www.myscheme.gov.in/ ilirundhu perappattathu.
Idhara vivasaya thagavalgal matrum aalosanaigal Annam.ai-al expert-verified seiyappattadhu.

Payanargal entha oru seiyalaiyum seivadhu munnar parinthuraigalai suyadheenamaaga sari paarkka vendum.""",

    "Telugu": """⚠️ *ముఖ్య గమనిక (టెస్టింగ్)* ⚠️

ఈ అజ్రాసఖ (AjraSakha) అప్లికేషన్ ఇంకా అభివృద్ధి దశలో ఉంది మరియు కేవలం టెస్టింగ్ మరియు పరిశీలన కోసం మాత్రమే ఉద్దేశించబడింది.
సలహాలు ప్రయోగాత్మకమైనవి మరియు ప్రస్తుతం ఎంపిక చేసిన రాష్ట్రాల్లోని ప్రధాన పంటలకు మాత్రమే వర్తిస్తాయి.
హవామాన డేటా IMD నుండి సేకరించబడింది.
మార్కెట్ డేటా eNAM, Agmarknet మరియు రాష్ట్ర APMCల నుండి తీసుకోబడింది.
నేల ఆరోగ్య మార్గదర్శకత్వం https://soilhealth.dac.gov.in/fertilizer-dosage నుండి తీసుకోబడింది.
ప్రభుత్వ పథకాలు https://www.myscheme.gov.in/ నుండి తీసుకోబడ్డాయి.
ఇతర వ్యవసాయ సమాచారం మరియు సలహాలు Annam.ai చేత నిపుణుల ద్వారా ధృవీకరించబడ్డాయి.

వినియోగదారులు సిఫార్సులను పాటించే ముందు స్వంతంగా సరిచూసుకోవాలి.""",

    "Romanized Telugu": """⚠️ *Important Notice (Testing)* ⚠️

Ee AjraSakha application inka under development lo undhi te testing te validation kosam mathrame.
Salahalu experimental vi te prasthutham select chesina states lo major crops kosam mathrame undhi.
Havamana data IMD nundi thesukobadindhi.
Market data eNAM, Agmarknet, te State APMClu nundi undhi.
Nela arogya margadarsakathvam https://soilhealth.dac.gov.in/fertilizer-dosage nundi undhi.
Prabhuthva padhathalu https://www.myscheme.gov.in/ nundi unnai.
Inka ithara vyavasaya samacharam te salahalu Annam.ai dwara expert-verified.

Users recommendation patinche mundhu swanthanga sari chusukovali.""",

    "Bengali": """⚠️ *গুরুত্বপূর্ণ বিজ্ঞপ্তি (পরীক্ষামূলক)* ⚠️

এই অজরাসখা (AjraSakha) অ্যাপ্লিকেশন এখনও উন্নয়নাধীন এবং শুধুমাত্র পরীক্ষা ও যাচাইয়ের জন্য।
পরামর্শগুলি পরীক্ষামূলক এবং বর্তমানে নির্বাচিত রাজ্যগুলিতে প্রধান ফসলগুলি কভার করে।
আবহাওয়ার তথ্য IMD থেকে নেওয়া হয়েছে।
বাজারের তথ্য eNAM, Agmarknet এবং রাজ্য APMCগুলি থেকে নেওয়া হয়েছে।
মাটির স্বাস্থ্য বিষয়ক নির্দেশিকা https://soilhealth.dac.gov.in/fertilizer-dosage থেকে নেওয়া হয়েছে।
সরকারি প্রকল্পগুলি https://www.myscheme.gov.in/ থেকে নেওয়া হয়েছে।
অন্যান্য কৃষি তথ্য ও পরামর্শ Annam.ai দ্বারা বিশেষজ্ঞ-যাচাইকৃত।

ব্যবহারকারীদের কোনো পদক্ষেপ নেওয়ার আগে সুপারিশগুলি স্বাধীনভাবে যাচাই করা উচিত।""",

    "Romanized Bengali": """⚠️ *Important Notice (Testing)* ⚠️

Ei AjraSakha application ekhono under development-e ache ebong shudhumatro testing ebong validation-er jonyo.
Poramorshogulo porikhamulok ebong ekhon nirbachito rajyogulote prodhan fasholgulokey cover kore.
Aabohawaar tothyo IMD theke newa hoyeche.
Bazarer tothyo eNAM, Agmarknet ebong State APMC theke newa hoyeche.
Maatir swasthyo bishoyok nirdeshipka https://soilhealth.dac.gov.in/fertilizer-dosage theke newa hoyeche.
Sorkar prakalpa https://www.myscheme.gov.in/ theke newa hoyeche.
Onyanya krishi tothyo o poramorsh Annam.ai-er dwara bishesogger dwara confirmed.

Byaboharkaridera jekono podam neowar aage suparishgulo swadhinbhabe yachai kora uchit."""
}

_LOCALIZED_EMPTY_REPLIES = {
    "English": "Your question has been shared with our agri expert at annam.ai. You will get the answer within 2 hours.\nThank You.",
    "Hinglish": "Aapka sawal annam.ai par hamare agri expert ke sath share kar diya gaya hai. Aapko 2 ghante ke andar uttar mil jayega.\nDhanyawad.",
    "Hindi": "आपका प्रश्न annam.ai पर हमारे कृषि विशेषज्ञ के साथ साझा कर दिया गया है। आपको 2 घंटे के भीतर उत्तर मिल जाएगा।\nधन्यवाद।",
    "Punjabi": "ਤੁਹਾਡਾ ਸਵਾਲ annam.ai 'ਤੇ ਸਾਡੇ ਖੇਤੀਬਾੜੀ ਮਾਹਰ ਨਾਲ ਸਾਂਝਾ ਕੀਤਾ ਗਿਆ ਹੈ। ਤੁਹਾਨੂੰ 2 ਘੰਟੇ ਦੇ ਅੰਦਰ ਜਵਾਬ ਮਿਲ ਜਾਵੇਗਾ।\nਧੰਨਵਾਦ।",
    "Romanized Punjabi": "Tuhada sawal annam.ai te sade agri expert nal share kar ditta gya hai. Tuhanu 2 ghante de andar jawab mil jayega.\nDhanyawad.",
    "Tamil": "உங்கள் கேள்வி annam.ai இல் உள்ள எங்களது விவசாய நிபுணருடன் பகிர்ந்து கொள்ளப்பட்டுள்ளது. 2 மணி நேரத்திற்குள் உங்களுக்கு பதில் கிடைக்கும்.\nநன்றி.",
    "Romanized Tamil": "Ungal kelvi annam.ai-il ulla engal vivasaya expert-udan pagirndhu kollappattadhu. Ungalukku 2 mani nerathil badhil kidaikkum.\nNandri.",
    "Telugu": "మీ ప్రశ్న annam.ai లోని మా వ్యవసాయ నిపుణుడితో పంచుకోబడింది. మీకు 2 గంటల లోపు సమాధానం లభిస్తుంది.\nధన్యవాదాలు.",
    "Romanized Telugu": "Mee prasna annam.ai loni ma vyavasaya expert tho share cheyabadindhi. Neeku 2 gantala lopala samadhanam labhisthundhi.\nDhanyalu.",
    "Bengali": "আপনার প্রশ্ন annam.ai-তে আমাদের কৃষি বিশেষজ্ঞের সাথে শেয়ার করা হয়েছে। আপনি ২ ঘন্টার মধ্যে উত্তর পাবেন।\nধন্যবাদ।",
    "Romanized Bengali": "Apnar prosno annam.ai-te amader krishi bisesogger sathe share kora hoyeche. Apni 2 ghontar modhye uttor paben.\nDhanyabad."
}

_LOCALIZED_SOURCES_HEADERS = {
    "English": "\nThe answer I provided is sourced only from the following approved materials.\n",
    "Hinglish": "\nMaine jo uttar diya hai, woh sirf niche diye gaye approved materials se liya gaya hai.\n",
    "Hindi": "\nमेरे द्वारा प्रदान किया गया उत्तर केवल निम्नलिखित स्वीकृत सामग्री से लिया गया है।\n",
    "Punjabi": "\nਮੇਰੇ ਦੁਆਰਾ ਦਿੱਤਾ ਗਿਆ ਜਵਾਬ ਸਿਰਫ ਹੇਠ ਲਿਖੀਆਂ ਪ੍ਰਵਾਨਿਤ ਸਮੱਗਰੀਆਂ ਤੋਂ ਲਿਆ ਗਿਆ ਹੈ।\n",
    "Romanized Punjabi": "\nMain jo jawab ditta hai, oh sirf heth ditti approved material ton leya gya hai.\n",
    "Tamil": "\nநான் வழங்கிய பதில் பின்வரும் அங்கீகரிக்கப்பட்ட பொருட்களிலிருந்து மட்டுமே பெறப்பட்டது.\n",
    "Romanized Tamil": "\nNaan vazhangiya badhil pinvarum angigarikkapatta porulgalilirundhu mattume perappattadhu.\n",
    "Telugu": "\nనేను అందించిన సమాధానం క్రింది ఆమోదించబడిన పదార్థాల నుండి మాత్రమే సేకరించబడింది.\n",
    "Romanized Telugu": "\nNenu andhinchina samadhanam kindhi approved materials nundi mathrame thesukobadindhi.\n",
    "Bengali": "\nআমার দেওয়া উত্তর শুধুমাত্র নিচের অনুমোদিত উপকরণ থেকে নেওয়া হয়েছে।\n",
    "Romanized Bengali": "\nAmi je uttar diyechi, seta shudhumatro niche dewa approved materials theke newa hoyeche.\n"
}

_LOCALIZED_SOURCE_PREFIX = {
    "English": "📚 Source:",
    "Hinglish": "📚 Source:",
    "Hindi": "📚 स्रोत:",
    "Punjabi": "📚 ਸਰੋਤ:",
    "Romanized Punjabi": "📚 Source:",
    "Tamil": "📚 ஆதாரம்:",
    "Romanized Tamil": "📚 Source:",
    "Telugu": "📚 మూలం:",
    "Romanized Telugu": "📚 Source:",
    "Bengali": "📚 উৎস:",
    "Romanized Bengali": "📚 Source:"
}

_LOCALIZED_EXPERT_PREFIX = {
    "English": "👨‍🌾 Agri Expert:",
    "Hinglish": "👨‍🌾 Agri Expert:",
    "Hindi": "👨‍🌾 कृषि विशेषज्ञ:",
    "Punjabi": "👨‍🌾 ਖੇਤੀਬਾੜੀ ਮਾਹਰ:",
    "Romanized Punjabi": "👨‍🌾 Agri Expert:",
    "Tamil": "👨‍🌾 விவசாய நிபுணர்:",
    "Romanized Tamil": "👨‍🌾 Agri Expert:",
    "Telugu": "👨‍🌾 వ్యవసాయ నిపుణుడు:",
    "Romanized Telugu": "👨‍🌾 Agri Expert:",
    "Bengali": "👨‍🌾 কৃষি বিশেষজ্ঞ:",
    "Romanized Bengali": "👨‍🌾 Agri Expert:"
}


def _pair_from_lang_label(lang_label: str) -> tuple[str, str]:
    """Map legacy lang_label to (script, vocal) for catalog lookup."""
    label = (lang_label or "English").strip()
    if label == "English":
        return "English", "English"
    if label == "Hinglish":
        return "English", "Hindi"
    if label.startswith("Romanized "):
        return "English", label.replace("Romanized ", "", 1).strip()
    return label, label


def get_localized_warning_text(
    lang_label: str = "English",
    *,
    script_language: Optional[str] = None,
    vocal_language: Optional[str] = None,
) -> str:
    """Return exact testing disclaimer from translated_languages.xlsx."""
    from ajrasakha.agents.translation_catalog import get_testing_disclaimer

    if script_language is not None and vocal_language is not None:
        return get_testing_disclaimer(script_language, vocal_language)
    script, vocal = _pair_from_lang_label(lang_label)
    return get_testing_disclaimer(script, vocal)


def get_localized_empty_reply_body(
    lang_label: str = "English",
    *,
    script_language: Optional[str] = None,
    vocal_language: Optional[str] = None,
) -> str:
    """Return exact 2-hour expert-queue text from translated_languages.xlsx."""
    from ajrasakha.agents.translation_catalog import get_two_hour_disclaimer

    if script_language is not None and vocal_language is not None:
        return get_two_hour_disclaimer(script_language, vocal_language)
    script, vocal = _pair_from_lang_label(lang_label)
    return get_two_hour_disclaimer(script, vocal)


def get_localized_sources_header(lang_label: str) -> str:
    """Return the sourcing disclaimer header matching the script/language."""
    # Sort longest key first so "Romanized Telugu" matches before "Telugu" etc.
    for k, v in sorted(_LOCALIZED_SOURCES_HEADERS.items(), key=lambda x: -len(x[0])):
        if k.lower() == lang_label.lower():
            return v
    if "roman" in lang_label.lower() or "latin" in lang_label.lower() or lang_label == "Hinglish":
        return _LOCALIZED_SOURCES_HEADERS["Hinglish"]
    return _LOCALIZED_SOURCES_HEADERS["English"]


def get_localized_source_prefix(lang_label: str) -> str:
    """Return the Source prefix matching the script/language."""
    # Sort longest key first so "Romanized Telugu" matches before "Telugu" etc.
    for k, v in sorted(_LOCALIZED_SOURCE_PREFIX.items(), key=lambda x: -len(x[0])):
        if k.lower() == lang_label.lower():
            return v
    return "📚 Source:"


def get_localized_expert_prefix(lang_label: str) -> str:
    """Return the Agri Expert prefix matching the script/language."""
    # Sort longest key first so "Romanized Punjabi" matches before "Punjabi" etc.
    for k, v in sorted(_LOCALIZED_EXPERT_PREFIX.items(), key=lambda x: -len(x[0])):
        if k.lower() == lang_label.lower():
            return v
    return "👨‍🌾 Agri Expert:"


# ── Localized Questions for State and Crop ─────────────────────────────────

_LOCALIZED_STATE_QUESTIONS = {
    "English": "Which state are you in?",
    "Hinglish": "Aap kis state se hain?",
    "Hindi": "आप किस राज्य से हैं?",
    "Punjabi": "ਤੁਸੀਂ ਕਿਸ ਰਾਜ ਤੋਂ ਹੋ?",
    "Romanized Punjabi": "Tusi kis state ton ho?",
    "Tamil": "நீங்கள் எந்த மாநிலத்தைச் சேர்ந்தவர்?",
    "Romanized Tamil": "Neenga endha state-ilirundhu varreenga?",
    "Telugu": "మీరు ఏ రాష్ట్రానికి చెందినవారు?",
    "Romanized Telugu": "Meeru ye state nundi unnar?",
    "Bengali": "আপনি কোন রাজ্যে আছেন?",
    "Romanized Bengali": "Apni kon state-e achen?"
}

_LOCALIZED_CROP_QUESTIONS = {
    "English": "Which crop are you growing?",
    "Hinglish": "Aap kaunsi fasal uga rahe hain?",
    "Hindi": "आप कौन सी फसल उगा रहे हैं?",
    "Punjabi": "ਤੁਸੀਂ ਕਿਹੜੀ ਫਸਲ ਉਗਾ ਰਹੇ ਹੋ?",
    "Romanized Punjabi": "Tusi kehdi fasal uga rahe ho?",
    "Tamil": "நீங்கள் என்ன பயிர் வளர்க்கிறீர்கள்?",
    "Romanized Tamil": "Neenga enna payir valarkireenga?",
    "Telugu": "మీరు ఏ పంట పండిస్తున్నారు?",
    "Romanized Telugu": "Meeru ye panta pandisthunnaru?",
    "Bengali": "আপনি কোন ফসল চাষ করছেন?",
    "Romanized Bengali": "Apni kon fasal chash korchen?"
}


def get_localized_state_question(
    lang_label: str = "English",
    *,
    script_language: Optional[str] = None,
    vocal_language: Optional[str] = None,
) -> str:
    from ajrasakha.agents.translation_catalog import get_state_follow_up

    if script_language is not None and vocal_language is not None:
        return get_state_follow_up(script_language, vocal_language)
    script, vocal = _pair_from_lang_label(lang_label)
    return get_state_follow_up(script, vocal)


def get_localized_crop_question(
    lang_label: str = "English",
    *,
    script_language: Optional[str] = None,
    vocal_language: Optional[str] = None,
) -> str:
    from ajrasakha.agents.translation_catalog import get_crop_follow_up

    if script_language is not None and vocal_language is not None:
        return get_crop_follow_up(script_language, vocal_language)
    script, vocal = _pair_from_lang_label(lang_label)
    return get_crop_follow_up(script, vocal)

