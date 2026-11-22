"""
Data Science Metrics & Evaluation for Agri-Jargon Simplifier
Calculates Jargon Density Reduction, Unit Practicality Rate, and Readability delta.
"""
import re
from typing import Dict, Any, List
from .engine import AgriSimplifier
from .dataset import BENCHMARK_DATASET

def calculate_jargon_density(text: str) -> float:
    """
    Computes ratio of scientific/chemical terms to total word count.
    """
    jargon_indicators = [
        "chlorantraniliprole", "imidacloprid", "thiamethoxam", "carbendazim",
        "mancozeb", "hexaconazole", "cypermethrin", "emamectin", "fipronil",
        "oxychloride", "sc", "sl", "wg", "wp", "ec", "sg", "prophylactic",
        "suppression", "infestation", "pathogen", "infestation", "pustules"
    ]
    words = re.findall(r"\b\w+\b", text.lower())
    if not words:
        return 0.0
    jargon_hits = sum(1 for w in words if w in jargon_indicators)
    return round((jargon_hits / len(words)) * 100, 2)

def evaluate_benchmark():
    simplifier = AgriSimplifier()
    results = []
    
    total_samples = len(BENCHMARK_DATASET)
    success_simplifications = 0
    total_pre_jargon = 0.0
    total_post_jargon = 0.0
    practical_units_added = 0
    
    for item in BENCHMARK_DATASET:
        tech_text = item["technical_text"]
        simplified = simplifier.simplify(tech_text, item["crop"])
        
        pre_jargon = calculate_jargon_density(tech_text)
        post_jargon = calculate_jargon_density(simplified["simplified_text"])
        
        has_tanki = "टंकी" in simplified["simplified_text"]
        has_dhakkan_or_chamach = ("ढक्कन" in simplified["simplified_text"]) or ("चम्मच" in simplified["simplified_text"])
        
        if simplified["is_simplified"]:
            success_simplifications += 1
            
        if has_tanki and has_dhakkan_or_chamach:
            practical_units_added += 1
            
        total_pre_jargon += pre_jargon
        total_post_jargon += post_jargon
        
        results.append({
            "id": item["id"],
            "crop": item["crop"],
            "detected_brand": simplified.get("recommended_brand"),
            "pre_jargon_pct": pre_jargon,
            "post_jargon_pct": post_jargon,
            "practical_unit": simplified.get("practical_unit")
        })
        
    avg_pre = round(total_pre_jargon / total_samples, 2)
    avg_post = round(total_post_jargon / total_samples, 2)
    jargon_reduction = round(((avg_pre - avg_post) / (avg_pre or 1)) * 100, 1)
    conversion_rate = round((practical_units_added / total_samples) * 100, 1)
    
    summary = {
        "total_test_queries": total_samples,
        "successful_simplification_rate": f"{round((success_simplifications / total_samples) * 100, 1)}%",
        "avg_scientific_jargon_before": f"{avg_pre}%",
        "avg_scientific_jargon_after": f"{avg_post}%",
        "jargon_density_reduction": f"{jargon_reduction}%",
        "practical_unit_coverage_rate": f"{conversion_rate}% (15L टंकी + ढक्कन/चम्मच)",
        "sample_evaluations": results[:4]
    }
    return summary
