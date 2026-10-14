from __future__ import annotations

import logging
from typing import Any

from llm_client import (
    filter_relevant_contexts,
    generate_answer,
    rephrase_query_for_retrieval,
    strip_expert_disclaimer,
)
from models import (
    AnsGenPopResponse,
    ContextPOP,
    POPContextResponse,
    SourceReference,
)
from pop_client import fetch_pop_contexts

log = logging.getLogger("ans_gen_pop.service")

INSUFFICIENT_ANSWER = (
    "We do not have sufficient Package of Practices information to answer "
    "this query for the given state and crop."
)


def _contexts_to_sources(
    contexts: list[ContextPOP],
) -> list[SourceReference]:
    sources: list[SourceReference] = []

    for ctx in contexts:
        meta = ctx.meta_data

        sources.append(
            SourceReference(
                doc_id=meta.doc_id,
                chunk_id=meta.chunk_id,
                source_name=meta.source_name,
                source_url=meta.source or "",
                page_no=meta.page_no,
                doc_origin=meta.doc_origin,
                verified_by=meta.verified_by,
            )
        )

    return sources


def _similarity_scores(contexts: list[ContextPOP]) -> list[float]:
    scores: list[float] = []

    for ctx in contexts:
        score = ctx.meta_data.similarity_score
        scores.append(float(score) if score is not None else 0.0)

    return scores


def _top_context_by_score(
    contexts: list[ContextPOP],
) -> list[ContextPOP]:
    if not contexts:
        return []

    return [
        max(
            contexts,
            key=lambda c: c.meta_data.similarity_score or 0.0,
        )
    ]


def _pop_validation_hint(response_guidance: str) -> str:
    """Return pop_v2 state/crop validation text when present."""
    guidance = strip_expert_disclaimer(
        (response_guidance or "").strip()
    )

    if not guidance:
        return ""

    if "We do not currently have POP data" in guidance:
        return guidance

    return ""


def _insufficient_response(
    pop_response: POPContextResponse | None = None,
) -> AnsGenPopResponse:
    hint = ""

    if pop_response:
        hint = _pop_validation_hint(
            pop_response.response_guidance
        )

    answer = (
        f"{hint}\n\n{INSUFFICIENT_ANSWER}".strip()
        if hint
        else INSUFFICIENT_ANSWER
    )

    return AnsGenPopResponse(
        answer=answer,
        contexts=[],
        sources=[],
        similarity_scores=[],
    )


def _build_response(
    answer: str,
    contexts: list[ContextPOP],
) -> AnsGenPopResponse:
    return AnsGenPopResponse(
        answer=answer,
        contexts=contexts,
        sources=_contexts_to_sources(contexts),
        similarity_scores=_similarity_scores(contexts),
    )


# ---------------------------------------------------------------------------
# Answer Evaluation
# ---------------------------------------------------------------------------


async def _evaluate_answer(
    query: str,
    answer: str,
    contexts: list[ContextPOP],
    state: str,
    crop: str,
    reference_answer: str | None = None,
) -> dict[str, Any]:
    """
    Evaluate the generated answer using DeepEval.

    Evaluation failures are intentionally isolated from the main
    answer-generation pipeline. A failed evaluation must never prevent
    the user from receiving a generated answer.
    """

    try:
        from deepeval.metrics import (
            AnswerRelevancyMetric,
            FaithfulnessMetric,
            GEval,
        )
        from deepeval.test_case import LLMTestCase, LLMTestCaseParams

    except ImportError:
        log.warning(
            "DeepEval is not installed. "
            "Skipping answer quality evaluation."
        )
        return {}

    context_texts: list[str] = []

    for context in contexts:
        # ContextPOP's exact textual field may vary depending on the model.
        # Try the common fields without making the evaluator affect the
        # answer-generation path.
        context_text = ""

        for field in ("text", "content", "page_content", "chunk"):
            value = getattr(context, field, None)

            if value:
                context_text = str(value)
                break

        if not context_text:
            context_text = str(context)

        context_texts.append(context_text)

    test_case = LLMTestCase(
        input=query,
        actual_output=answer,
        retrieval_context=context_texts,
        expected_output=reference_answer,
    )

    evaluation: dict[str, Any] = {
        "state": state,
        "crop": crop,
        "query": query,
        "answer_relevance": None,
        "faithfulness": None,
        "agricultural_accuracy": None,
        "gdb_match": None,
        "overall_score": None,
    }

    try:
        # ---------------------------------------------------------------
        # 1. Answer Relevance
        # ---------------------------------------------------------------

        relevance_metric = AnswerRelevancyMetric(
            threshold=0.5,
            include_reason=True,
        )

        await relevance_metric.a_measure(test_case)

        evaluation["answer_relevance"] = relevance_metric.score

        log.info(
            "Answer relevance score: %.3f",
            relevance_metric.score,
        )

    except Exception as exc:
        log.warning(
            "Answer relevance evaluation failed: %s",
            exc,
        )

    try:
        # ---------------------------------------------------------------
        # 2. Faithfulness
        # ---------------------------------------------------------------

        faithfulness_metric = FaithfulnessMetric(
            threshold=0.5,
            include_reason=True,
        )

        await faithfulness_metric.a_measure(test_case)

        evaluation["faithfulness"] = faithfulness_metric.score

        log.info(
            "Faithfulness score: %.3f",
            faithfulness_metric.score,
        )

    except Exception as exc:
        log.warning(
            "Faithfulness evaluation failed: %s",
            exc,
        )

    try:
        # ---------------------------------------------------------------
        # 3. Agricultural Accuracy
        # ---------------------------------------------------------------

        agricultural_metric = GEval(
            name="Agricultural Accuracy",
            criteria=(
                "Evaluate whether the answer correctly addresses the "
                "agricultural question for the specified crop and state. "
                "The answer should provide an appropriate agricultural "
                "recommendation or explanation, should not introduce "
                "unsupported agricultural claims, and should correctly "
                "respect the crop and regional context."
            ),
            evaluation_params=[
                LLMTestCaseParams.INPUT,
                LLMTestCaseParams.ACTUAL_OUTPUT,
                LLMTestCaseParams.RETRIEVAL_CONTEXT,
            ],
            threshold=0.5,
        )

        await agricultural_metric.a_measure(test_case)

        evaluation["agricultural_accuracy"] = (
            agricultural_metric.score
        )

        log.info(
            "Agricultural accuracy score: %.3f",
            agricultural_metric.score,
        )

    except Exception as exc:
        log.warning(
            "Agricultural accuracy evaluation failed: %s",
            exc,
        )

    try:
        # ---------------------------------------------------------------
        # 4. GDB Match Score
        # ---------------------------------------------------------------
        #
        # This metric is only meaningful when an expert-validated
        # reference answer is available from the GDB/golden dataset.
        #
        # We intentionally do NOT use retrieval similarity here.
        # Retrieval similarity tells us how similar the retrieved
        # context is, not whether the generated answer matches the
        # expert answer.
        # ---------------------------------------------------------------

        if reference_answer:
            gdb_metric = GEval(
                name="GDB Match",
                criteria=(
                    "Compare the generated answer against the "
                    "expert-validated reference answer. Evaluate how "
                    "closely the generated answer matches the factual "
                    "meaning, recommendation, treatment, crop-specific "
                    "information, and important details of the reference "
                    "answer. Do not require identical wording."
                ),
                evaluation_params=[
                    LLMTestCaseParams.EXPECTED_OUTPUT,
                    LLMTestCaseParams.ACTUAL_OUTPUT,
                ],
                threshold=0.5,
            )

            await gdb_metric.a_measure(test_case)

            evaluation["gdb_match"] = gdb_metric.score

            log.info(
                "GDB match score: %.3f",
                gdb_metric.score,
            )

        else:
            log.info(
                "No reference answer supplied; "
                "skipping GDB match evaluation."
            )

    except Exception as exc:
        log.warning(
            "GDB match evaluation failed: %s",
            exc,
        )

    # ---------------------------------------------------------------
    # 5. Overall Score
    # ---------------------------------------------------------------

    scores = [
        evaluation["answer_relevance"],
        evaluation["faithfulness"],
        evaluation["agricultural_accuracy"],
        evaluation["gdb_match"],
    ]

    valid_scores = [
        float(score)
        for score in scores
        if score is not None
    ]

    if valid_scores:
        evaluation["overall_score"] = (
            sum(valid_scores) / len(valid_scores)
        )

    log.info(
        "Answer quality evaluation completed: %s",
        evaluation,
    )

    return evaluation


# ---------------------------------------------------------------------------
# Main POP Answer Generation
# ---------------------------------------------------------------------------


async def generate_pop_answer(
    query: str,
    state: str,
    crop: str,
    reference_answer: str | None = None,
) -> AnsGenPopResponse:
    """
    Generate a POP answer and evaluate its quality.

    reference_answer is optional. When supplied, it should contain the
    expert-validated GDB answer corresponding to the query.
    """

    retrieval_query = await rephrase_query_for_retrieval(
        query,
        state,
        crop,
    )

    if retrieval_query != query:
        log.info(
            "Retrieval query rephrased: %r -> %r",
            query,
            retrieval_query,
        )
    else:
        log.info(
            "Retrieval query unchanged: %r",
            query,
        )

    pop_response: POPContextResponse = await fetch_pop_contexts(
        retrieval_query,
        state,
        crop,
    )

    if not pop_response.contexts:
        log.info("pop_v2 returned no contexts")
        return _insufficient_response(pop_response)

    filtered: list[ContextPOP] | None

    try:
        filtered = await filter_relevant_contexts(
            query,
            pop_response.contexts,
        )

    except Exception as exc:
        log.warning(
            "LLM filter failed, using top context by score: %s",
            exc,
        )

        filtered = _top_context_by_score(
            pop_response.contexts
        )

    if not filtered:
        log.info(
            "LLM filter returned no relevant contexts"
        )
        return _insufficient_response()

    try:
        answer = await generate_answer(
            query=query,
            state=state,
            crop=crop,
            contexts=filtered,
            compliance_notice=pop_response.compliance_notice,
        )

    except Exception as exc:
        log.error(
            "LLM answer generation failed: %s",
            exc,
        )
        raise

    # -------------------------------------------------------------------
    # Evaluate generated answer.
    #
    # IMPORTANT:
    # Evaluation is isolated from answer generation. If DeepEval fails,
    # the generated answer is still returned normally.
    # -------------------------------------------------------------------

    try:
        await _evaluate_answer(
            query=query,
            answer=answer,
            contexts=filtered,
            state=state,
            crop=crop,
            reference_answer=reference_answer,
        )

    except Exception as exc:
        log.warning(
            "Answer evaluation pipeline failed: %s",
            exc,
        )

    return _build_response(
        answer,
        filtered,
    )