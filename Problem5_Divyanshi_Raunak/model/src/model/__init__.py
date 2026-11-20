"""
Agri-Jargon Simplifier (Village-Level Normalizer)
Author: Data Science Track (Project 5 - AjraSakha / ANNAM.AI)
"""
from .engine import AgriSimplifier
from .agri_lexicon import CHEMICAL_REGISTRY, TANKI_CAPACITY_LITERS
from .demo import main

__all__ = ["AgriSimplifier", "CHEMICAL_REGISTRY", "TANKI_CAPACITY_LITERS", "main"]
