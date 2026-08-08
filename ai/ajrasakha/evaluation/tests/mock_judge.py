"""
MockJudge - a DeepEvalBaseLLM test double returning canned, schema-shaped
Pydantic responses instantly, with no network call.

Adopted from reviewing PR #995 (same problem statement, open in parallel):
their judge.py used the same "subclass DeepEvalBaseLLM, dispatch on the
requested Pydantic schema's fields" trick to let DeepEval's metrics run their
real measure() codepath in tests without hitting a live judge.

Test-only, deliberately not exposed as a selectable production judge backend
(deepeval_metrics._build_judge_model's GEMINI_API_KEY -> ANTHROPIC_API_KEY ->
OPENAI_API_KEY preference chain is untouched). MockJudge always returns the
same fixed, passing response regardless of input content, so it proves the
metric *plumbing* works end-to-end (schema generation, prompt building,
measure()) - it cannot and must not be used to assert that one input scores
higher/lower than another. Tests that need differentiated scores per input
(e.g. the three agricultural-correctness facets each needing an independent,
different score) still stub at the _build_geval_metric/_build_metric
boundary instead - see test_answer_eval.py's TestAgriculturalFacetsIndependence.
"""

from deepeval.models.base_model import DeepEvalBaseLLM


class MockJudge(DeepEvalBaseLLM):
    def __init__(self, model: str = "mock-judge"):
        self.name = model
        super().__init__(model)

    def load_model(self) -> "MockJudge":
        return self

    def generate(self, *args, **kwargs):
        schema_cls = kwargs.get("schema")
        if schema_cls is None:
            for arg in args:
                if isinstance(arg, type) and hasattr(arg, "model_fields"):
                    schema_cls = arg
                    break

        if schema_cls is None:
            return "MockJudge: no schema requested"

        fields = set(schema_cls.model_fields.keys())

        if fields == {"steps"}:
            return schema_cls(
                steps=[
                    "Compare the actual output against the expected output for the stated criteria.",
                    "Penalize missing, contradictory, or materially different facts.",
                    "Assign a score reflecting overall alignment.",
                ]
            )
        if fields == {"score", "reason"}:
            # GEval's ReasonScore (the only schema with this field pair) is
            # normalized as (score - score_range[0]) / score_range_span, and
            # the default score_range with no rubric is (0, 10) - so 10.0 here
            # is what normalizes to a fully-passing 1.0, not 1.0 itself.
            return schema_cls(
                score=10.0,
                reason="MockJudge: fixed passing score, no network call.",
            )
        if fields == {"reason"}:
            return schema_cls(reason="MockJudge: fixed reason, no network call.")
        if fields == {"statements"}:
            return schema_cls(statements=["Mock statement extracted from the actual output."])
        if fields == {"claims"}:
            return schema_cls(claims=["Mock claim extracted from the actual output."])
        if fields == {"truths"}:
            return schema_cls(truths=["Mock truth extracted from the retrieval context."])
        if fields == {"verdicts"}:
            # Shared shape across AnswerRelevancy/Faithfulness (verdict+reason) and
            # ContextualRelevancy (statement+verdict+reason) Verdicts schemas; extra
            # fields are ignored by pydantic's default model config, so one generic
            # item satisfies all three without needing to key off the class name
            # (which collides: both AnswerRelevancy and Faithfulness name it "Verdicts").
            return schema_cls(
                verdicts=[
                    {
                        "statement": "mock statement",
                        "verdict": "yes",
                        "reason": "MockJudge: relevant/faithful by default.",
                    }
                ]
            )

        raise ValueError(
            f"MockJudge: no canned response for schema fields {fields} ({schema_cls.__name__})"
        )

    async def a_generate(self, *args, **kwargs):
        return self.generate(*args, **kwargs)

    def get_model_name(self) -> str:
        return self.name
