"""Unit tests for the configurable DeepEval judge. No network, no real keys."""

import pytest

from ajrasakha.evaluation import deepeval_metrics as dm

JUDGE_VARS = [
    "JUDGE_PROVIDER",
    "JUDGE_MODEL",
    "JUDGE_BASE_URL",
    "JUDGE_API_KEY",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
]


class FakeModel:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


class FakeAnthropic(FakeModel):
    pass

class BrokenAnthropic:
    def __init__(self, **kwargs):
        raise RuntimeError("Anthropic Package is unavailable")


class FakeOpenAI(FakeModel):
    pass


class FakeMetric:
    def __init__(self, threshold=0.5, model=None, **kwargs):
        self.threshold = threshold
        self.model = model
        self.score = None
        self.reason = None
        self.success = None

    def measure(self, test_case):
        self.score = 0.9
        self.reason = "fake reason"
        self.success = True

    def is_successful(self):
        return self.success


# evaluate_answer_with_deepeval keys results by class name, so these
# fakes must carry the real metric names.
class AnswerRelevancyMetric(FakeMetric):
    pass


class FaithfulnessMetric(FakeMetric):
    pass


class ContextualRelevancyMetric(FakeMetric):
    pass


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    for name in JUDGE_VARS:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(dm, "AnthropicModel", FakeAnthropic)
    monkeypatch.setattr(dm, "OpenAIModel", FakeOpenAI)
    dm.get_judge_model.cache_clear()


# --- config ---------------------------------------------------------------


def test_config_defaults(monkeypatch):
    monkeypatch.setenv("JUDGE_API_KEY", "test-key")
    cfg = dm.load_judge_config()
    assert cfg.provider == "anthropic"
    assert cfg.model == dm.DEFAULT_JUDGE_MODEL
    assert cfg.base_url is None
    assert cfg.api_key == "test-key"


def test_config_overrides(monkeypatch):
    monkeypatch.setenv("JUDGE_PROVIDER", "openai")
    monkeypatch.setenv("JUDGE_MODEL", "some-model")
    monkeypatch.setenv("JUDGE_BASE_URL", "https://example.invalid/v1")
    monkeypatch.setenv("JUDGE_API_KEY", "test-key")
    cfg = dm.load_judge_config()
    assert cfg.provider == "openai"
    assert cfg.model == "some-model"
    assert cfg.base_url == "https://example.invalid/v1"


def test_config_falls_back_to_provider_key(monkeypatch):
    monkeypatch.setenv("JUDGE_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "openai-test-key")
    assert dm.load_judge_config().api_key == "openai-test-key"


def test_missing_key_raises_clear_error():
    with pytest.raises(dm.JudgeSetupError, match="API_KEY"):
        dm.load_judge_config()


def test_unknown_provider_raises(monkeypatch):
    monkeypatch.setenv("JUDGE_PROVIDER", "nope")
    monkeypatch.setenv("JUDGE_API_KEY", "test-key")
    with pytest.raises(dm.JudgeSetupError, match="JUDGE_PROVIDER"):
        dm.load_judge_config()


def test_key_is_not_in_config_repr(monkeypatch):
    monkeypatch.setenv("JUDGE_API_KEY", "super-secret-value")
    assert "super-secret-value" not in repr(dm.load_judge_config())

def test_model_construction_error_becomes_judge_setup_error(monkeypatch):
    monkeypatch.setenv("JUDGE_PROVIDER", "anthropic")
    monkeypatch.setenv("JUDGE_API_KEY", "test-key")
    monkeypatch.setattr(dm, "AnthropicModel", BrokenAnthropic)

    with pytest.raises(dm.JudgeSetupError) as exc_info:
        dm.get_judge_model()

    assert "couldn't set up the judge" in str(exc_info.value)
    assert isinstance(exc_info.value.__cause__, RuntimeError)
    assert "Anthropic Package is unavailable" in str(exc_info.value.__cause__)


# --- get_judge_model ------------------------------------------------------


def test_openai_provider_passes_base_url(monkeypatch):
    monkeypatch.setenv("JUDGE_PROVIDER", "openai")
    monkeypatch.setenv("JUDGE_MODEL", "some-model")
    monkeypatch.setenv("JUDGE_BASE_URL", "https://example.invalid/v1")
    monkeypatch.setenv("JUDGE_API_KEY", "test-key")
    model = dm.get_judge_model()
    assert isinstance(model, FakeOpenAI)
    assert model.kwargs["model"] == "some-model"
    assert model.kwargs["base_url"] == "https://example.invalid/v1"
    assert model.kwargs["api_key"] == "test-key"


def test_base_url_omitted_when_unset(monkeypatch):
    monkeypatch.setenv("JUDGE_PROVIDER", "openai")
    monkeypatch.setenv("JUDGE_API_KEY", "test-key")
    assert "base_url" not in dm.get_judge_model().kwargs


def test_anthropic_provider_uses_anthropic_class(monkeypatch):
    monkeypatch.setenv("JUDGE_PROVIDER", "anthropic")
    monkeypatch.setenv("JUDGE_API_KEY", "test-key")
    assert isinstance(dm.get_judge_model(), FakeAnthropic)


def test_judge_model_is_cached(monkeypatch):
    monkeypatch.setenv("JUDGE_API_KEY", "test-key")
    assert dm.get_judge_model() is dm.get_judge_model()


# --- metrics --------------------------------------------------------------


def test_build_metric_uses_given_model():
    model = FakeModel()
    metric = dm._build_metric(FakeMetric, model, threshold=0.7)
    assert metric.model is model
    assert metric.threshold == 0.7


def test_empty_answer_never_builds_a_judge(monkeypatch):
    def boom():
        raise AssertionError("judge must not be built for an empty answer")

    monkeypatch.setattr(dm, "get_judge_model", boom)
    result = dm.evaluate_answer_with_deepeval("question", "   ")
    assert result["AnswerRelevancyMetric"]["reason"] == "answer_missing"
    assert result["FaithfulnessMetric"]["reason"] == "answer_missing"
    assert result["ContextualRelevancyMetric"]["reason"] == "answer_missing"


def test_evaluate_builds_judge_once_and_returns_shape(monkeypatch):
    calls = []

    def fake_get_judge_model():
        calls.append(1)
        return FakeModel()

    monkeypatch.setattr(dm, "get_judge_model", fake_get_judge_model)
    monkeypatch.setattr(dm, "AnswerRelevancyMetric", AnswerRelevancyMetric)
    monkeypatch.setattr(dm, "FaithfulnessMetric", FaithfulnessMetric)
    monkeypatch.setattr(dm, "ContextualRelevancyMetric", ContextualRelevancyMetric)

    result = dm.evaluate_answer_with_deepeval(
        "What is the price of paddy?", "About Rs 2300.", ["[daily_price] Rs 2300"]
    )

    assert len(calls) == 1
    assert set(result) == {
        "AnswerRelevancyMetric",
        "FaithfulnessMetric",
        "ContextualRelevancyMetric",
    }
    for entry in result.values():
        assert entry == {"score": 0.9, "passed": True, "reason": "fake reason"}


def test_setup_error_propagates_instead_of_being_swallowed(monkeypatch):
    def broken():
        raise dm.JudgeSetupError("no key")

    monkeypatch.setattr(dm, "get_judge_model", broken)
    with pytest.raises(dm.JudgeSetupError):
        dm.evaluate_answer_with_deepeval("q", "an answer", ["context"])