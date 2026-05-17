from __future__ import annotations

import asyncio
import time

from dotenv import load_dotenv
from fastmcp import FastMCP

from chemical_guard import (
    analyze_text_for_chemical_compliance,
    filter_pop_contexts_for_chemical_compliance,
)
from constants import MCP_HOST, MCP_PORT
from logging_config import get_logger, setup_logging
from embedding_client import get_query_embedding
from metadata_cache import (
    get_crops_for_state,
    get_metadata_export,
    get_states,
    load_metadata_cache,
    start_metadata_refresh_loop,
    validate_crop,
    validate_state,
)
from models import (
    ContextPOP,
    POPComplianceNotice,
    POPContextResponse,
    POPMetaData,
)
from retrieval import POPChunkResult, retrieve_pop_contexts

load_dotenv()
setup_logging()
logger = get_logger("mcp")

mcp = FastMCP("ajrasakha-pop-mcp")

RESPONSE_GUIDANCE = (
    "* If retrieved context is relevant and sufficient:\n"
    "* Generate answer using available data.\n"
    "* Append:\n"
    '"# Your query has also been shared with an expert for review. '
    'It will be processed within 2 hours. Please ask the same query after 2 hours."\n'
    "* If insufficient:\n"
    '"# We do not have sufficient information to answer your query at the moment. '
    'Your query has been transferred to an expert and will be processed within 2 hours."'
)


def _chunk_to_context_pop(chunk: POPChunkResult) -> ContextPOP:
    return ContextPOP(
        text=chunk.chunk_content,
        meta_data=POPMetaData(
            similarity_score=chunk.similarity_score,
            page_no=chunk.page_no,
            source=chunk.doc_link or "https://linknotavailable.com",
            source_name=chunk.doc_name,
            doc_id=chunk.doc_id,
            chunk_id=chunk.chunk_id,
            doc_origin=chunk.doc_origin,
            verified_by=chunk.verified_by,
        ),
    )


def _build_compliance_notice(
    query: str,
    processed_nodes: list[ContextPOP],
) -> tuple[POPComplianceNotice | None, list[ContextPOP]]:
    compliant_nodes, ctx_restricted, ctx_blocked = filter_pop_contexts_for_chemical_compliance(
        processed_nodes
    )
    query_restricted, query_blocked = analyze_text_for_chemical_compliance(query)

    restricted_by_id: dict = {}
    for flag in ctx_restricted + query_restricted:
        restricted_by_id.setdefault(flag.chemical_id, flag)
    restricted_flags = sorted(
        restricted_by_id.values(), key=lambda f: f.chemical_name.lower()
    )
    blocked_chemical_names = sorted(
        set(ctx_blocked) | set(query_blocked), key=str.lower
    )

    from_context_restricted = bool(ctx_restricted)
    from_query_restricted = bool(query_restricted)
    from_context_blocked = bool(ctx_blocked)
    from_query_blocked = bool(query_blocked)

    if not restricted_flags and not blocked_chemical_names:
        return None, compliant_nodes

    message_parts: list[str] = []
    blocked_message = None

    if restricted_flags:
        if from_context_restricted and from_query_restricted:
            r_src = "the user query and/or retrieved text"
        elif from_query_restricted:
            r_src = "the user query"
        else:
            r_src = "retrieved text"
        message_parts.append(
            f"Restricted chemical detected in {r_src}. Content is permitted only if usage complies with allowed_usage. Note: Use the retrieved context and source_name to answer the question only if passed the compliance check otherwise skip the source_name"
        )

    if blocked_chemical_names:
        blocked_str = ", ".join(f'"{name}"' for name in blocked_chemical_names)
        if from_context_blocked and from_query_blocked:
            b_src = "the user query and/or retrieved text"
        elif from_query_blocked:
            b_src = "the user query"
        else:
            b_src = "retrieved text"
        blocked_message = (
            f"Banned chemical(s) {blocked_str} found in {b_src}, so compliance check skipped that data."
        )
        message_parts.append(blocked_message)

    return (
        POPComplianceNotice(
            message=" ".join(message_parts),
            restricted_chemicals=restricted_flags,
            blocked_non_restricted_chemicals=blocked_chemical_names,
            blocked_message=blocked_message,
        ),
        compliant_nodes,
    )


@mcp.tool()
async def get_pop_states_and_crops() -> dict:
    """Return cached POP states and crops-per-state (refreshed from DB every 6 hours)."""
    export = get_metadata_export()
    logger.info("get_pop_states_and_crops states=%d", len(export.get("states") or []))
    return export


@mcp.tool()
async def get_context_from_package_of_practices(query: str, state: str, crop: str) -> POPContextResponse:
    """
    Retrieve POP context chunks for a query filtered by state and crop.

    Priority: doc_origin matches state, then central, then other origins.
    Only chunks with similarity >= 0.8 are returned (up to 5 unique documents).
    """
    request_started = time.perf_counter()
    logger.info(
        "get_context_from_pop start query_preview=%r state=%r crop=%r",
        (query or "")[:80],
        state,
        crop,
    )

    matched_state = validate_state(state)
    if not matched_state:
        available = get_states()
        logger.warning("invalid state input=%r available_count=%d", state, len(available))
        return POPContextResponse(
            contexts=[],
            compliance_notice=None,
            response_guidance=(
                f"We do not currently have POP data for state '{state}'. "
                f"Available states: {', '.join(available)}"
            ),
        )

    state = matched_state
    matched_crop = validate_crop(crop, state)
    if not matched_crop:
        available = get_crops_for_state(state)
        logger.warning(
            "invalid crop input=%r state=%r available_count=%d",
            crop,
            state,
            len(available),
        )
        return POPContextResponse(
            contexts=[],
            compliance_notice=None,
            response_guidance=(
                f"We do not currently have POP data for crop '{crop}' in state '{state}'. "
                f"Available crops: {', '.join(available)}"
            ),
        )

    crop = matched_crop
    logger.info("validated state=%r crop=%r", state, crop)

    query_embedding = await get_query_embedding(query)
    chunks = await asyncio.to_thread(
        retrieve_pop_contexts, query_embedding, state, crop
    )

    if not chunks:
        elapsed_ms = (time.perf_counter() - request_started) * 1000
        logger.info(
            "no chunks above threshold state=%r crop=%r elapsed_ms=%.1f",
            state,
            crop,
            elapsed_ms,
        )
        return POPContextResponse(
            contexts=[],
            compliance_notice=None,
            response_guidance=(
                f"POP data exists for crop '{crop}' in state '{state}', but no relevant "
                f"context could be retrieved for this query (similarity >= 0.8). "
                + RESPONSE_GUIDANCE
            ),
        )

    processed_nodes = [_chunk_to_context_pop(c) for c in chunks]
    compliance_notice, compliant_nodes = _build_compliance_notice(query, processed_nodes)

    restricted_names = (
        [f.chemical_name for f in compliance_notice.restricted_chemicals]
        if compliance_notice
        else []
    )
    blocked_names = (
        compliance_notice.blocked_non_restricted_chemicals
        if compliance_notice
        else []
    )
    elapsed_ms = (time.perf_counter() - request_started) * 1000
    logger.info(
        "get_context_from_pop done retrieved=%d compliant=%d restricted=%s blocked=%s elapsed_ms=%.1f",
        len(chunks),
        len(compliant_nodes),
        restricted_names or [],
        blocked_names or [],
        elapsed_ms,
    )

    return POPContextResponse(
        contexts=compliant_nodes,
        compliance_notice=compliance_notice,
        response_guidance=RESPONSE_GUIDANCE,
    )



if __name__ == "__main__":
    logger.info("starting POP v2 MCP host=%s port=%d", MCP_HOST, MCP_PORT)
    load_metadata_cache()
    start_metadata_refresh_loop()
    mcp.run(transport="streamable-http", host=MCP_HOST, port=MCP_PORT)
