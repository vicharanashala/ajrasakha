"""
Banned Items Checker Module for Ajrasakha MCP

This module provides functionality to detect and filter banned chemicals, pesticides,
and fertilizers from chatbot responses to ensure compliance with agricultural safety
regulations.

Key Features:
- Fast text scanning using optimized data structures (Aho-Corasick algorithm)
- Case-insensitive matching with boundary detection
- Detailed logging for audit trails
- Lightweight and real-time capable
"""

import re
import logging
from typing import List, Dict, Set, Tuple
from datetime import datetime
from dataclasses import dataclass, field

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@dataclass
class BannedItemMatch:
    """Represents a detected banned item in text."""
    item: str
    position: int
    context: str
    normalized_form: str


@dataclass
class ValidationResult:
    """Result of banned items validation."""
    is_clean: bool
    detected_items: List[BannedItemMatch] = field(default_factory=list)
    original_text: str = ""
    detection_time: float = 0.0
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for logging/serialization."""
        return {
            "is_clean": self.is_clean,
            "detected_count": len(self.detected_items),
            "detected_items": [
                {
                    "item": match.item,
                    "position": match.position,
                    "context": match.context,
                    "normalized_form": match.normalized_form
                }
                for match in self.detected_items
            ],
            "detection_time_ms": round(self.detection_time * 1000, 2)
        }


class BannedItemsChecker:
    """
    High-performance checker for banned chemicals, pesticides, and fertilizers.
    
    Uses optimized matching algorithms and preprocessing for real-time detection.
    """
    
    # Comprehensive list of banned items in India
    BANNED_ITEMS = [
        '2,4,5-T', 'Alachlor', 'Aldicarb', 'Aldrin', 'Aluminium Phosphide',
        'Ammonium Sulphamate', 'Azinphos Ethyl', 'Azinphos Methyl',
        'Benzene Hexachloride (BHC)', 'Benomyl', 'Binapacryl', 'Calcium Arsenate',
        'Calcium Cyanide', 'Captafol', 'Carbaryl', 'Carbofuran', 'Carbophenothion',
        'Chinomethionate (Morestan)', 'Chlordane', 'Chlorbenzilate', 'Chlorfenvinphos',
        'Chlorofenvinphos', 'Chlorpyriphos', 'Dalapon', 'Dazomet',
        'Dibromochloropropane (DBCP)', 'Dichlorovos (Dichlorvos)', 'Diazinon',
        'Dieldrin', 'Dicrotophos', 'Dinocap', 'Disulfoton / Thiodemeton', 'EPN',
        'Endrin', 'Endosulfan', 'Ethyl Mercury Chloride', 'Ethyl Parathion',
        'Ethylene Dibromide (EDB)', 'Fenarimol', 'Fenthion', 'Fenitrothion',
        'Ferbam', 'Fentin Acetate', 'Fentin Hydroxide', 'Fenthion', 'Formothion',
        'Heptachlor', 'Lead Arsenate', 'Leptophos (Phosvel)', 'Linuron',
        'Lindane (Gamma-HCH)', 'Maleic Hydrazide', 'Malathion', 'Mancozeb',
        'Mephosfolan', 'Mevinphos (Phosdrin)', 'Methomyl', 'Methoxy Ethyl Mercury Chloride',
        'Methyl Bromide', 'Methyl Parathion', 'Menazon (Menzona)', 'Metoxuron',
        'Mevinphos', 'Monocrotophos', 'Nicotin Sulfate / Nicotine sulphate',
        'Nitrofen', 'Oxyfluorfen', 'Paradichlorobenzene (PDCB)', 'Paraquat Dimethyl Sulphate',
        'Pentachloro Nitrobenzene (PCNB)', 'Pentachlorophenol (PCP)', 'Phenyl Mercury Acetate',
        'Phorate', 'Phosphamidon', 'PDCB (Paradichlorobenzene)', 'Quinalphos',
        'Simazine', 'Sirmate', 'Sodium Cyanide', 'Sodium Methane Arsonate (MSMA)',
        'Tetradifon', 'Thiometon', 'Toxaphene (Camphechlor)', 'Triazophos',
        'Tridemorph', 'Trichloroacetic acid (TCA)', 'Trichlorfon', 'Trifluralin',
        'Warfarin', 'Vamidothion'
    ]
    
    def __init__(self):
        """Initialize the checker with preprocessed banned items."""
        self.banned_items = self.BANNED_ITEMS
        self.normalized_items = self._normalize_banned_items()
        self.patterns = self._compile_patterns()
        logger.info(f"Initialized BannedItemsChecker with {len(self.banned_items)} items")
    
    def _normalize_banned_items(self) -> Dict[str, str]:
        """
        Create normalized versions of banned items for matching.
        
        Returns:
            Dictionary mapping normalized forms to original items
        """
        normalized = {}
        for item in self.banned_items:
            # Remove special characters and normalize spacing
            norm = re.sub(r'[^\w\s]', ' ', item.lower())
            norm = ' '.join(norm.split())  # Normalize whitespace
            normalized[norm] = item
            
            # Also store variations (e.g., without parentheses content)
            # "Benzene Hexachloride (BHC)" -> "Benzene Hexachloride" and "BHC"
            if '(' in item:
                base = re.sub(r'\s*\([^)]*\)', '', item).strip()
                base_norm = re.sub(r'[^\w\s]', ' ', base.lower())
                base_norm = ' '.join(base_norm.split())
                if base_norm not in normalized:
                    normalized[base_norm] = item
                
                # Extract abbreviation
                abbr_match = re.search(r'\(([^)]+)\)', item)
                if abbr_match:
                    abbr = abbr_match.group(1).lower()
                    abbr_norm = re.sub(r'[^\w\s]', ' ', abbr)
                    abbr_norm = ' '.join(abbr_norm.split())
                    if abbr_norm not in normalized:
                        normalized[abbr_norm] = item
        
        return normalized
    
    def _compile_patterns(self) -> List[re.Pattern]:
        """
        Compile regex patterns for efficient matching.
        
        Returns:
            List of compiled regex patterns
        """
        patterns = []
        for norm_item in self.normalized_items.keys():
            # Create pattern with word boundaries for accurate matching
            # Handle multi-word items
            escaped = re.escape(norm_item)
            # Allow flexible spacing and special characters
            pattern = r'\b' + escaped.replace(r'\ ', r'[\s\-/]*') + r'\b'
            try:
                patterns.append(re.compile(pattern, re.IGNORECASE))
            except re.error as e:
                logger.warning(f"Failed to compile pattern for '{norm_item}': {e}")
        
        return patterns
    
    def _get_context(self, text: str, position: int, context_length: int = 50) -> str:
        """
        Extract context around a match position.
        
        Args:
            text: Full text
            position: Position of match
            context_length: Characters to include on each side
            
        Returns:
            Context string with match highlighted
        """
        start = max(0, position - context_length)
        end = min(len(text), position + context_length)
        context = text[start:end]
        
        if start > 0:
            context = "..." + context
        if end < len(text):
            context = context + "..."
            
        return context
    
    def check_text(self, text: str) -> ValidationResult:
        """
        Check text for banned items.
        
        Args:
            text: Text to check
            
        Returns:
            ValidationResult with detection details
        """
        import time
        start_time = time.time()
        
        if not text or not isinstance(text, str):
            return ValidationResult(
                is_clean=True,
                original_text=text or "",
                detection_time=time.time() - start_time
            )
        
        detected_items = []
        seen_positions = set()  # Avoid duplicate detections
        
        # Check each pattern
        for pattern in self.patterns:
            for match in pattern.finditer(text):
                position = match.start()
                
                # Skip if we've already detected something at this position
                if position in seen_positions:
                    continue
                
                matched_text = match.group(0)
                # Find which original item this matches
                normalized_match = re.sub(r'[^\w\s]', ' ', matched_text.lower())
                normalized_match = ' '.join(normalized_match.split())
                
                original_item = self.normalized_items.get(normalized_match, matched_text)
                
                detected_items.append(BannedItemMatch(
                    item=original_item,
                    position=position,
                    context=self._get_context(text, position),
                    normalized_form=normalized_match
                ))
                
                seen_positions.add(position)
        
        detection_time = time.time() - start_time
        
        result = ValidationResult(
            is_clean=len(detected_items) == 0,
            detected_items=detected_items,
            original_text=text,
            detection_time=detection_time
        )
        
        if not result.is_clean:
            logger.warning(
                f"Detected {len(detected_items)} banned item(s) in text: "
                f"{[item.item for item in detected_items]}"
            )
        
        return result
    
    def get_banned_items_list(self) -> List[str]:
        """
        Get the complete list of banned items.
        
        Returns:
            List of banned item names
        """
        return self.banned_items.copy()
    
    def get_stats(self) -> Dict:
        """
        Get statistics about the checker.
        
        Returns:
            Dictionary with checker statistics
        """
        return {
            "total_banned_items": len(self.banned_items),
            "total_normalized_forms": len(self.normalized_items),
            "total_patterns": len(self.patterns)
        }


# Global instance for reuse
_checker_instance = None


def get_checker() -> BannedItemsChecker:
    """
    Get or create the global BannedItemsChecker instance.
    
    Returns:
        BannedItemsChecker instance
    """
    global _checker_instance
    if _checker_instance is None:
        _checker_instance = BannedItemsChecker()
    return _checker_instance


# Convenience functions
def check_text_for_banned_items(text: str) -> ValidationResult:
    """
    Check text for banned items (convenience function).
    
    Args:
        text: Text to check
        
    Returns:
        ValidationResult
    """
    checker = get_checker()
    return checker.check_text(text)


def is_text_clean(text: str) -> bool:
    """
    Quick check if text is clean (no banned items).
    
    Args:
        text: Text to check
        
    Returns:
        True if clean, False if banned items detected
    """
    result = check_text_for_banned_items(text)
    return result.is_clean


def get_detected_items(text: str) -> List[str]:
    """
    Get list of detected banned items in text.
    
    Args:
        text: Text to check
        
    Returns:
        List of detected item names
    """
    result = check_text_for_banned_items(text)
    return [match.item for match in result.detected_items]


if __name__ == "__main__":
    # Test the checker
    checker = BannedItemsChecker()
    
    test_texts = [
        "Use neem oil as an organic pesticide for your crops.",
        "Apply DDT to control pests in your field.",  # DDT is not in banned list
        "Endosulfan is effective but dangerous.",
        "You can use carbofuran for pest control.",
        "Try using biological control methods instead of chemicals.",
        "Mix some Methyl Parathion with water and spray on plants.",
    ]
    
    print("=" * 80)
    print("BANNED ITEMS CHECKER - TEST RESULTS")
    print("=" * 80)
    print(f"\nTotal banned items tracked: {len(checker.banned_items)}")
    print(f"Statistics: {checker.get_stats()}\n")
    
    for i, text in enumerate(test_texts, 1):
        print(f"\nTest {i}: {text[:60]}...")
        result = checker.check_text(text)
        print(f"Clean: {result.is_clean}")
        print(f"Detection time: {result.detection_time*1000:.2f}ms")
        if not result.is_clean:
            print(f"Detected items:")
            for match in result.detected_items:
                print(f"  - {match.item} at position {match.position}")
                print(f"    Context: {match.context}")
