from assistant import chemical_detector_client, guardrails, llm_client, operations
from assistant.models import LanguagePolishingStatus, LLMUnavailableError


def test_polish_draft_suggests_on_clean_grammar_fix(monkeypatch):
    monkeypatch.setattr(llm_client, "generate_polish", lambda draft: "The treatment is effective when farmers apply it correctly.")
    monkeypatch.setattr(chemical_detector_client, "detect_chemicals", lambda text: {})
    monkeypatch.setattr(llm_client, "check_meaning_preserved", lambda o, r: (False, ""))

    result = operations.polish_draft("The treatment are effective when farmers apply it correctly.")

    assert result.status == LanguagePolishingStatus.SUGGESTED
    assert result.suggested_text == "The treatment is effective when farmers apply it correctly."
    assert result.guardrail.status.value == "passed"


def test_polish_draft_rejects_on_guardrail_failure(monkeypatch):
    monkeypatch.setattr(llm_client, "generate_polish", lambda draft: "Apply 5 ml of the specified product per litre of water.")
    monkeypatch.setattr(chemical_detector_client, "detect_chemicals", lambda text: {})
    monkeypatch.setattr(llm_client, "check_meaning_preserved", lambda o, r: (False, ""))

    result = operations.polish_draft("Apply 2 ml of the specified product per litre of water.")

    assert result.status == LanguagePolishingStatus.REJECTED
    assert result.suggested_text is None
    assert result.guardrail.status.value == "failed"
    assert "2 ml" not in (result.reason or "") or "dosage" not in (result.reason or "").lower()  # reason is generic but present
    assert result.reason


def test_polish_draft_unavailable_when_llm_cannot_generate(monkeypatch):
    def _raise(draft):
        raise LLMUnavailableError("simulated outage")

    monkeypatch.setattr(llm_client, "generate_polish", _raise)

    result = operations.polish_draft("The treatment are effective when farmers apply it correctly.")

    assert result.status == LanguagePolishingStatus.UNAVAILABLE
    assert result.suggested_text is None
    assert result.guardrail is None
    assert result.reason
