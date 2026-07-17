from __future__ import annotations

from ajrasakha.tools.answer_shortener.config import Settings


def test_default_model_is_pinned_sonnet(monkeypatch):
    monkeypatch.delenv("ANSWER_SHORTENER_MODEL", raising=False)

    settings = Settings.from_env()

    assert settings.model == "claude-sonnet-4-6"


def test_model_can_still_be_overridden_by_deployment(monkeypatch):
    monkeypatch.setenv("ANSWER_SHORTENER_MODEL", "deployment-selected-model")

    settings = Settings.from_env()

    assert settings.model == "deployment-selected-model"
