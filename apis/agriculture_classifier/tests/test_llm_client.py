import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from classifier import llm_client


def test_detect_language_skips_llm_for_single_script(monkeypatch):
    def _fail_if_called(*args, **kwargs):
        raise AssertionError("_chat_completion should not be called for an unambiguous script")

    monkeypatch.setattr(llm_client, "_chat_completion", _fail_if_called)

    assert llm_client.detect_language("வேளாண்மை பற்றிய கேள்வி") == "Tamil"


def test_detect_language_calls_narrowed_llm_for_shared_script(monkeypatch):
    monkeypatch.setattr(llm_client, "_chat_completion", lambda messages, **kw: '{"language": "Hindi"}')
    assert llm_client.detect_language("कृषि संबंधित प्रश्न") == "Hindi"


def test_detect_language_falls_back_to_english_when_llm_answers_outside_candidates(monkeypatch):
    # "Tamil" is a real known language, just not a Devanagari candidate -
    # proves the fallback is keyed on "not in the narrowed set", not on
    # whether the string happens to be a recognized language at all.
    monkeypatch.setattr(llm_client, "_chat_completion", lambda messages, **kw: '{"language": "Tamil"}')
    assert llm_client.detect_language("कृषि संबंधित प्रश्न") == "English"
