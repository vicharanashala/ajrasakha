"""Multilingual test scenario package.

Exposes the canonical 30-scenario list used by the cross-lingual test
suite.  Each scenario belongs to exactly one of the five supported
agriculture domains and includes enough metadata (location, expected
GDB key, expected entities, expected crop, expected scheme/chemical)
to drive both routing and language-quality assertions downstream.
"""
from .farming_scenarios import FARMING_SCENARIOS, DOMAINS, get_scenarios_by_domain

__all__ = ["FARMING_SCENARIOS", "DOMAINS", "get_scenarios_by_domain"]
