"""pytest fixtures for the AjraSakha multilingual testing suite."""
from __future__ import annotations

from typing import Dict, List

import pytest

from qa.tests.multilingual.client import (
    AjraSakhaClient,
    MockAjraSakhaClient,
)
from qa.tests.multilingual.scenarios import FARMING_SCENARIOS
from qa.tests.multilingual.translations import (
    get_flat_test_cases,
    get_translation_lookup,
)


@pytest.fixture(scope="session")
def scenarios() -> List[dict]:
    """Return the canonical 30 farming scenarios."""
    return list(FARMING_SCENARIOS)


@pytest.fixture(scope="session")
def translations() -> Dict[str, Dict[str, str]]:
    """Return the full translation lookup ``scenario_id -> {lang: prompt}``."""
    return get_translation_lookup()


@pytest.fixture(scope="session")
def flat_cases() -> List[dict]:
    """Return the flat list of 180 (case_id, scenario_id, language, prompt)."""
    return get_flat_test_cases()


@pytest.fixture(scope="session")
def ajrasakha_client() -> AjraSakhaClient:
    """Yield the default AjraSakha client (mock by default)."""
    return MockAjraSakhaClient()