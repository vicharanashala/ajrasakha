"""
Judge factory — shared source of truth for DeepEval judge selection.

Resolved from EVAL_JUDGE env var (default: "mock"):
  mock      — MockJudge, instant, no network
  ollama    — qwen2.5:3b via OllamaModel, real scores, slow
  anthropic — AnthropicModel + CLAUDE_MODEL, real scores, needs ANTHROPIC_API_KEY
"""

import os
from deepeval.models.base_model import DeepEvalBaseLLM


# ------------------------------------------------------------------
# MockJudge — instant, fixed-score, no network
# Subclasses DeepEvalBaseLLM so it satisfies the metric interface.
# Required methods (confirmed from installed deepeval v4.0.7):
#   load_model(), generate(), a_generate(), get_model_name()
#
# Each metric calls generate_with_schema() MULTIPLE times with different
# Pydantic schema classes. We inspect schema_cls.__name__ and return a
# matching Pydantic instance so parse succeeds without any network.
# ------------------------------------------------------------------

_MOCK_SCHEMA_RESPONSES = {
    # AnswerRelevancyMetric: Statements → Verdicts → ScoreReason
    "Statements": {
        "statements": [
            "This is a synthetic answer generated for testing purposes only."
        ]
    },
    "Verdicts": {
        "verdicts": [
            {"verdict": "yes", "reason": "The response addresses the query."}
        ]
    },
    "AnswerRelevancyScoreReason": {
        "reason": "MockJudge: synthetic fixture data, nominally relevant."
    },
    # FaithfulnessMetric: Claims → Truths → Verdicts → ScoreReason
    "Claims": {
        "claims": [
            "Tomato blight is caused by Phytophthora infestans."
        ]
    },
    "Truths": {
        "truths": [
            "Tomato blight is caused by Phytophthora infestans."
        ]
    },
    "FaithfulnessScoreReason": {
        "reason": "MockJudge: claims are faithful to the retrieval context."
    },
    # ContextualRelevancyMetric: Verdicts → ScoreReason
    "ContextualRelevancyVerdicts": {
        "verdicts": [
            {
                "statement": "NPK ratio for rice in Karnataka",
                "verdict": "yes",
                "reason": "Relevant to the query.",
            }
        ]
    },
    "ContextualRelevancyScoreReason": {
        "reason": "MockJudge: contextually relevant to the input query."
    },
}


class MockJudge(DeepEvalBaseLLM):
    """
    Fake judge that returns correctly-shaped Pydantic instances for every
    schema class DeepEval's three metrics use, instantly and without network.

    All scores end up at 1.0 (threshold 0.5), confirming the plumbing works.
    Use EVAL_JUDGE=ollama for real scored metrics.
    """

    def __init__(self, model: str = "mock-judge"):
        self.name = model
        super().__init__(model)

    def load_model(self) -> "MockJudge":
        return self

    def generate(self, *args, **kwargs) -> str:
        schema_cls = kwargs.get("schema")
        if schema_cls is None and len(args) >= 2:
            schema_cls = args[1]
        if schema_cls is None:
            return '{"reason": "MockJudge: no schema provided"}'

        schema_name = (
            schema_cls.__name__
            if hasattr(schema_cls, "__name__")
            else str(schema_cls)
        )

        mock_data = _MOCK_SCHEMA_RESPONSES.get(schema_name)
        if mock_data is not None:
            try:
                return schema_cls(**mock_data)  # Pydantic instance — skips JSON parse
            except Exception:
                pass
        return '{"reason": "MockJudge: unknown schema ' + schema_name + '"}'

    async def a_generate(self, *args, **kwargs) -> str:
        return self.generate(*args, **kwargs)

    def get_model_name(self) -> str:
        return self.name


# ------------------------------------------------------------------
# Public factory
# ------------------------------------------------------------------

_JUDGE_CACHE: DeepEvalBaseLLM | None = None


def get_judge() -> DeepEvalBaseLLM:
    """
    Return a cached DeepEvalBaseLLM judge resolved from EVAL_JUDGE.

    Defaults to MockJudge (safe for fast iteration / CI).
    Set EVAL_JUDGE=ollama for local real-score evaluation.
    Set EVAL_JUDGE=anthropic for production evaluation (requires ANTHROPIC_API_KEY).
    """
    global _JUDGE_CACHE
    if _JUDGE_CACHE is not None:
        return _JUDGE_CACHE

    mode = os.getenv("EVAL_JUDGE", "mock").lower()

    if mode == "mock":
        _JUDGE_CACHE = MockJudge(model="mock-judge")

    elif mode == "ollama":
        from deepeval.models import OllamaModel

        _JUDGE_CACHE = OllamaModel(
            model="qwen2.5:3b",
            base_url="http://localhost:11434",
            temperature=0.0,
        )

    elif mode == "anthropic":
        from ajrasakha.agents.config import CLAUDE_MODEL
        from deepeval.models import AnthropicModel

        _JUDGE_CACHE = AnthropicModel(model=CLAUDE_MODEL)

    else:
        valid = {"mock", "ollama", "anthropic"}
        raise ValueError(
            f"EVAL_JUDGE must be one of {valid}, got '{mode}'"
        )

    return _JUDGE_CACHE