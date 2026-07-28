"""Dictionary mapping English terminology seeds to language variants.

For non-English responses, if the English term is missing, the validator will
check this dictionary for acceptable language-specific variants (transliterations
and native script translations) before failing or requesting human review.
"""

# Language codes: HI (Hindi), KN (Kannada), TA (Tamil), PA (Punjabi), TE (Telugu)
TERMINOLOGY_VARIANTS: dict[str, dict[str, list[str]]] = {
    "wheat": {
        "HI": ["गेहूं", "gehu", "gehun"],
        "PA": ["ਕਣਕ", "kanak"],
        "KN": ["ಗೋಧಿ", "godhi"],
        "TA": ["கோதுமை", "gothumai", "godhumai"],
        "TE": ["గోధుమ", "godhuma"],
    },
    "paddy": {
        "HI": ["धान", "dhaan", "chawal"],
        "PA": ["ਝੋਨਾ", "jhona", "chawal"],
        "KN": ["ಭತ್ತ", "bhatta"],
        "TA": ["நெல்", "nel"],
        "TE": ["వరి", "vari"],
    },
    "rice": {
        "HI": ["चावल", "chawal"],
        "PA": ["ਚੌਲ", "chawal"],
        "KN": ["ಅಕ್ಕಿ", "akki"],
        "TA": ["அரிசி", "arisi"],
        "TE": ["బియ్యం", "biyyam"],
    },
    "maize": {
        "HI": ["मक्का", "makka"],
        "PA": ["ਮੱਕੀ", "makki"],
        "KN": ["ಮೆಕ್ಕೆಜೋಳ", "mekkejola"],
        "TA": ["மக்காச்சோளம்", "makkacholam"],
        "TE": ["మొక్కజొన్న", "mokkajonna"],
    },
    "cotton": {
        "HI": ["कपास", "kapas"],
        "PA": ["ਕਪਾਹ", "kapah", "narma"],
        "KN": ["ಹತ್ತಿ", "hatti"],
        "TA": ["பருத்தி", "paruthi"],
        "TE": ["పత్తి", "ruthi", "patti"],
    },
    "mustard": {
        "HI": ["सरसों", "sarson"],
        "PA": ["ਸਰ੍ਹੋਂ", "sarhon"],
        "KN": ["ಸಾಸಿವೆ", "sasive"],
        "TA": ["கடுகு", "kadugu"],
        "TE": ["ఆవాలు", "aavalu"],
    },
    "urea": {
        "HI": ["यूरिया", "yuriya", "urea"],
        "PA": ["ਯੂਰੀਆ", "yuriya"],
        "KN": ["ಯೂರಿಯಾ", "yuriya"],
        "TA": ["யூரியா", "yuriya"],
        "TE": ["యూరియా", "yuriya"],
    },
    "nitrogen": {
        "HI": ["नाइट्रोजन", "nitrogen"],
        "PA": ["ਨਾਈਟ੍ਰੋਜਨ", "nitrogen"],
        "KN": ["ಸಾರಜನಕ", "sarajanaka", "nitrogen"],
        "TA": ["நைட்ரஜன்", "nitrogen"],
        "TE": ["నత్రజని", "natrajani", "nitrogen"],
    },
    "weather": {
        "HI": ["मौसम", "mausam"],
        "PA": ["ਮੌਸम", "mausam"],
        "KN": ["ಹವಾಮಾನ", "havamana"],
        "TA": ["வானிலை", "vaanilai"],
        "TE": ["వాతావరణం", "vaatavaranam"],
    },
    "price": {
        "HI": ["कीमत", "keemat", "bhav", "भाव", "dam", "दाम"],
        "PA": ["ਭਾਅ", "bha", "keemat"],
        "KN": ["ಬೆಲೆ", "bele", "dara"],
        "TA": ["விலை", "vilai"],
        "TE": ["ధర", "dhara"],
    },
    "mandi": {
        "HI": ["मंडी", "mandi", "bazar", "बाजार"],
        "PA": ["ਮੰਡੀ", "mandi"],
        "KN": ["ಮಾರುಕಟ್ಟೆ", "marukatte", "mandi"],
        "TA": ["சந்தை", "sandhai", "mandi"],
        "TE": ["మార్కెట్", "market", "mandi"],
    },
    "seed treatment": {
        "HI": ["बीज उपचार", "beej upchar"],
        "PA": ["ਬੀਜ ਦੀ ਸੋਧ", "beej di sodh"],
        "KN": ["ಬೀಜೋಪಚಾರ", "beejopachara"],
        "TA": ["விதை நேர்த்தி", "vithai nerthi"],
        "TE": ["విత్తన శుద్ధి", "vittana shuddhi"],
    },
    "fungicide": {
        "HI": ["फफूंदनाशक", "faphundnashak", "fungicide"],
        "PA": ["ਉੱਲੀਨਾਸ਼ਕ", "ullinashak", "fungicide"],
        "KN": ["ಶಿಲೀಂಧ್ರನಾಶಕ", "shilindhranashaka", "fungicide"],
        "TA": ["பூஞ்சைக் கொல்லி", "poonjai kolli", "fungicide"],
        "TE": ["శిలీంద్రనాశని", "shilindranashani", "fungicide"],
    },
    "yellow rust": {
        "HI": ["पीला रतुआ", "peela ratua"],
        "PA": ["ਪੀਲੀ ਕੁੰਗੀ", "peeli kungi"],
        "KN": ["ಹಳದಿ ತುಕ್ಕು", "haladi tukku"],
        "TA": ["மஞ்சள் துரு", "manjal thuru"],
        "TE": ["పసుపు తుప్పు", "pasupu tuppu"],
    },
    "rain": {
        "HI": ["बारिश", "baarish", "varsha", "वर्षा"],
        "PA": ["ਮੀਂਹ", "meenh", "barish"],
        "KN": ["ಮಳೆ", "male"],
        "TA": ["மழை", "mazhai"],
        "TE": ["వర్షం", "varsham"],
    },
    "pest": {
        "HI": ["कीट", "keet", "kida", "कीड़ा"],
        "PA": ["ਕੀੜਾ", "keeda"],
        "KN": ["ಕೀಟ", "keeta"],
        "TA": ["பூச்சி", "poochi"],
        "TE": ["తెగులు", "tegulu", "purugu"],
    },
    "disease": {
        "HI": ["बीमारी", "beemari", "rog", "रोग"],
        "PA": ["ਬਿਮਾਰੀ", "bimari"],
        "KN": ["ರೋಗ", "roga"],
        "TA": ["நோய்", "noi"],
        "TE": ["వ్యాధి", "vyadhi"],
    }
}
