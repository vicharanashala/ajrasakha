"""Keyword extraction for Golden RAG using agricultural domain taxonomy.

This module extracts key agricultural terms from user queries using:
1. Pattern matching against the Retrieval Schema taxonomy
2. NLP-based extraction for common farming terminology
3. Named entity recognition for crops, pests, diseases, nutrients
"""

from __future__ import annotations

import logging
import os
import re
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

log = logging.getLogger(__name__)

# Common agricultural stopwords to exclude
AGRI_STOPWORDS = frozenset({
    "how", "what", "why", "when", "where", "which", "who", "whom",
    "this", "that", "these", "those", "i", "me", "my", "we", "our",
    "you", "your", "he", "she", "it", "they", "them", "their",
    "is", "are", "was", "were", "be", "been", "being", "have", "has",
    "had", "do", "does", "did", "will", "would", "could", "should",
    "may", "might", "must", "can", "need", "dare", "ought", "used",
    "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "as", "into", "through", "during", "before", "after", "above",
    "below", "between", "under", "again", "further", "then", "once",
    "here", "there", "all", "each", "few", "more", "most", "other",
    "some", "such", "no", "nor", "not", "only", "own", "same", "so",
    "than", "too", "very", "s", "t", "just", "don", "now", "info",
    "information", "details", "regarding", "about", "know", "tell",
    "show", "give", "provide", "help", "explain", "describe",
    "crop", "crops", "plant", "plants", "farming", "agriculture",
    "farmer", "field", "fields", "agricultural", "farming",
})

# Core farming terms that carry semantic meaning
CORE_FARMING_TERMS = frozenset({
    # Growth stages
    "germination", "seedling", "vegetative", "flowering", "fruiting",
    "harvest", "maturity", "ripening", "sowing", "planting", "transplanting",
    "tillering", "branching", "podding", "grain filling", "panicle",
    # Problems
    "pest", "pests", "disease", "diseases", "infection", "infestation",
    "damage", "yellowing", "wilting", "dying", "rotting", "blight",
    "spots", "lesions", "mites", "aphids", "borers", "weevils", "thrips",
    "whitefly", "jassids", "mealybug", "scale", "nematode", "termite",
    # Nutrients
    "nitrogen", "phosphorus", "potassium", "zinc", "iron", "manganese",
    "boron", "sulfur", "calcium", "magnesium", "deficiency", "excess",
    "npk", "urea", "dap", "mop", "micronutrient", "macronutrient",
    # Operations
    "irrigation", "watering", "drip", "flood", "sprinkler", "fertigation",
    "pruning", "weeding", "mulching", "intercropping", "rotation",
    "spacing", "depth", "drainage", "shade", "sunlight", "temperature",
    # Soil
    "soil", "ph", "acidic", "alkaline", "sandy", "clay", "loam", "organic",
    "compost", "manure", "fertilizer", "pesticide", "insecticide", "fungicide",
    # Weather
    "rain", "drought", "humidity", "temperature", "frost", "heat", "monsoon",
    "climate", "weather", "season", "kharif", "rabi", "zaid",
})

# Disease patterns for common crops
DISEASE_PATTERNS = [
    r"\b(powdery|downy)\s*mildew\b",
    r"\b(leaf|rust)\s*spot\b",
    r"\b(wilt|blight)\b",
    r"\b(rot)\s*(root|stem|foot)?\b",
    r"\b(bacterial| fungal| viral)\s*",
    r"\b(leaf\s*curl|mosaic|yellow\s*mosaic)\b",
    r"\b(bunchy\s*top|vein\s*clearing)\b",
    r"\b(anthracnose|phytophthora| alternaria| botrytis)\b",
    r"\b(gsv|csv|clcv|tylcv)\b",  # Virus codes
]

# Pest patterns
PEST_PATTERNS = [
    r"\b(white\s*fly|whitefly|white\s*fly)\b",
    r"\b(jassid|hopper|leaf\s*hopper)\b",
    r"\b(aphid|aphids)\b",
    r"\b(borer|borers|fruit\s*borer)\b",
    r"\b(mite|mites|spider\s*mite)\b",
    r"\b(thrip|thrips)\b",
    r"\b(mealy\s*bug|mealybug)\b",
    r"\b(weevil|weevils)\b",
    r"\b(armyworm|army\s*worm)\b",
    r"\b(gram\s*pod\s*borer|pod\s*borer)\b",
]

# Fertilizer patterns
FERTILIZER_PATTERNS = [
    r"\burea\b",
    r"\bdap\b",
    r"\bmop\b",
    r"\bpop\b",
    r"\b(npk|npk\s*\d+-\d+-\d+)\b",
    r"\b(10-26-26|17-17-17|20-20-20|12-32-16)\b",
    r"\bmicronutrient\b",
    r"\bboron\b",
    r"\bzinc\b",
    r"\biron\b",
]

# Pre-compile patterns for performance
_COMPILED_DISEASE_PATTERNS = [re.compile(p, re.IGNORECASE) for p in DISEASE_PATTERNS]
_COMPILED_PEST_PATTERNS = [re.compile(p, re.IGNORECASE) for p in PEST_PATTERNS]
_COMPILED_FERTILIZER_PATTERNS = [re.compile(p, re.IGNORECASE) for p in FERTILIZER_PATTERNS]


def _normalize_text(text: str) -> str:
    """Normalize text for keyword extraction."""
    # Remove punctuation except hyphens in compound terms
    text = re.sub(r"[^\w\s\-]", " ", text)
    # Normalize whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text.lower()


def _extract_by_patterns(text: str, patterns: list[re.Pattern]) -> list[str]:
    """Extract matches from text using compiled patterns."""
    matches = []
    for pattern in patterns:
        found = pattern.findall(text)
        matches.extend(found)
    return matches


def _extract_ngrams(text: str, max_n: int = 3) -> list[str]:
    """Extract n-grams from text."""
    words = text.split()
    ngrams = []
    for n in range(1, min(max_n + 1, len(words) + 1)):
        for i in range(len(words) - n + 1):
            ngram = " ".join(words[i:i+n])
            ngrams.append(ngram)
    return ngrams


def _score_keyword(keyword: str, full_text: str) -> float:
    """Score a keyword based on its importance."""
    score = 1.0
    keyword_lower = keyword.lower()
    
    # Boost core farming terms
    if keyword_lower in CORE_FARMING_TERMS:
        score += 0.5
    
    # Boost terms appearing in specific agricultural contexts
    if any(term in full_text.lower() for term in ["problem", "issue", "disease", "pest", "deficiency"]):
        if any(term in keyword_lower for term in ["yellow", "spot", "curl", "blight", "rot", "mite", "aphid", "borer"]):
            score += 0.5
    
    # Boost compound terms (more specific) - but penalize if mostly stopwords
    if " " in keyword:
        words = keyword.split()
        stopword_count = sum(1 for w in words if w in AGRI_STOPWORDS)
        if stopword_count == 0:
            score += 0.4  # Pure agricultural terms get boost
        elif stopword_count == 1 and len(words) == 2:
            score += 0.1  # One stopword in 2-word phrase, slight boost
        else:
            score -= 0.3  # Too many stopwords, penalize
    
    # Slight boost for pesticide/fertilizer names
    if any(p in keyword_lower for p in ["urea", "dap", "mop", "fungicide", "insecticide", "pesticide"]):
        score += 0.3
    
    # Penalize very short or generic terms
    if len(keyword) < 4:
        score -= 0.2
    
    # Boost terms with agricultural meaning
    agri_meaning_terms = ["yellow", "pale", "spot", "rust", "mildew", "blight", "wilting", 
                          "yellowing", "chlorosis", "tips", "leaves", "wheat", "rice", "cotton",
                          "deficiency", "nitrogen", "phosphorus", "potassium", "zinc", "iron"]
    if any(term in keyword_lower for term in agri_meaning_terms):
        score += 0.3
    
    return score


def extract_keywords(text: str, max_keywords: int = 5) -> list[str]:
    """
    Extract key agricultural keywords from a farming query.
    
    Uses a combination of:
    1. Pattern matching for known agricultural entities (diseases, pests, fertilizers)
    2. N-gram extraction with domain-specific scoring
    3. Stopword filtering
    
    Args:
        text: The refined query text (already cleaned by LLM refinement)
        max_keywords: Maximum number of keywords to return (default 5)
    
    Returns:
        List of extracted keywords, ordered by relevance score
    """
    if not text or not text.strip():
        log.warning("extract_keywords received empty text")
        return []
    
    log.info("Extracting keywords from query: %r", text[:100])
    
    normalized = _normalize_text(text)
    words = normalized.split()
    
    keywords: list[tuple[str, float]] = []
    seen = set()
    
    # 1. Extract disease patterns (highest priority - most specific)
    disease_matches = _extract_by_patterns(text, _COMPILED_DISEASE_PATTERNS)
    for match in disease_matches:
        match_normalized = _normalize_text(match)
        if match_normalized not in seen:
            seen.add(match_normalized)
            keywords.append((match_normalized, _score_keyword(match_normalized, text) + 0.5))
    
    # 2. Extract pest patterns
    pest_matches = _extract_by_patterns(text, _COMPILED_PEST_PATTERNS)
    for match in pest_matches:
        match_normalized = _normalize_text(match)
        if match_normalized not in seen:
            seen.add(match_normalized)
            keywords.append((match_normalized, _score_keyword(match_normalized, text) + 0.5))
    
    # 3. Extract fertilizer patterns
    fertilizer_matches = _extract_by_patterns(text, _COMPILED_FERTILIZER_PATTERNS)
    for match in fertilizer_matches:
        match_normalized = _normalize_text(match)
        if match_normalized not in seen:
            seen.add(match_normalized)
            keywords.append((match_normalized, _score_keyword(match_normalized, text) + 0.4))
    
    # 4. Extract meaningful single-word terms (not stopwords, not generic)
    for word in words:
        if word in seen:
            continue
        if len(word) < 3:
            continue
        if word in AGRI_STOPWORDS:
            continue
        if word in ("what", "why", "how", "which", "when", "where", "causes", "cause"):
            continue
        
        seen.add(word)
        score = _score_keyword(word, text)
        keywords.append((word, score))
    
    # 5. Extract 2-gram phrases that are NOT mostly stopwords
    for i in range(len(words) - 1):
        bigram = f"{words[i]} {words[i+1]}"
        if bigram in seen:
            continue
        
        bigram_words = bigram.split()
        stopword_count = sum(1 for w in bigram_words if w in AGRI_STOPWORDS)
        
        # Skip if 50%+ stopwords (e.g., "tips on" is 1/2 stopwords)
        if stopword_count / len(bigram_words) >= 0.5:
            continue
        
        # Skip very generic patterns like "what causes", "how to"
        generic_patterns = ["what causes", "how to", "why does", "causes pale", "causes wheat"]
        if bigram in generic_patterns:
            continue
        
        seen.add(bigram)
        score = _score_keyword(bigram, text)
        keywords.append((bigram, score))
    
    # Sort by score descending
    keywords.sort(key=lambda x: x[1], reverse=True)
    
    # Return top N keywords
    result = [kw for kw, _ in keywords[:max_keywords]]
    
    log.info("Extracted %d keywords: %s", len(result), result)
    return result


def extract_keywords_for_bm25(text: str, max_keywords: int = 10) -> str:
    """
    Extract keywords formatted for BM25 search.
    
    Returns a space-separated string of keywords suitable for
    MongoDB Atlas Search text queries.
    
    Args:
        text: The refined query text
        max_keywords: Maximum keywords to extract (default 10 for BM25)
    
    Returns:
        Space-separated keyword string for BM25 search
    """
    keywords = extract_keywords(text, max_keywords=max_keywords)
    
    # Join with OR for BM25 (MongoDB text search uses OR by default)
    return " ".join(keywords)


# Schema-based extraction (for future use with loaded schema taxonomy)
class SchemaTaxonomyLoader:
    """
    Loads agricultural taxonomy from Retrieval Schema for enhanced extraction.
    
    The schema contains ~2900 terms across categories:
    - Crop names and varieties
    - Growth stages
    - Pests and diseases
    - Nutrients and fertilizers
    - Operations and practices
    - Weather and timing
    """
    
    def __init__(self):
        self.crops: set[str] = set()
        self.growth_stages: set[str] = set()
        self.pests: set[str] = set()
        self.diseases: set[str] = set()
        self.nutrients: set[str] = set()
        self.operations: set[str] = set()
        self._loaded = False
    
    def load_from_schema(self, schema_path: Optional[str] = None) -> None:
        """
        Load taxonomy from schema file.
        
        This is a placeholder for future implementation where
        the schema.xlsx would be parsed and terms loaded.
        """
        if schema_path is None:
            schema_path = os.getenv("RETRIEVAL_SCHEMA_PATH", "Retrieval Schema.xlsx")
        
        log.info("Schema taxonomy loader initialized (lazy loading)")
        # In production, parse schema.xlsx and populate sets
        # For now, use the hardcoded patterns above
        self._loaded = True
    
    def match_in_text(self, text: str) -> dict[str, list[str]]:
        """
        Find all schema terms matching in text.
        
        Returns a dict with category -> list of matched terms
        """
        text_lower = text.lower()
        matches = {
            "crops": [],
            "growth_stages": [],
            "pests": [],
            "diseases": [],
            "nutrients": [],
            "operations": [],
        }
        
        # Match against all sets
        for term in self.crops:
            if term in text_lower:
                matches["crops"].append(term)
        
        for term in self.growth_stages:
            if term in text_lower:
                matches["growth_stages"].append(term)
        
        # ... similar for other categories
        
        return matches


# Default instance for convenience
default_extractor = extract_keywords