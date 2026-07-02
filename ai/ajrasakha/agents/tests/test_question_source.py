"""Tests for question_source resolution (config vs .env)."""

import os
from unittest.mock import patch

from ajrasakha.agents.config import resolve_question_source


def test_resolve_prefers_configurable():
    cfg = {"configurable": {"question_source": "WHATSAPP"}}
    with patch("ajrasakha.agents.config.QUESTION_SOURCE", "AJRASAKHA"):
        assert resolve_question_source(cfg) == "WHATSAPP"


def test_resolve_falls_back_to_env():
    with patch.dict("os.environ", {"QUESTION_SOURCE": "AJRASAKHA_WEBAPP"}, clear=False):
        assert resolve_question_source({}) == "AJRASAKHA_WEBAPP"
        assert resolve_question_source(None) == "AJRASAKHA_WEBAPP"


def test_resolve_empty_configurable_uses_env():
    cfg = {"configurable": {"question_source": "  "}}
    with patch.dict("os.environ", {"QUESTION_SOURCE": "AJRASAKHA"}, clear=False):
        assert resolve_question_source(cfg) == "AJRASAKHA"
