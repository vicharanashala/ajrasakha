import pytest


@pytest.fixture(autouse=True)
def _jev_env(monkeypatch):
    for k in list(__import__("os").environ):
        if k.startswith("JEV_"):
            monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key-not-real")
    monkeypatch.setenv("TYPESAFE_API_KEY", "test-key-not-real")
