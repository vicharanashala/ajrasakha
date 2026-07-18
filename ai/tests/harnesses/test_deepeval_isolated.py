"""
Isolated DeepEval harness — PR1 Step 1.
========================================
Validates that the three DeepEval metrics (AnswerRelevancy, Faithfulness,
ContextualRelevancy) can execute end-to-end, WITHOUT touching any MCP server,
MongoDB, or the remote AI API.

Judge is selected by EVAL_JUDGE env var:
  mock      — MockJudge, fixed passing score 1.0, instant, no network (default)
  ollama    — qwen2.5:3b via OllamaModel, real scores, slow
  anthropic — AnthropicModel + CLAUDE_MODEL, real scores, needs ANTHROPIC_API_KEY

Prerequisites:
  pip install deepeval ollama
  (For ollama) ollama pull qwen2.5:3b
"""

import json
import os
import sys
from pathlib import Path

# Confirm this file is run from either the repo root or the ai/ subdirectory
_FILE_ROOT = Path(__file__).resolve().parents[2]   # = ai/ directory
_EXPECTED_CWDS = {_FILE_ROOT, _FILE_ROOT.parent}   # = {repo root, ai/}
if Path.cwd().resolve() not in _EXPECTED_CWDS:
    print(f"ERROR: This harness must be run from the repo root or the ai/ directory.")
    print(f"  Expected one of: {_EXPECTED_CWDS}")
    print(f"  Got:              {Path.cwd().resolve()}")
    sys.exit(1)

# ------------------------------------------------------------------
# Judge mode selector — controlled by EVAL_JUDGE env var
# ------------------------------------------------------------------
EVAL_JUDGE = os.getenv("EVAL_JUDGE", "mock").lower()

VALID_JUDGES = {"mock", "ollama", "anthropic"}
if EVAL_JUDGE not in VALID_JUDGES:
    print(f"ERROR: EVAL_JUDGE must be one of {VALID_JUDGES}, got '{EVAL_JUDGE}'")
    sys.exit(1)

print("=" * 60)
print("DEEPEVAL ISOLATED HARNESS — PR1 Step 1")
print("=" * 60)
print()
print(f"  EVAL_JUDGE        : {EVAL_JUDGE}")

if EVAL_JUDGE == "mock":
    print(f"  Judge             : MockJudge (fixed passing score 1.0, instant, no network)")
    print(f"  Judge class       : MockJudge (subclasses DeepEvalBaseLLM)")
elif EVAL_JUDGE == "ollama":
    print(f"  Judge             : qwen2.5:3b (local Ollama, zero cost)")
    print(f"  Judge class       : OllamaModel (deepeval.models.OllamaModel)")
elif EVAL_JUDGE == "anthropic":
    from ajrasakha.agents.config import CLAUDE_MODEL
    print(f"  Judge model       : {CLAUDE_MODEL}  (from config.CLAUDE_MODEL)")
    print(f"  Judge class       : AnthropicModel (deepeval.models.AnthropicModel)")
    print(f"  ANTHROPIC_API_KEY : {'[SET]' if os.getenv('ANTHROPIC_API_KEY') else '[NOT SET — will fail]'}")
print()

# ------------------------------------------------------------------
# DeepEval imports — these are the ONLY external dependencies
# ------------------------------------------------------------------
from deepeval.metrics import (
    AnswerRelevancyMetric,
    FaithfulnessMetric,
    ContextualRelevancyMetric,
)
from deepeval.test_case import LLMTestCase

# ------------------------------------------------------------------
# MOCK JUDGE (EVAL_JUDGE=mock) — instant, fixed score, no network
# Subclasses DeepEvalBaseLLM so it satisfies the metric interface.
# Required methods confirmed from installed deepeval v4.0.7:
#   load_model(), generate(), a_generate(), get_model_name()
#
# Each metric calls generate() / a_generate() MULTIPLE times with
# different Pydantic schema classes:
#   AnswerRelevancyMetric  : Statements → Verdicts → ScoreReason
#   FaithfulnessMetric     : Claims → Truths → Verdicts → ScoreReason
#   ContextualRelevancy    : Verdicts → ScoreReason
# We inspect schema_cls.__name__ and return a matching Pydantic instance
# so parse succeeds without any network call.
# ------------------------------------------------------------------
if EVAL_JUDGE == "mock":
    from deepeval.models.base_model import DeepEvalBaseLLM

    # Per-schema return values — must match each schema's field names exactly
    _MOCK_SCHEMA_RESPONSES = {
        # AnswerRelevancyMetric
        "Statements": {"statements": ["Tomato blight is a fungal disease common in Karnataka's humid climate."]},
        "Verdicts": {"verdicts": [{"verdict": "yes", "reason": "The response correctly addresses the question."}]},
        "AnswerRelevancyScoreReason": {"reason": "MockJudge: synthetic fixture data, nominally relevant."},
        # FaithfulnessMetric
        "Claims": {"claims": ["Tomato blight is caused by Phytophthora infestans."]},
        "Truths": {"truths": ["Tomato blight is caused by Phytophthora infestans."]},
        "FaithfulnessScoreReason": {"reason": "MockJudge: claims are faithful to the retrieval context."},
        # ContextualRelevancyMetric
        "ContextualRelevancyVerdicts": {"verdicts": [{"statement": "NPK ratio for rice in Karnataka", "verdict": "yes", "reason": "Relevant to query."}]},
        "ContextualRelevancyScoreReason": {"reason": "MockJudge: contextually relevant to the input query."},
    }

    class MockJudge(DeepEvalBaseLLM):
        def __init__(self, model: str = "mock-judge"):
            self.name = model
            self._schema_cache: dict = {}
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
                # Return a Pydantic instance so generate_with_schema()
                # skips the JSON-parse path entirely (avoids trimAndLoadJson errors)
                try:
                    return schema_cls(**mock_data)
                except Exception:
                    pass  # fall through to JSON string
            return '{"reason": "MockJudge: unknown schema ' + schema_name + '"}'

        async def a_generate(self, *args, **kwargs) -> str:
            return self.generate(*args, **kwargs)

        def get_model_name(self) -> str:
            return self.name

    judge = MockJudge(model="mock-judge")

# ------------------------------------------------------------------
# OLLAMA JUDGE (EVAL_JUDGE=ollama) — qwen2.5:3b, real scores, slow
# ------------------------------------------------------------------
elif EVAL_JUDGE == "ollama":
    from deepeval.models import OllamaModel

    judge = OllamaModel(
        model="qwen2.5:3b",
        base_url="http://localhost:11434",
        temperature=0.0,
    )

# ------------------------------------------------------------------
# ANTHROPIC JUDGE (EVAL_JUDGE=anthropic) — production path
# Requires ANTHROPIC_API_KEY in environment
# ------------------------------------------------------------------
elif EVAL_JUDGE == "anthropic":
    ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "")
    if not ANTHROPIC_KEY:
        print("ERROR: EVAL_JUDGE=anthropic requires ANTHROPIC_API_KEY to be set.")
        sys.exit(1)
    from ajrasakha.agents.config import CLAUDE_MODEL
    from deepeval.models import AnthropicModel

    judge = AnthropicModel(model=CLAUDE_MODEL)

print(f"  Judge initialised.")
print()

# ------------------------------------------------------------------
# Build metric instances (threshold=0.5, async_mode=False for Windows)
# ------------------------------------------------------------------
metrics = [
    ("AnswerRelevancyMetric",    AnswerRelevancyMetric(threshold=0.5, model=judge, async_mode=False)),
    ("FaithfulnessMetric",        FaithfulnessMetric(threshold=0.5, model=judge, async_mode=False)),
    ("ContextualRelevancyMetric", ContextualRelevancyMetric(threshold=0.5, model=judge, async_mode=False)),
]

print(f"Metrics configured: {[name for name, _ in metrics]}")
print(f"Threshold: 0.5")
print()

# ------------------------------------------------------------------
# Load fixtures
# ------------------------------------------------------------------
FIXTURE_PATH = Path(__file__).parent.parent / "fixtures" / "sample_eval_cases.json"
if not FIXTURE_PATH.exists():
    print(f"ERROR: Fixture file not found: {FIXTURE_PATH}")
    sys.exit(1)

fixtures = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
print(f"Loaded {len(fixtures)} fixture case(s)")
for f in fixtures:
    print(f"  [{f['case_id']}] domain={f['domain']} synthetic={f.get('synthetic', False)}")
print()

# ------------------------------------------------------------------
# Per-case, per-metric evaluation loop
# ------------------------------------------------------------------
HEADER = f"{'case_id':<30} {'metric':<30} {'score':>6}  {'pass':>5}  reason"
SEPARATOR = "-" * 110

print(SEPARATOR)
print(HEADER)
print(SEPARATOR)

total_pass = 0
total_fail = 0

case_filter = os.getenv("CASE_FILTER", "")

for case in fixtures:
    case_id = case["case_id"]
    if case_filter and case_id != case_filter:
        continue
    test_case = LLMTestCase(
        input=case["input"],
        actual_output=case["actual_output"],
        expected_output=case.get("expected_output"),
        retrieval_context=case.get("retrieval_context", []),
    )

    for metric_name, metric in metrics:
        try:
            score = metric.measure(test_case, _show_indicator=False)
            # CORRECT attribute names confirmed from installed deepeval v4.0.7:
            #   metric.score   -> float  (NOT metric.passed)
            #   metric.success -> bool   (NOT metric.passed — existing code has a bug here)
            #   metric.reason  -> str
            passed = metric.success
            reason = (metric.reason or "")[:80]
        except Exception as exc:
            score = "ERR"
            passed = False
            reason = f"Exception: {exc}"

        status = "PASS" if passed else "FAIL"
        print(f"{case_id:<30} {metric_name:<30} {str(score):>6}  {status:>5}  {reason}")

        if passed:
            total_pass += 1
        else:
            total_fail += 1

print(SEPARATOR)
total = total_pass + total_fail
print(f"\nResults: {total_pass} passed, {total_fail} failed out of {total} metric evaluations.")

if EVAL_JUDGE == "mock":
    print("\n(MOCK mode — all scores are fixed at 1.0, plumbing only)")
    print("Switch to EVAL_JUDGE=ollama for real scored metrics.")
elif EVAL_JUDGE == "ollama":
    print("\n(OLLAMA mode — real scores from qwen2.5:3b, slow but free)")
elif EVAL_JUDGE == "anthropic":
    print("\n(ANTHROPIC mode — real scores from Claude, requires API key)")