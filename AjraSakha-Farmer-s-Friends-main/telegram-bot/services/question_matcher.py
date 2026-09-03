#!/usr/bin/env python3
"""
AI Question Matching and Answer Generation Service

Handles:
1. Semantic similarity matching between farmer question and GDB entries
2. AI-generated answers for new questions (using domain knowledge + free AI APIs)
3. Auto-add to GDB with expert review pipeline
4. 2-hour disclaimer for new questions per project requirements
"""

import sys
import os
from pathlib import Path

project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from datetime import datetime
from typing import Optional, Dict, List, Tuple
import re
import hashlib

from shared.mongodb import get_db
from dotenv import load_dotenv
load_dotenv()


LANGUAGES = {
    "english": "English",
    "hindi": "Hindi",
    "bengali": "Bengali",
    "tamil": "Tamil",
    "telugu": "Telugu",
    "marathi": "Marathi",
    "gujarati": "Gujarati",
    "punjabi": "Punjabi",
    "kannada": "Kannada",
    "malayalam": "Malayalam",
    "odia": "Odia",
    "urdu": "Urdu",
}

# Unicode script ranges -> language
SCRIPT_LANGUAGE = [
    (0x0900, 0x097F, "hindi"),     # Devanagari (Hindi, Marathi, Nepali)
    (0x0980, 0x09FF, "bengali"),   # Bengali
    (0x0B80, 0x0BFF, "tamil"),     # Tamil
    (0x0C00, 0x0C7F, "telugu"),    # Telugu
    (0x0A80, 0x0AFF, "gujarati"),  # Gujarati
    (0x0A00, 0x0A7F, "punjabi"),   # Gurmukhi (Punjabi)
    (0x0C80, 0x0CFF, "kannada"),   # Kannada
    (0x0D00, 0x0D7F, "malayalam"), # Malayalam
    (0x0B00, 0x0B7F, "odia"),      # Odia
    (0x0600, 0x06FF, "urdu"),      # Arabic/Urdu
]

# Common native-language tokens to disambiguate shared scripts
SCRIPT_HINTS = {
    "hindi": ["किसान", "फसल", "खेती", "बीज", "मिट्टी", "सिंचाई", "फसल", "उर्वरक", "कैसे", "क्या", "क्यों"],
    "marathi": ["शेतकरी", "पीक", "शेती", "बियाणे", "जमीन", "माती", "कसे", "काय", "कारण"],
    "english": ["how", "what", "why", "farmer", "crop", "seed", "soil", "rice", "wheat", "the", "is", "are"],
}


def sanitize_language(language: str) -> str:
    """Normalize a language label to a canonical key (e.g. 'Hindi' -> 'hindi')."""
    if not language:
        return "english"
    norm = language.strip().lower()
    if norm in LANGUAGES:
        return norm
    # match by partial/fuzzy against known names
    for key, name in LANGUAGES.items():
        if name.lower() in norm or key in norm:
            return key
    return "english"


def resolve_language(language: str) -> str:
    """Return canonical display name for a language key."""
    return LANGUAGES.get(sanitize_language(language), "English")


def detect_language(text: str) -> str:
    """
    Detect the language of a query based on Unicode script ranges.
    Falls back to English for ASCII/Latin text.
    """
    if not text:
        return "english"

    # Count non-ASCII characters by script
    script_counts = {}
    for ch in text:
        cp = ord(ch)
        if cp < 0x80:
            continue
        for start, end, lang in SCRIPT_LANGUAGE:
            if start <= cp <= end:
                script_counts[lang] = script_counts.get(lang, 0) + 1
                break

    if not script_counts:
        return "english"

    # Get dominant script
    dominant = max(script_counts, key=script_counts.get)

    # If Devanagari, try to disambiguate Hindi vs Marathi using hints
    if dominant == "hindi":
        for lang, hints in [("marathi", SCRIPT_HINTS["marathi"]), ("hindi", SCRIPT_HINTS["hindi"])]:
            if any(h in text for h in hints):
                return lang
        return "hindi"

    return dominant


# Localized UI/response strings keyed by language key
MESSAGES = {
    "english": {
        "off_topic_title": "🌾 Outside Farming Expertise",
        "off_topic_intro": "AjraSakha is an agriculture assistant for Indian farmers.",
        "off_topic_query": "Your question '{q}' is outside our farming expertise.",
        "off_topic_can_help": "I can help you with:",
        "off_topic_crops": "• Crop cultivation & management",
        "off_topic_pests": "• Pest & disease control",
        "off_topic_irrigation": "• Irrigation & fertilizers",
        "off_topic_harvest": "• Harvesting & storage",
        "off_topic_soil": "• Soil health & weather",
        "off_topic_ask": "Please ask an agriculture-related question!",
        "disclaimer_new": "This question is new. We've generated an AI answer and our experts will verify it within 2 hours. If helpful, your feedback helps train our system.",
        "disclaimer_pending": "We're getting an expert to review this question. Your answer will be more specific within 2 hours.",
        "disclaimer_off_topic": "Your question doesn't seem to be about agriculture. We focus on farming topics. Please ask about crops, pests, irrigation, etc.",
        "fallback": "Get specific information from your local Krishi Vigyan Kendra (KVK) or agricultural extension officer",
        "fallback_note": "_This is an AI-generated answer. An expert will review and refine this within 2 hours._",
    },
    "hindi": {
        "off_topic_title": "🌾 खेती से बाहर का विषय",
        "off_topic_intro": "अजरा सखा भारतीय किसानों के लिए कृषि सहायक है।",
        "off_topic_query": "आपका प्रश्न '{q}' हमारी कृषि विशेषज्ञता के दायरे से बाहर है।",
        "off_topic_can_help": "मैं आपकी सहायता कर सकता हूँ:",
        "off_topic_crops": "• फसल की खेती व प्रबंधन",
        "off_topic_pests": "• कीट एवं रोग नियंत्रण",
        "off_topic_irrigation": "• सिंचाई व उर्वरक",
        "off_topic_harvest": "• कटाई व भंडारण",
        "off_topic_soil": "• मृदा स्वास्थ्य व मौसम",
        "off_topic_ask": "कृपया कृषि संबंधी प्रश्न पूछें!",
        "disclaimer_new": "यह प्रश्न नया है। हमने AI उत्तर बनाया है और हमारे विशेषज्ञ 2 घंटे में इसकी जाँच करेंगे। आपकी प्रतिक्रिया हमारे सिस्टम को बेहतर बनाने में मदद करती है।",
        "disclaimer_pending": "हम इस प्रश्न की जाँच के लिए किसी विशेषज्ञ की व्यवस्था कर रहे हैं। 2 घंटे में आपका उत्तर अधिक सटीक होगा।",
        "disclaimer_off_topic": "आपका प्रश्न कृषि के बारे में नहीं लगता। हम खेती से संबंधित विषयों पर ध्यान देते हैं। कृपया फसलों, कीटों, सिंचाई आदि के बारे में पूछें।",
        "fallback_note": "_यह AI-जनित उत्तर है। हमारे विशेषज्ञ 2 घंटे में इसे समीक्षा लेंगे।_",
    },
}


class QuestionMatcher:
    """Match farmer questions to GDB entries using multiple strategies"""

    # Agriculture keywords (if query has none, it's likely not agriculture-related)
    AGRICULTURE_KEYWORDS = {
        'crop', 'crops', 'farm', 'farming', 'farmer', 'plant', 'plants',
        'seed', 'seeds', 'soil', 'harvest', 'yield', 'sowing', 'cultivation',
        'rice', 'wheat', 'maize', 'corn', 'cotton', 'sugarcane', 'tomato',
        'potato', 'onion', 'chili', 'chilli', 'grape', 'grapes', 'mango',
        'banana', 'mustard', 'paddy', 'pulses', 'legume', 'vegetable',
        'fruit', 'fruits', 'grain', 'cereal', 'pest', 'pests', 'insect', 'disease',
        'fungus', 'blight', 'rust', 'mildew', 'rot', 'aphid', 'bollworm',
        'planthopper', 'weevil', 'mite', 'thrips', 'whitefly', 'caterpillar',
        'weed', 'weeds', 'fertilizer', 'fertiliser', 'urea', 'npk', 'manure',
        'compost', 'vermicompost', 'irrigation', 'drip', 'sprinkler',
        'rainfall', 'monsoon', 'drought', 'frost', 'weather', 'climate',
        'greenhouse', 'polyhouse', 'organic', 'pesticide', 'herbicide',
        'fungicide', 'neem', 'cowdung', 'fym', 'vermi', 'mulch',
        'strawberry', 'strawberries', 'dragon', 'kiwi', 'papaya', 'guava',
        'pomegranate', 'watermelon', 'cucumber', 'pumpkin', 'gourd', 'bottle',
        'bitter', 'ridge', 'okra', 'ladyfinger', 'brinjal', 'eggplant',
        'cauliflower', 'cabbage', 'broccoli', 'spinach', 'coriander',
        'mint', 'spinach', 'fenugreek', 'methi', 'curry', 'leaves',
        'coconut', 'areca', 'betel', 'tea', 'coffee', 'pepper',
        'cardamom', 'turmeric', 'ginger', 'sugarcane', 'jaggery',
        'growing', 'cultivate', 'cultivation', 'planting', 'harvesting',
        'किसान', 'फसल', 'खेती', 'कृषि', 'बीज', 'मिट्टी',
        'ਖੇਤ', 'ਫਸਲ', 'ਕਿਸਾਨ',
        # Hindi agriculture terms (crops, pests, inputs, practices)
        'चावल', 'गेहूं', 'मक्का', 'कपास', 'गन्ना', 'टमाटर', 'आलू',
        'प्याज', 'मिर्च', 'सब्जी', 'फल', 'धान', 'दाल', 'अनाज',
        'कीट', 'दुश्मन', 'रोग', 'फंगस', 'कवक', 'उर्वरक', 'खाद',
        'सिंचाई', 'खेत', 'बुवाई', 'पौध', 'पोषण', 'कटाई', 'भंडारण',
        'सिंचन', 'मौसम', 'फल', 'जलवायु', 'प्राकृतिक', 'कीटनाशक',
        # Punjabi terms
        'ਚੌਲ', 'ਕਣਕ', 'ਖਾਦ', 'ਸਿੰਚਾਈ',
        # Bengali terms
        'ধান', 'গম', 'ভাত', 'চাষ', 'কৃষি', 'সার', 'সেচ', 'পোকা', 'উদ্ভিদ',
        # Tamil terms
        'அரிசி', 'பருத்தி', 'நாடு', 'விவசாயம்', 'உழவர்', 'பூச்சி', 'நிலம்',
        # Telugu terms
        'ఎరి', 'వరి', 'పత్తి', 'వ్యక్సాయం', 'పైన', 'నేల', 'ధృడ',
        # Marathi terms
        'तांदळ', 'गहू', 'कापूस', 'शेती', 'शेतकरी', 'पिक', 'धाराद',
        # Gujarati terms
        'ચોખા', 'અંઠાર', 'ઓલ', 'ખેત', 'ખેડૂત', 'કૃષિ',
        # Kannada terms
        'ಅಕ್ಕಿ', 'ಗೋಧಿ', 'ಹತ್ತಿ', 'ರೈತ', 'ವಾಣಿಜ್ಯ', 'ಕೃಷಿ', 'ಮೊಳ',
        # Malayalam terms
        'നെൽ', 'ഗോധ', 'കർഷക', 'കൃഷി', 'നിലം', 'വസായ',
    }

    def __init__(self):
        self.db = get_db()
        self.similarity_threshold = 0.70  # Min confidence for existing match

    def is_agriculture_query(self, query: str) -> bool:
        """Check if query is agriculture-related (supports Indic scripts)"""
        query_lower = query.lower()

        # First check for non-Latin (Indic) agriculture keywords via substring.
        # This is robust because Indic scripts use combining marks that break \w+ tokenization.
        for keyword in self.AGRICULTURE_KEYWORDS:
            if not keyword.isascii() and keyword in query_lower:
                return True

        # Latin-script matching using word boundaries
        query_words = set(re.findall(r'\b\w+\b', query_lower))

        # Check for at least one clear agriculture-related word
        agri_word_count = 0
        for word in query_words:
            # Exact match
            if word in self.AGRICULTURE_KEYWORDS:
                agri_word_count += 1
                continue
            # Partial substring match only if word is at least 4 chars
            if len(word) >= 4:
                for keyword in self.AGRICULTURE_KEYWORDS:
                    if keyword.isascii() and len(keyword) >= 4 and (keyword in word or word in keyword):
                        agri_word_count += 1
                        break

        # Require at least one agriculture word match
        return agri_word_count >= 1

    def normalize_text(self, text: str) -> str:
        """Normalize text for comparison"""
        text = text.lower().strip()
        text = re.sub(r'[^\w\s]', ' ', text)
        text = re.sub(r'\s+', ' ', text)
        return text

    def extract_keywords(self, text: str) -> set:
        """Extract keywords from text"""
        stop_words = {
            'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
            'i', 'you', 'he', 'she', 'it', 'we', 'they', 'them', 'their',
            'my', 'your', 'his', 'her', 'its', 'our',
            'what', 'how', 'why', 'when', 'where', 'which', 'who',
            'and', 'or', 'but', 'if', 'then', 'else', 'for', 'of', 'to', 'in', 'on', 'at', 'by',
            'with', 'from', 'as', 'this', 'that', 'these', 'those',
            'can', 'could', 'may', 'might', 'must', 'shall',
            'कैसे', 'क्या', 'कौन', 'कहाँ', 'कब', 'क्यों',
            'मैं', 'आप', 'हम', 'वे', 'यह', 'वह',
        }
        words = self.normalize_text(text).split()
        keywords = set()
        for w in words:
            if w not in stop_words and len(w) > 2:
                keywords.add(w)
        return keywords

    def calculate_text_similarity(self, query: str, text: str) -> float:
        """Calculate similarity between two texts"""
        query_norm = self.normalize_text(query)
        text_norm = self.normalize_text(text)

        # Exact substring match - high confidence
        if query_norm in text_norm or text_norm in query_norm:
            return 0.95

        # Keyword overlap (Jaccard similarity)
        q_keywords = self.extract_keywords(query)
        t_keywords = self.extract_keywords(text)

        if not q_keywords or not t_keywords:
            return 0.0

        intersection = q_keywords & t_keywords
        union = q_keywords | t_keywords
        overlap_score = len(intersection) / len(union) if union else 0.0

        # Boost score for specific keyword matches
        specific_matches = q_keywords & t_keywords
        boost = min(len(specific_matches) * 0.05, 0.2)

        return min(overlap_score + boost, 1.0)

    def search_gdb(self, query: str, limit: int = 5) -> List[Dict]:
        """Search GDB entries for similar questions - STRICT matching"""
        results = []

        # Only search approved entries (or those without status - original entries)
        all_entries = list(self.db.gdb_entries.find({
            "$or": [
                {"status": "approved"},
                {"status": {"$exists": False}},
                {"status": None}
            ]
        }))

        for entry in all_entries:
            scores = []
            # Compare with question
            if entry.get('question'):
                score = self.calculate_text_similarity(query, entry['question'])
                scores.append(score)
            # Compare with keywords
            if entry.get('keywords'):
                keywords_text = ' '.join(entry['keywords'])
                score = self.calculate_text_similarity(query, keywords_text)
                scores.append(score * 0.8)

            if scores:
                best_score = max(scores)
                if best_score >= self.similarity_threshold:
                    results.append({
                        "entry": entry,
                        "score": best_score
                    })

        results.sort(key=lambda x: x['score'], reverse=True)
        return results[:limit]

    def find_or_generate(self, query: str, language: str = "English", source: str = "unknown") -> Tuple[str, Dict]:
        """
        Find existing answer or generate new one.
        Returns: (answer_text, gdb_entry_with_metadata)

        Project requirement:
        - "When a user asks a question that the GDB cannot answer,
           web app and whatsapp bot send the 2-hour disclaimer and route
           the query to the reviewer pipeline"
        """
        # Auto-detect language from the query if none specified or English fallback
        detected = detect_language(query)
        if not language or sanitize_language(language) == "english":
            language = resolve_language(detected)

        # Step 0: Check if query is agriculture-related at all (FIRST CHECK)
        if not self.is_agriculture_query(query):
            # Non-agriculture query - show off-topic response in detected language
            self._log_disclaimer(query, language, [], source, is_off_topic=True)
            response = self._off_topic_response(query, language)
            return response, {
                "_id": None,
                "question": query,
                "answer": response,
                "domain": "Off-topic",
                "_match_type": "off_topic",
                "_confidence": 0.0,
                "_show_disclaimer": True,
                "_disclaimer_message": self._t("disclaimer_off_topic", language)
            }

        # Step 1: Try to find existing match in GDB
        matches = self.search_gdb(query)

        if matches and matches[0]['score'] >= self.similarity_threshold:
            # Good match found - approved entry
            best_match = matches[0]['entry']
            answer = best_match.get('answer', '')

            # Translate existing answer if entry language differs from query language
            entry_lang = sanitize_language(best_match.get('language', 'English'))
            if entry_lang != sanitize_language(language) and len(answer) > 10:
                translated = self._translate_text(answer, language)
                if translated:
                    answer = translated

            return answer, {
                **best_match,
                "_match_type": "existing",
                "_confidence": matches[0]['score'],
                "_show_disclaimer": False,
                "_language": language
            }

        # Step 2: Check if a SIMILAR approved or pending question exists in GDB
        # Only check for agriculture-related pending entries
        existing_pending = self.db.gdb_entries.find_one({
            "question": {"$regex": re.escape(query[:50]), "$options": "i"},
            "status": "pending_review",
            "domain": {"$nin": ["Off-topic"]}
        })

        if existing_pending:
            return existing_pending.get('ai_answer', ''), {
                **existing_pending,
                "_match_type": "pending_review",
                "_confidence": 1.0,
                "_show_disclaimer": True,
                "_disclaimer_message": self._t("disclaimer_pending", language)
            }

        # Step 3: NEW QUESTION - log disclaimer, generate AI answer, route to reviewer
        self._log_disclaimer(query, language, matches, source)

        # Step 4: Generate AI answer (with domain-specific knowledge)
        answer_text = self._generate_ai_answer(query, language)

        # Step 5: Add to GDB as pending_review
        new_entry = self._add_pending_entry(query, answer_text, language)

        # Step 6: Route to reviewer pipeline (notify)
        self._notify_experts(query, answer_text, new_entry)

        return answer_text, {
            **new_entry,
            "_match_type": "ai_generated",
            "_confidence": 1.0,
            "_show_disclaimer": True,
            "_disclaimer_message": self._t("disclaimer_new", language),
            "_language": language
        }

    def _t(self, key: str, language: str = "english") -> str:
        """Get localized message string."""
        lang = sanitize_language(language)
        return MESSAGES.get(lang, MESSAGES["english"]).get(key, MESSAGES["english"].get(key, key))

    def _off_topic_response(self, query: str, language: str = "english") -> str:
        """Response for non-agriculture queries (localized)"""
        lang = sanitize_language(language)
        m = MESSAGES.get(lang, MESSAGES["english"])
        return (
            f"{m['off_topic_title']}\n\n"
            f"{m['off_topic_intro']}\n\n"
            f"{m['off_topic_query'].format(q=query[:80])}...\n\n"
            f"{m['off_topic_can_help']}\n"
            f"{m['off_topic_crops']}\n"
            f"{m['off_topic_pests']}\n"
            f"{m['off_topic_irrigation']}\n"
            f"{m['off_topic_harvest']}\n"
            f"{m['off_topic_soil']}\n\n"
            f"{m['off_topic_ask']}"
        )

    def _log_disclaimer(self, query: str, language: str, matches: List[Dict],
                        source: str, is_off_topic: bool = False):
        """Log disclaimer-triggered query (2-hour pipeline)"""
        try:
            best_match = matches[0] if matches else None
            best_match_score = best_match['score'] if best_match else 0.0
            best_match_id = best_match['entry']['_id'] if best_match else None

            disclaimer_doc = {
                "query": query,
                "query_normalized": query.lower().strip(),
                "source": source,
                "language": language,
                "domain": self._detect_domain(query) if not is_off_topic else "Off-topic",
                "state": None,
                "farmer_id": f"{source}_user",
                "best_match_id": best_match_id,
                "best_match_score": best_match_score,
                "confidence": best_match_score,
                "timestamp": datetime.utcnow(),
                "status": "unanswered",
                "is_off_topic": is_off_topic,
                "review_pipeline_status": "pending",
                "expected_response_time_hours": 2
            }
            self.db.disclaimer_logs.insert_one(disclaimer_doc)
            status = "off-topic" if is_off_topic else f"score {best_match_score:.2f}"
            print(f"📝 Disclaimer logged: {query[:50]}... ({status})")
        except Exception as e:
            print(f"Failed to log disclaimer: {e}")

    def _generate_ai_answer(self, query: str, language: str) -> str:
        """Generate answer - try AI APIs in priority order, fallback to domain knowledge"""
        # 1. Try NVIDIA NIM (PRIMARY - has free Llama 70B!)
        nvidia = self._try_nvidia(query, language)
        if nvidia:
            return nvidia
        # 2. Try xAI Grok (backup)
        grok = self._try_grok(query, language)
        if grok:
            return grok

        # 3. Try Sarvam AI (Indian language model)
        sarvam = self._try_sarvam_ai(query, language)
        if sarvam:
            return sarvam

        # 4. Try HuggingFace free inference API
        hf = self._try_huggingface(query)
        if hf:
            return hf

        # 5. Try DeepSeek
        ds = self._try_deepseek(query)
        if ds:
            return ds

        # 6. Fallback: domain-specific agricultural knowledge base
        fallback = self._generate_domain_specific_answer(query)
        # Translate fallback into the user's language if requested
        if sanitize_language(language) != "english":
            translated = self._translate_text(fallback, language)
            return translated if translated else fallback
        return fallback

    def _translate_text(self, text: str, language: str) -> Optional[str]:
        """Translate text to the target language using NVIDIA (translation-focused prompt)."""
        lang = resolve_language(language)
        api_key = os.getenv("NVIDIA_API_KEY")
        if not api_key:
            return None
        model = os.getenv("NVIDIA_MODEL", "meta/llama-3.1-70b-instruct")
        try:
            import requests
            response = requests.post(
                "https://integrate.api.nvidia.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                json={
                    "model": model,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "You are a professional translator for Indian farmers. "
                                f"Translate the following text accurately into {language}. "
                                "Preserve all technical agronomic terms, numbers, and chemical "
                                "names (keep them in English where standard). "
                                "Return ONLY the translation, no explanations."
                            )
                        },
                        {"role": "user", "content": text}
                    ],
                    "max_tokens": 500,
                    "temperature": 0.3,
                    "top_p": 0.9,
                    "stream": False
                },
                timeout=45
            )
            if response.status_code == 200:
                result = response.json()
                if 'choices' in result and len(result['choices']) > 0:
                    translated = result['choices'][0]['message']['content'].strip()
                    return translated if translated else None
        except Exception as e:
            print(f"Translation error: {e}")
        return None

    def _try_nvidia(self, query: str, language: str) -> Optional[str]:
        """
        Try NVIDIA NIM API for high-quality Llama 70B answers.
        NVIDIA endpoint: https://integrate.api.nvidia.com/v1/chat/completions
        """
        api_key = os.getenv("NVIDIA_API_KEY")
        if not api_key:
            return None

        model = os.getenv("NVIDIA_MODEL", "meta/llama-3.1-70b-instruct")

        try:
            import requests
            response = requests.post(
                "https://integrate.api.nvidia.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                json={
                    "model": model,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "You are AjraSakha, an expert agricultural advisor for Indian farmers. "
                                "Provide practical, accurate, and actionable farming advice. "
                                f"Keep answers under 200 words. Respond in {language}. "
                                "Use simple language suitable for farmers. "
                                "Focus on organic/scientific methods. "
                                "Format with short numbered actionable steps."
                            )
                        },
                        {
                            "role": "user",
                            "content": f"Farmer's question: {query}\n\nProvide a helpful, practical answer."
                        }
                    ],
                    "max_tokens": 400,
                    "temperature": 0.7,
                    "top_p": 0.9,
                    "stream": False
                },
                timeout=60  # Increased timeout for Llama 70B
            )

            if response.status_code == 200:
                result = response.json()
                if 'choices' in result and len(result['choices']) > 0:
                    return result['choices'][0]['message']['content'].strip()
            else:
                print(f"NVIDIA API error: {response.status_code} - {response.text[:200]}")
        except Exception as e:
            print(f"NVIDIA exception: {e}")

        return None

    def _try_grok(self, query: str, language: str) -> Optional[str]:
        """
        Try xAI Grok for high-quality answer generation.
        Grok API endpoint: https://api.x.ai/v1/chat/completions

        Note: Requires valid xAI API key with credits.
        Models tried in order: grok-3, grok-2-latest, grok-2, grok-1
        """
        api_key = os.getenv("XAI_API_KEY")
        if not api_key:
            return None

        # Models to try in order (newest first)
        models = ["grok-3", "grok-2-latest", "grok-2", "grok-1"]

        try:
            import requests
            for model in models:
                response = requests.post(
                    "https://api.x.ai/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": model,
                        "messages": [
                            {
                                "role": "system",
                                "content": (
                                    "You are AjraSakha, an expert agricultural advisor for Indian farmers. "
                                    "Provide practical, accurate, and actionable farming advice. "
                                    f"Keep answers under 200 words. Respond in {language}. "
                                    "Use simple language suitable for farmers. "
                                    "Focus on organic/scientific methods. Mention government schemes if relevant. "
                                    "Format with short actionable steps."
                                )
                            },
                            {
                                "role": "user",
                                "content": f"Farmer's question: {query}\n\nProvide a helpful, practical answer."
                            }
                        ],
                        "max_tokens": 400,
                        "temperature": 0.7
                    },
                    timeout=30
                )

                if response.status_code == 200:
                    result = response.json()
                    if 'choices' in result and len(result['choices']) > 0:
                        return result['choices'][0]['message']['content'].strip()
                elif response.status_code == 404 or 'Model not found' in response.text:
                    # Try next model
                    continue
                else:
                    # Other error (auth, credits, etc.) - don't try other models
                    print(f"Grok API error: {response.status_code} - {response.text[:200]}")
                    return None
        except Exception as e:
            print(f"Grok exception: {e}")

        return None

    def _try_sarvam_ai(self, query: str, language: str) -> Optional[str]:
        """Sarvam AI (Indian language model)"""
        api_key = os.getenv("SARVAM_API_KEY")
        if not api_key:
            return None
        try:
            import requests
            response = requests.post(
                "https://api.sarvam.ai/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": "sarvam-1",
                    "messages": [
                        {"role": "system", "content": "You are AjraSakha, an expert Indian agricultural advisor. Provide practical, accurate farming advice in simple language. Keep answers under 200 words."},
                        {"role": "user", "content": f"Farmer's question: {query}\nProvide a helpful answer in {language}."}
                    ],
                    "max_tokens": 300
                },
                timeout=30
            )
            if response.status_code == 200:
                return response.json()['choices'][0]['message']['content']
        except Exception as e:
            print(f"Sarvam error: {e}")
        return None

    def _try_huggingface(self, query: str) -> Optional[str]:
        """HuggingFace free inference API"""
        api_key = os.getenv("HUGGINGFACE_API_KEY")
        if not api_key:
            return None
        try:
            import requests
            response = requests.post(
                "https://api-inference.huggingface.co/models/microsoft/DialoGPT-large",
                headers={"Authorization": f"Bearer {api_key}"},
                json={"inputs": f"Question: {query}\nAnswer about Indian farming:", "parameters": {"max_new_tokens": 200}},
                timeout=30
            )
            if response.status_code == 200:
                result = response.json()
                if isinstance(result, list) and len(result) > 0:
                    return result[0].get('generated_text', '')
        except Exception as e:
            print(f"HuggingFace error: {e}")
        return None

    def _try_deepseek(self, query: str) -> Optional[str]:
        """DeepSeek AI"""
        api_key = os.getenv("DEEPSEEK_API_KEY")
        if not api_key:
            return None
        try:
            import requests
            response = requests.post(
                "https://api.deepseek.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": "deepseek-chat",
                    "messages": [
                        {"role": "system", "content": "You are an agricultural expert providing practical farming advice to Indian farmers. Be concise (under 150 words) and use simple language."},
                        {"role": "user", "content": query}
                    ],
                    "max_tokens": 250
                },
                timeout=30
            )
            if response.status_code == 200:
                return response.json()['choices'][0]['message']['content']
        except Exception as e:
            print(f"DeepSeek error: {e}")
        return None

    def _generate_domain_specific_answer(self, query: str) -> str:
        """Generate answer using domain-specific agricultural knowledge"""
        query_lower = query.lower()
        domain = self._detect_domain(query)

        # Domain-specific knowledge base
        knowledge_base = {
            'Pest Control': {
                'rice': "For rice pests: Use neem oil 5ml/L or Imidacloprid 0.5ml/L. Install light traps. Maintain water level. Apply BT (Bacillus thuringiensis) for stem borers. Practice crop rotation. Field sanitation is critical - remove weeds that host pests.",
                'wheat': "For wheat pests: Monitor for aphids and termites. Apply Quinalphos 25EC @ 1.5L/ha for aphids. Use resistant varieties like HD-2967. Maintain proper plant spacing. Treat seeds before sowing.",
                'cotton': "For cotton pests: Pink bollworm - use pheromone traps (5/ha), apply Emamectin Benzoate 5% SG @ 220g/ha. For whitefly - apply Diafenthiuron 50% WP @ 600g/ha. Use Bt cotton varieties. Destroy crop residue after harvest.",
                'vegetable': "For vegetable pests: IPM approach - neem oil 5ml/L, pheromone traps, sticky traps. Hand-pick large pests. Encourage beneficial insects (ladybugs, lacewings). Apply BT for caterpillars. Crop rotation essential.",
                'general': "For pest management, use IPM: 1) Identify pest correctly, 2) Cultural practices (rotation, resistant varieties), 3) Mechanical (traps, hand-picking), 4) Biological (BT, neem, beneficial insects), 5) Chemical pesticides as last resort. Follow label doses."
            },
            'Crop Disease': {
                'rice': "For rice diseases: Blast - apply Tricyclazole 75% WP @ 0.6g/L. Bacterial blight - apply Copper oxychloride 50% WP @ 2.5g/L. Sheath blight - apply Hexaconazole 5% EC @ 1ml/L. Use resistant varieties. Maintain field sanitation.",
                'wheat': "For wheat diseases: Yellow/Stripe rust - apply Propiconazole 25% EC @ 0.1%. Karnal bunt - seed treatment with Carboxin 75% WP. Loose smut - treat seeds with Carboxin. Use resistant varieties like HD-3086.",
                'cotton': "For cotton diseases: Boll rot - spray Copper oxychloride + Streptocycline. Wilt - use resistant varieties, biocontrol with Trichoderma. Black arm - destroy infected debris.",
                'tomato': "For tomato diseases: Early blight - Mancozeb 75% WP @ 2.5g/L. Late blight - Metalaxyl + Mancozeb @ 2.5g/L. Leaf curl virus - control whitefly with neem oil. Use resistant varieties. Stake plants for air circulation.",
                'mildew': "For powdery mildew: Apply Wettable Sulfur 3g/L or Carbendazim 1g/L at first sign. Repeat after 10-15 days. Improve air circulation. Avoid overhead irrigation. Remove infected leaves.",
                'general': "For disease management: 1) Use disease-resistant varieties, 2) Crop rotation (2-3 years), 3) Field sanitation, 4) Proper spacing for air flow, 5) Apply appropriate fungicide based on disease, 6) Treat seeds before sowing."
            },
            'Irrigation': {
                'drip': "Drip irrigation setup: Use 16mm laterals with 4-8 LPH emitters spaced 30-60cm apart. Maintain 1-2 kg/cm² pressure. Flush lines monthly. Install filters. Saves 40-60% water. Suitable for vegetables, fruits, sugarcane.",
                'wheat': "Wheat irrigation: Critical stages - Crown root (21 DAS), tillering (45 DAS), jointing (65 DAS), flowering (85 DAS), grain filling (100 DAS). Apply 4-6 irrigations of 5-7cm depth. Avoid waterlogging.",
                'rice': "Rice water management: Maintain 2-5cm water during transplanting to tillering. Drain field during panicle initiation. Maintain 5cm water during grain filling. Alternate wetting and drying (AWD) saves water.",
                'general': "Irrigation best practices: 1) Irrigate early morning/evening, 2) Use tensiometer to monitor soil moisture, 3) Apply mulch to retain moisture, 4) Follow critical irrigation stages for your crop, 5) Consider drip/sprinkler for water efficiency."
            },
            'Fertilizers': {
                'urea': "Urea application: Split into 3 doses - basal (50%), at tillering/flowering (25% each). Apply in furrows, not on soil surface. Don't mix with DAP or SSP. Use neem-coated urea for slow release.",
                'npk': "NPK application: Get soil tested first. Apply based on STCR (soil test crop response). For most crops - N:P:K = 4:2:1 (vegetative) or 2:1:2 (flowering). Use DAP at sowing, MOP at flowering.",
                'organic': "Organic fertilizers: FYM (10-15 t/ha), vermicompost (5 t/ha), green manure (sun hemp/dhaincha). Apply 2-3 weeks before sowing. Improves soil structure and water retention.",
                'general': "Fertilizer tips: 1) Soil test before application, 2) Use balanced NPK based on crop needs, 3) Apply at right growth stage, 4) Split nitrogen application, 5) Combine organic + inorganic, 6) Don't over-apply."
            },
            'Weather': {
                'frost': "Frost protection: 1) Irrigate before frost night, 2) Use straw mulch, 3) Smoke screens with crop residue, 4) Wind breaks, 5) Cover young plants with agro-textile, 6) Plant frost-tolerant varieties.",
                'drought': "Drought management: 1) Choose drought-resistant varieties, 2) Mulching to conserve moisture, 3) Drip irrigation, 4) Practice conservation tillage, 5) Harvest rainwater, 6) Apply anti-transpirants (kaolin spray).",
                'monsoon': "Monsoon preparation: 1) Clean drainage channels, 2) Prepare raised beds for waterlogging-sensitive crops, 3) Stock seeds for re-sowing, 4) Check farm machinery, 5) Pre-monsoon sowing of long-duration crops.",
                'general': "Weather advisory: Follow IMD updates. Subscribe to local agro-met advisories. Plan sowing/harvesting based on weather forecasts. Use crop insurance (PMFBY) to manage weather risks."
            },
            'Soil Health': {
                'ph': "Soil pH management: For acidic soil (pH < 6), apply lime 2-5 t/ha. For alkaline soil (pH > 8), apply gypsum 5-10 t/ha. Get soil tested every 2-3 years. Most crops prefer pH 6.0-7.5.",
                'organic': "Improve soil organic matter: Add FYM/compost 10 t/ha annually. Practice green manuring (sun hemp). Use crop residues. Adopt conservation tillage. Rotate with legumes.",
                'test': "Soil testing: Collect samples in zigzag pattern from 0-15cm depth. Get tested at KVK or soil testing lab. Test for pH, N, P, K, micronutrients. Repeat every 2-3 years.",
                'general': "Soil health management: 1) Get soil tested, 2) Add organic matter regularly, 3) Practice crop rotation, 4) Avoid over-tillage, 5) Maintain proper drainage, 6) Use cover crops."
            },
            'Seeds': {
                'general': "Seed selection tips: 1) Use certified seeds from authorized dealers, 2) Treat seeds with Thiram/Carbendazim before sowing, 3) Choose varieties suited to your region, 4) Check germination rate before sowing, 5) Store seeds properly to maintain viability.",
                'treatment': "Seed treatment: For fungal diseases - Thiram 75% WP @ 2.5g/kg seed. For bacterial - Streptocycline. For pest - Imidacloprid 70% WS @ 7g/kg. Treat 1 day before sowing.",
                'rate': "Seed rate: Wheat - 100 kg/ha, Rice (transplanted) - 20-25 kg/ha, Maize - 20 kg/ha, Cotton - 15-20 kg/ha, Soybean - 65-75 kg/ha. Adjust based on germination test."
            }
        }

        # Try to match specific crop + topic
        for crop_key in ['rice', 'wheat', 'cotton', 'tomato', 'vegetable', 'mildew']:
            if crop_key in query_lower:
                crop_answers = knowledge_base.get(domain, {})
                if crop_key in crop_answers:
                    return crop_answers[crop_key]

        # Try to match specific topic
        for topic_key in ['drip', 'urea', 'npk', 'organic', 'frost', 'drought', 'monsoon', 'ph', 'test', 'treatment', 'rate']:
            if topic_key in query_lower:
                topic_answers = knowledge_base.get(domain, {})
                if topic_key in topic_answers:
                    return topic_answers[topic_key]

        # Use domain general answer
        domain_answers = knowledge_base.get(domain, {})
        if 'general' in domain_answers:
            return domain_answers['general']

        # Ultimate fallback for agriculture queries
        return (
            f"Thank you for your question about: {query}.\n\n"
            f"This appears to be a {domain.lower()} question. Here are general guidelines:\n\n"
            "1. Get specific information from your local Krishi Vigyan Kendra (KVK) or agricultural extension officer\n"
            "2. Consider your local climate, soil type, and seasonal conditions\n"
            "3. Start with low-cost, sustainable practices\n"
            "4. Document what works for future reference\n\n"
            "_This is an AI-generated answer. An expert will review and refine this within 2 hours._"
        )

    def _add_pending_entry(self, question: str, ai_answer: str, language: str) -> Dict:
        """Add new entry to GDB with pending_review status (reviewer pipeline)"""
        entry_id = f"gdb_ai_{hashlib.md5(question.encode()).hexdigest()[:8]}_{int(datetime.utcnow().timestamp())}"

        entry = {
            "_id": entry_id,
            "question": question,
            "answer": ai_answer,
            "ai_answer": ai_answer,
            "domain": self._detect_domain(question),
            "language": language,
            "state": None,
            "keywords": list(self.extract_keywords(question))[:10],
            "status": "pending_review",  # In reviewer pipeline
            "source": "ai_generated",
            "generated_at": datetime.utcnow(),
            "review_requested_at": datetime.utcnow(),
            "reviewed_at": None,
            "reviewer": None,
            "feedback_count": 0,
            "helpful_count": 0,
            "not_helpful_count": 0,
            "is_disclaimer_triggered": True
        }

        self.db.gdb_entries.insert_one(entry)
        return entry

    def _notify_experts(self, question: str, answer: str, entry: Dict):
        """Notify agri team for review (2-hour pipeline)"""
        notification = {
            "entry_id": entry["_id"],
            "question": question,
            "ai_answer": answer,
            "domain": entry.get("domain"),
            "language": entry.get("language"),
            "status": "pending",
            "priority": "normal",
            "created_at": datetime.utcnow(),
            "notified_at": datetime.utcnow(),
            "expected_response_time_hours": 2,
            "is_disclaimer_triggered": True
        }
        self.db.review_requests.insert_one(notification)
        print(f"📧 Expert review requested for entry: {entry['_id']}")

    def _detect_domain(self, question: str) -> str:
        """Detect the domain from the question"""
        q = question.lower()

        if any(w in q for w in ['pest', 'insect', 'worm', 'bollworm', 'planthopper', 'aphid', 'whitefly', 'thrips', 'mite']):
            return 'Pest Control'
        if any(w in q for w in ['disease', 'blight', 'mildew', 'rot', 'fungus', 'virus', 'rust', 'wilt', 'smut']):
            return 'Crop Disease'
        if any(w in q for w in ['water', 'irrigat', 'drip', 'rain', 'moisture', 'tensiometer']):
            return 'Irrigation'
        if any(w in q for w in ['fertiliz', 'urea', 'npk', 'manure', 'compost', 'nutrient', 'dap', 'ssp']):
            return 'Fertilizers'
        if any(w in q for w in ['weather', 'frost', 'temperature', 'climate', 'monsoon', 'rain', 'drought']):
            return 'Weather'
        if any(w in q for w in ['soil', 'ph', 'acidity', 'organic matter', 'gypsum', 'lime']):
            return 'Soil Health'
        if any(w in q for w in ['harvest', 'post-harvest', 'storage', 'grain', 'threshing']):
            return 'Harvesting'
        if any(w in q for w in ['seed', 'sowing', 'planting', 'germination', 'treatment']):
            return 'Seeds'

        return 'General Agriculture'


matcher = QuestionMatcher()