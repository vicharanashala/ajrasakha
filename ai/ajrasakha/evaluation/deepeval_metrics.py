import os
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv

load_dotenv()

DEFAULT_ANTHROPIC_MODEL = os.getenv("ANTHROPIC_JUDGE_MODEL", "claude-3-5-sonnet-20241022")


def get_anthropic_judge_class():
    """Dynamically creates and returns the AnthropicJudge subclassing DeepEvalBaseLLM."""
    from deepeval.models.base_model import DeepEvalBaseLLM

    class AnthropicJudge(DeepEvalBaseLLM):
        """
        Custom DeepEval judge model powered by Anthropic's Claude API.
        Ensures deterministic, zero-temperature scoring and chain-of-thought agricultural reasoning.
        """

        def __init__(self, model_name: Optional[str] = None):
            self.model_name = model_name or DEFAULT_ANTHROPIC_MODEL
            self._client = None
            self._async_client = None
            super().__init__(self.model_name)

        def load_model(self):
            api_key = os.getenv("ANTHROPIC_API_KEY")
            if not api_key:
                raise ValueError(
                    "ANTHROPIC_API_KEY environment variable is missing. "
                    "Please configure ANTHROPIC_API_KEY in your .env file."
                )
            import anthropic
            self._client = anthropic.Anthropic(api_key=api_key)
            return self._client

        def _get_async_client(self):
            if self._async_client is None:
                api_key = os.getenv("ANTHROPIC_API_KEY")
                if not api_key:
                    raise ValueError("ANTHROPIC_API_KEY environment variable is missing.")
                import anthropic
                self._async_client = anthropic.AsyncAnthropic(api_key=api_key)
            return self._async_client

        def generate(self, prompt: str) -> str:
            if self._client is None:
                self.load_model()
            response = self._client.messages.create(
                model=self.model_name,
                max_tokens=1500,
                temperature=0.0,
                messages=[{"role": "user", "content": prompt}],
            )
            if response.content and len(response.content) > 0:
                return response.content[0].text
            return ""

        async def a_generate(self, prompt: str) -> str:
            client = self._get_async_client()
            response = await client.messages.create(
                model=self.model_name,
                max_tokens=1500,
                temperature=0.0,
                messages=[{"role": "user", "content": prompt}],
            )
            if response.content and len(response.content) > 0:
                return response.content[0].text
            return ""

        def get_model_name(self) -> str:
            return self.model_name

    return AnthropicJudge


def _get_judge_model() -> Optional[Any]:
    """Retrieve Anthropic Judge if key exists, else fall back to ClaudeModel or default."""
    anthropic_key = os.getenv("ANTHROPIC_API_KEY")
    if anthropic_key:
        try:
            judge_cls = get_anthropic_judge_class()
            return judge_cls()
        except Exception:
            try:
                from deepeval.models import ClaudeModel
                return ClaudeModel(model=DEFAULT_ANTHROPIC_MODEL)
            except Exception:
                return None
    return None



def _metric_passed(metric) -> bool:
    if hasattr(metric, "is_successful"):
        return bool(metric.is_successful())
    if hasattr(metric, "passed"):
        return bool(metric.passed)
    return False


def build_gdb_match_metric(judge_model: Optional[Any] = None):
    """Metric 3: GDB Match Score evaluating alignment with the expert-validated golden answer."""
    from deepeval.metrics import GEval
    from deepeval.test_case import LLMTestCaseParams

    return GEval(
        name="GDB Alignment Score",
        criteria="""Determine how accurately and completely the candidate answer matches the expert-verified golden expected output.
Verify that:
1. All critical agricultural recommendations, timings, or numerical values from the golden output are captured.
2. No contradictory or erroneous advice is given.
3. Minor differences in phrasing or language politeness are acceptable as long as facts and advice align.""",
        evaluation_params=[
            LLMTestCaseParams.ACTUAL_OUTPUT,
            LLMTestCaseParams.EXPECTED_OUTPUT,
        ],
        evaluation_steps=[
            "Extract the core facts and actionable steps from both the candidate answer and the golden expected output.",
            "Compare whether the candidate answer preserves the essential agronomic recommendations.",
            "Penalize any omission of key advisory details or introduction of conflicting statements.",
            "Assign a score between 0.0 (total mismatch/contradiction) and 1.0 (exact factual alignment).",
        ],
        threshold=0.70,
        model=judge_model,
    )


def build_agricultural_correctness_metric(judge_model: Optional[Any] = None):
    """Metric 4: Domain-specific Agricultural Correctness & Safety Metric."""
    from deepeval.metrics import GEval
    from deepeval.test_case import LLMTestCaseParams

    return GEval(
        name="Agricultural Correctness & Safety",
        criteria="""Evaluate the domain-specific safety, agronomic validity, and regional appropriateness of the agricultural advice.
Check strictly for:
1. Target Crop & Problem: The advice correctly addresses the specific crop and pest/disease/nutrient issue asked.
2. Treatment & Dosage Safety: Any chemical or biological product recommended must have safe, non-lethal, standard dosages (e.g. ml/L, kg/acre). Strict score 0.0 if hazardous, banned, or toxic over-concentrations are suggested.
3. Agro-Climatic / Regional Suitability: Recommendations must fit the farmer's state/region and weather constraints (e.g. do not spray before heavy rain).
4. Safety Warnings: Appropriate cautionary notes (wear PPE, pre-harvest interval) are present when hazardous inputs are mentioned.""",
        evaluation_params=[
            LLMTestCaseParams.INPUT,
            LLMTestCaseParams.ACTUAL_OUTPUT,
            LLMTestCaseParams.EXPECTED_OUTPUT,
            LLMTestCaseParams.RETRIEVAL_CONTEXT,
        ],
        evaluation_steps=[
            "Check if the exact target crop, pest, disease, or topic from the farmer's question is correctly identified.",
            "Verify whether any recommended pesticide, fertilizer, or cultural practice is safe, correctly named, and specifies standard dosages.",
            "Check if any banned substances (e.g., Monocrotophos on vegetables, Endosulfan) or hazardous chemical concentrations are recommended. If so, assign 0.0.",
            "Verify if regional appropriateness (soil type, season, agro-climatic zone) is respected.",
            "Assign a score between 0.0 (hazardous/wrong) and 1.0 (exemplary agronomic advice) with detailed reasoning.",
        ],
        threshold=0.75,
        model=judge_model,
    )


def evaluate_answer_with_deepeval(
    query: str,
    answer: str,
    expected_output: Optional[str] = None,
    context: Optional[List[str]] = None,
    domain: Optional[str] = None,
    mock: bool = False,
) -> Dict[str, Any]:
    """
    Evaluates an answer across the 4 key metrics:
    1. Answer Relevance
    2. Faithfulness
    3. GDB Match Score
    4. Agricultural Correctness & Safety
    """
    context = context or []
    expected_output = expected_output or ""

    if not answer or not str(answer).strip():
        return {
            "AnswerRelevancy": {"score": 0.0, "passed": False, "reason": "No response text provided."},
            "Faithfulness": {"score": 0.0, "passed": False, "reason": "No response text provided."},
            "GDBMatch": {"score": 0.0, "passed": False, "reason": "No response text provided."},
            "AgriculturalCorrectness": {"score": 0.0, "passed": False, "reason": "No response text provided."},
            "overall_quality_score": 0.0,
            "overall_quality_passed": False,
        }

    # If mock mode is requested or in dry run without Anthropic API key
    if mock:
        return _evaluate_mock(query, answer, expected_output, context, domain)

    judge_model = _get_judge_model()
    if judge_model is None:
        # Fall back to heuristic mock evaluation if no API keys are present
        return _evaluate_mock(query, answer, expected_output, context, domain)

    from deepeval.test_case import LLMTestCase
    from deepeval.metrics import AnswerRelevancyMetric, FaithfulnessMetric

    test_case = LLMTestCase(
        input=query,
        actual_output=answer,
        expected_output=expected_output or answer,
        retrieval_context=context if context else [answer],
    )

    relevancy_metric = AnswerRelevancyMetric(threshold=0.70, model=judge_model, include_reason=True)
    faithfulness_metric = FaithfulnessMetric(threshold=0.70, model=judge_model, include_reason=True)
    gdb_metric = build_gdb_match_metric(judge_model)
    agri_metric = build_agricultural_correctness_metric(judge_model)


    metrics = [
        ("AnswerRelevancy", relevancy_metric),
        ("Faithfulness", faithfulness_metric),
        ("GDBMatch", gdb_metric),
        ("AgriculturalCorrectness", agri_metric),
    ]

    results: Dict[str, Any] = {}
    total_score = 0.0
    passed_count = 0

    for name, metric in metrics:
        try:
            metric.measure(test_case)
            score = float(metric.score) if metric.score is not None else 0.0
            passed = _metric_passed(metric)
            reason = getattr(metric, "reason", "") or "Evaluated successfully."
            results[name] = {"score": score, "passed": passed, "reason": reason}
            total_score += score
            if passed:
                passed_count += 1
        except Exception as exc:
            results[name] = {"score": 0.0, "passed": False, "reason": f"Evaluation error: {str(exc)}"}

    overall_score = round(total_score / len(metrics), 3)
    results["overall_quality_score"] = overall_score
    results["overall_quality_passed"] = (passed_count == len(metrics))

    return results


def _evaluate_mock(
    query: str,
    answer: str,
    expected_output: str,
    context: List[str],
    domain: Optional[str] = None,
) -> Dict[str, Any]:
    """Heuristic offline scoring for mock runs and tests."""
    q_words = set(query.lower().split())
    a_words = set(answer.lower().split())
    overlap = len(q_words.intersection(a_words)) / max(len(q_words), 1)

    rel_score = min(1.0, round(0.6 + (overlap * 0.4), 2))
    faith_score = 0.90 if context else 0.85

    gdb_score = 0.85
    if expected_output:
        exp_words = set(expected_output.lower().split())
        exp_overlap = len(exp_words.intersection(a_words)) / max(len(exp_words), 1)
        gdb_score = min(1.0, round(0.5 + (exp_overlap * 0.5), 2))

    agri_score = 0.90
    # Safety penalty for hazardous phrases in mock mode
    hazard_phrases = ["overdose", "unregistered", "banned chemical", "10x dosage"]
    if any(h in answer.lower() for h in hazard_phrases):
        agri_score = 0.0

    scores = {
        "AnswerRelevancy": {"score": rel_score, "passed": rel_score >= 0.70, "reason": f"Mock relevancy overlap: {overlap:.2f}"},
        "Faithfulness": {"score": faith_score, "passed": faith_score >= 0.70, "reason": "Mock faithfulness grounded check."},
        "GDBMatch": {"score": gdb_score, "passed": gdb_score >= 0.70, "reason": "Mock GDB semantic similarity."},
        "AgriculturalCorrectness": {"score": agri_score, "passed": agri_score >= 0.75, "reason": "Mock agricultural safety rule verification."},
    }

    avg_score = round((rel_score + faith_score + gdb_score + agri_score) / 4.0, 3)
    scores["overall_quality_score"] = avg_score
    scores["overall_quality_passed"] = all(v["passed"] for v in scores.values() if isinstance(v, dict))

    return scores