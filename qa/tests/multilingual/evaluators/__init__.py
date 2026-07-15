"""Evaluators package for the AjraSakha multilingual testing suite.

Each evaluator is a small, composable function with the same signature::

    evaluate(response: AjraSakhaResponse, case: TestCase, scenario: Scenario) -> EvalResult

so they can be chained in any order, mocked individually in unit tests,
and re-used from both the pytest harness and the ``run_suite.py``
orchestrator.
"""
from .language_detector import (  # noqa: F401
    detect_response_language,
    detect_language_switch,
    script_ratio,
)
from .gdb_accuracy import evaluate_gdb_accuracy  # noqa: F401
from .disclaimer_check import evaluate_disclaimer  # noqa: F401
from .transliteration_check import evaluate_transliteration  # noqa: F401
from .language_switch_check import evaluate_language_switch  # noqa: F401

__all__ = [
    "detect_response_language",
    "detect_language_switch",
    "script_ratio",
    "evaluate_gdb_accuracy",
    "evaluate_disclaimer",
    "evaluate_transliteration",
    "evaluate_language_switch",
]