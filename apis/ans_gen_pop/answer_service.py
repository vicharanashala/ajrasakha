from __future__ import annotations

import logging

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


def _contexts_to_sources(contexts: list[ContextPOP]) -> list[SourceReference]:
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


def _top_context_by_score(contexts: list[ContextPOP]) -> list[ContextPOP]:
    if not contexts:
        return []
    return [max(contexts, key=lambda c: c.meta_data.similarity_score or 0.0)]


def _pop_validation_hint(response_guidance: str) -> str:
    """Return pop_v2 state/crop validation text when present (no expert footer)."""
    guidance = strip_expert_disclaimer((response_guidance or "").strip())
    if not guidance:
        return ""
    if "We do not currently have POP data" in guidance:
        return guidance
    return ""


def _insufficient_response(pop_response: POPContextResponse | None = None) -> AnsGenPopResponse:
    hint = ""
    if pop_response:
        hint = _pop_validation_hint(pop_response.response_guidance)
    answer = f"{hint}\n\n{INSUFFICIENT_ANSWER}".strip() if hint else INSUFFICIENT_ANSWER
    return AnsGenPopResponse(
        answer=answer,
        contexts=[],
        sources=[],
        similarity_scores=[],
    )


def _build_response(answer: str, contexts: list[ContextPOP]) -> AnsGenPopResponse:
    return AnsGenPopResponse(
        answer=answer,
        contexts=contexts,
        sources=_contexts_to_sources(contexts),
        similarity_scores=_similarity_scores(contexts),
    )


async def generate_pop_answer(query: str, state: str, crop: str) -> AnsGenPopResponse:
    retrieval_query = await rephrase_query_for_retrieval(query, state, crop)
    if retrieval_query != query:
        log.info("Retrieval query rephrased: %r -> %r", query, retrieval_query)
    else:
        log.info("Retrieval query unchanged: %r", query)

    pop_response: POPContextResponse = await fetch_pop_contexts(
        retrieval_query, state, crop
    )

    if not pop_response.contexts:
        log.info("pop_v2 returned no contexts")
        return _insufficient_response(pop_response)

    filtered: list[ContextPOP] | None
    try:
        filtered = await filter_relevant_contexts(query, pop_response.contexts)
    except Exception as exc:
        log.warning("LLM filter failed, using top context by score: %s", exc)
        filtered = _top_context_by_score(pop_response.contexts)

    if not filtered:
        log.info("LLM filter returned no relevant contexts")
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
        log.error("LLM answer generation failed: %s", exc)
        raise

    return _build_response(answer, filtered)
