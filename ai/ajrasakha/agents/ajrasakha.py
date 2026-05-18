import asyncio
import logging
import os
from typing import Annotated, Optional

from motor.motor_asyncio import AsyncIOMotorClient

from anthropic import APITimeoutError, APIConnectionError, APIStatusError
from dotenv import load_dotenv
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, BaseMessage, SystemMessage, HumanMessage, ToolMessage
from langchain_core.runnables import RunnableConfig, patch_config
from langchain_core.tools import tool
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from langgraph.store.base import BaseStore
from pydantic import BaseModel
from typing_extensions import TypedDict

from ajrasakha.agents.answer_quality import (
    ensure_two_hour_disclaimer,
    is_no_database_match_answer,
    is_sufficient_expert_answer,
    strip_two_hour_disclaimer,
)
from ajrasakha.agents.chemical_checker_agent import chemical_checker
from ajrasakha.agents.config import CLAUDE_MODEL, MCP_URLS
from ajrasakha.agents.gdb_agent import gdb
from ajrasakha.agents.location_context import (
    extract_location_updates_from_new_tool_messages,
    main_agent_location_context_message,
    merge_location_dict,
    merge_location_from_ai_tool_calls,
)
from ajrasakha.agents.market_agent import market
from ajrasakha.agents.prompts import (
    EMPTY_GDB_REPLY,
    LLM_FALLBACK_MSG,
    RELEVANCE_CHECK_PROMPT,
    WARNING_TEXT,
    WHATSAPP_SYSTEM_PROMPT,
)
from ajrasakha.agents.schemes_agent import schemes
from ajrasakha.agents.soil_agent import soil
from ajrasakha.agents.weather_agent import weather

load_dotenv()


class Location(TypedDict):
    latitude: Optional[float]
    longitude: Optional[float]
    city: Optional[str]
    state: Optional[str]
    address: Optional[str]


class AjraSakhaState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    location: Annotated[Optional[Location], merge_location_dict]


MCP_SERVERS = {
    "golden_db":        {"url": MCP_URLS["gdb"],       "transport": "http"},
    "weather_server":   {"url": MCP_URLS["weather"],   "transport": "http"},
    "soil_server":      {"url": MCP_URLS["soil"],      "transport": "http"},
    "agmarknet_server": {"url": MCP_URLS["agmarknet"], "transport": "http"},
    "enam_server":      {"url": MCP_URLS["enam"],      "transport": "http"},
    "location_server":  {"url": MCP_URLS["location"],  "transport": "http"},
}

_tools_cache: list | None = None


async def _get_tools() -> list:
    global _tools_cache
    if _tools_cache is None:
        all_tools = []
        seen: set[str] = set()
        for server_name, config in MCP_SERVERS.items():
            client = MultiServerMCPClient({server_name: config})
            tools = await client.get_tools()
            for t in tools:
                if t.name in seen:
                    t.name = f"{t.name}_{server_name}"
                seen.add(t.name)
                all_tools.append(t)
        _tools_cache = all_tools
    return _tools_cache


_location_tool = None
_reviewer_tool = None

async def _get_location_tool():
    global _location_tool
    if _location_tool is None:
        client = MultiServerMCPClient({"location_server": {"url": MCP_URLS["location"], "transport": "http"}})
        tools = await client.get_tools()
        _location_tool = tools[0]  # only one tool
    return _location_tool

async def _get_reviewer_tool():
    global _reviewer_tool
    if _reviewer_tool is None:
        client = MultiServerMCPClient({"reviewer_server": {"url": MCP_URLS["reviewer"], "transport": "http"}})
        tools = await client.get_tools()
        _reviewer_tool = tools[0]  # only one tool
    return _reviewer_tool

# Sentinel returned by the gdb sub-agent (see GDB_SYSTEM_PROMPT rule 4) when
# every retrieval path comes back empty.
_GDB_EMPTY_SENTINEL = "NO_RELEVANT_CONTENT"


class _RelevanceCheck(BaseModel):
    is_relevant: bool
    reasoning: str


logger = logging.getLogger(__name__)


def _coerce_store_text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        for k in ("summary", "text", "content", "value"):
            if k in value and isinstance(value[k], str):
                return value[k].strip()
    return ""


async def _load_long_term_summary(store: BaseStore | None, config: RunnableConfig) -> str:
    if store is None:
        return ""

    configurable = config.get("configurable") or {}
    thread_id = configurable.get("thread_id") or configurable.get("thread")
    user_id = configurable.get("user_id") or configurable.get("phone_number")

    namespace = ("ajrasakha", "daily_summaries", str(user_id or "unknown_user"))

    summary_parts: list[str] = []

    # Try key-based lookup first when thread_id is available.
    if thread_id:
        maybe_get = getattr(store, "aget", None)
        if callable(maybe_get):
            item = await maybe_get(namespace, str(thread_id))
            text = _coerce_store_text(getattr(item, "value", item))
            if text:
                summary_parts.append(text)
        else:
            maybe_sync_get = getattr(store, "get", None)
            if callable(maybe_sync_get):
                item = maybe_sync_get(namespace, str(thread_id))
                text = _coerce_store_text(getattr(item, "value", item))
                if text:
                    summary_parts.append(text)

    # Fall back to recent stored memories.
    if not summary_parts:
        maybe_search = getattr(store, "asearch", None)
        if callable(maybe_search):
            results = await maybe_search(namespace, limit=5)
        else:
            maybe_sync_search = getattr(store, "search", None)
            results = maybe_sync_search(namespace, limit=5) if callable(maybe_sync_search) else []
        for item in results or []:
            text = _coerce_store_text(getattr(item, "value", item))
            if text:
                summary_parts.append(text)

    return "\n".join(summary_parts[:3]).strip()


async def ajrasakha_node(
    state: AjraSakhaState,
    config: RunnableConfig,
    *,
    store: BaseStore | None = None,
) -> dict:
    location = await _get_location_tool()
    reviewer = await _get_reviewer_tool()
    merged_configurable = dict((config.get("configurable") or {}))
    merged_configurable["location"] = state.get("location")
    enriched_config = patch_config(config, configurable=merged_configurable)
    llm = ChatAnthropic(model=CLAUDE_MODEL).bind_tools([gdb, weather, soil, market, location, schemes, chemical_checker, reviewer])
    long_term_summary = await _load_long_term_summary(store, config)
    summary_context = (
        f"Long-term memory from previous daily threads:\n{long_term_summary}"
        if long_term_summary
        else "Long-term memory from previous daily threads:\nNo previous summary available."
    )
    messages = [
        SystemMessage(content=WHATSAPP_SYSTEM_PROMPT),
        SystemMessage(content=summary_context),
    ]
    loc_ctx = main_agent_location_context_message(state.get("location"))
    if loc_ctx:
        messages.append(loc_ctx)
    messages.extend(list(state["messages"]))

    try:
        response = await llm.ainvoke(messages, config=enriched_config)
    except (asyncio.CancelledError, TimeoutError, APITimeoutError,
            APIConnectionError) as exc:
        logger.warning(
            "LLM call failed (%s: %s) — returning safe fallback to protect thread history",
            type(exc).__name__, exc,
        )
        return {"messages": [AIMessage(content=LLM_FALLBACK_MSG)], "location": state.get("location")}
    except APIStatusError as exc:
        if exc.status_code >= 500:
            logger.warning(
                "Anthropic server error (%s) — returning safe fallback",
                exc.status_code,
            )
            return {"messages": [AIMessage(content=LLM_FALLBACK_MSG)], "location": state.get("location")}
        raise  # 4xx errors (auth, rate-limit) should still propagate

    return {"messages": [response], "location": state.get("location")}


async def tools_node(state: AjraSakhaState, config: RunnableConfig) -> dict:
    location = await _get_location_tool()
    reviewer = await _get_reviewer_tool()

    merged_configurable = dict((config.get("configurable") or {}))
    msgs = state.get("messages") or []
    last_ai = msgs[-1] if msgs else None
    loc_after_args = (
        merge_location_from_ai_tool_calls(last_ai, state.get("location"))
        if last_ai is not None
        else None
    )
    effective_location = loc_after_args if loc_after_args is not None else state.get("location")
    merged_configurable["location"] = effective_location
    enriched_config = patch_config(config, configurable=merged_configurable)

    try:
        result = await ToolNode([gdb, weather, soil, market, location, schemes, chemical_checker, reviewer]).ainvoke(state, config=enriched_config)
        new_msgs = result.get("messages") or []
        base_loc = effective_location
        loc_updates = extract_location_updates_from_new_tool_messages(new_msgs, base_loc)
        merged_loc = merge_location_dict(base_loc, loc_updates) if loc_updates is not None else base_loc
        result["location"] = merged_loc
        return result
    except Exception as exc:
        logger.error(
            "ToolNode execution failed (%s: %s) — injecting error tool messages "
            "to keep history valid",
            type(exc).__name__, exc,
        )
        # Build synthetic ToolMessage responses for each pending tool_call
        # so the message history stays valid (every tool_use gets a tool response).
        last_ai = state["messages"][-1]
        error_messages = []
        if hasattr(last_ai, "tool_calls") and last_ai.tool_calls:
            for tc in last_ai.tool_calls:
                error_messages.append(ToolMessage(
                    content=(
                        f"Tool execution failed: {type(exc).__name__}. "
                        "Please inform the user that the service is temporarily unavailable."
                    ),
                    tool_call_id=tc["id"],
                    name=tc["name"],
                ))
        if not error_messages:
            # Shouldn't happen, but guard against edge cases
            error_messages.append(ToolMessage(
                content=f"Tool execution failed: {type(exc).__name__}",
                tool_call_id="unknown",
            ))
        return {"messages": error_messages, "location": effective_location}


_mongo_client = None

def get_async_mongo_collection():
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = AsyncIOMotorClient(os.environ.get("GOLDEN_MONGODB_URI", ""))
    db = _mongo_client["agriai"]
    return db["questions"]

async def exact_search_node(state: AjraSakhaState, config: RunnableConfig) -> dict:
    messages = state.get("messages", [])
    if not messages:
        return {"messages": []}
        
    last_message = messages[-1]
    if isinstance(last_message, HumanMessage):
        content = last_message.content
        if isinstance(content, list):
            query = " ".join([
                b.get("text", "") if isinstance(b, dict) and b.get("type") == "text"
                else str(b) if isinstance(b, str) else ""
                for b in content
            ]).strip()
        else:
            query = str(content).strip()
        
        collection = get_async_mongo_collection()
        index_name = "review_questions_search_index"
        
        pipeline = [
            {
                "$search": {
                    "index": index_name,
                    "text": {
                        "query": query,
                        "path": ["question", "text"]
                    }
                }
            },
            {"$limit": 5},
            {
                "$lookup": {
                    "from": "answers",
                    "localField": "_id",
                    "foreignField": "questionId",
                    "as": "answer_docs"
                }
            },
            {
                "$lookup": {
                    "from": "users",
                    "localField": "answer_docs.authorId",
                    "foreignField": "_id",
                    "as": "author_docs"
                }
            },
            {
                "$project": {
                    "score": {"$meta": "searchScore"},
                    "question": 1,
                    "answer": {"$arrayElemAt": ["$answer_docs.answer", 0]},
                    "sources": {"$arrayElemAt": ["$answer_docs.sources", 0]},
                    "author_name": {"$arrayElemAt": ["$author_docs.firstName", 0]}
                }
            }
        ]
        
        try:
            cursor = collection.aggregate(pipeline)
            results = await cursor.to_list(length=5)
            
            import string
            import re
            def normalize(t: str) -> str:
                return re.sub(r'\s+', ' ', t.translate(str.maketrans('', '', string.punctuation)).lower()).strip()
            
            norm_query = normalize(query)
            
            for top_doc in results:
                if normalize(top_doc.get("question", "")) == norm_query:
                    answer = top_doc.get("answer", "")
                    sources = top_doc.get("sources", [])
                    author_name = top_doc.get("author_name", "")
                    
                    if answer:
                        content = f"{answer}\n\n"
                        
                        if author_name:
                            content += f"**Expert:** {author_name.title()}\n"
                            
                        if sources:
                            content += "**Sources:**\n"
                            for s in sources:
                                src_name = s.get("source_name", "Link")
                                src_link = s.get("source", "")
                                if src_link:
                                    content += f"- [{src_name}]({src_link})\n"
                                else:
                                    content += f"- {src_name}\n"
                        
                        content += f"\n{WARNING_TEXT}"
                        
                        return {"messages": [AIMessage(content=content)]}
        except Exception as e:
            logger.error("Error in exact_search_node: %s", e)
            pass

    return {"messages": []}

def route_after_exact_search(state: AjraSakhaState) -> str:
    messages = state.get("messages", [])
    if not messages:
        return "ajrasakha"
    last_message = messages[-1]
    if isinstance(last_message, AIMessage):
        return END
    return "ajrasakha"


def _tool_message_text(message: ToolMessage) -> str:
    """Normalise ToolMessage.content (which may be a string or a list of
    content blocks) into a single trimmed string for sentinel matching."""
    content = message.content
    if content is None:
        return ""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict):
                text = block.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return " ".join(parts).strip()
    return str(content).strip()


def _is_empty_gdb_tool_content(message: ToolMessage) -> bool:
    """Return True when the gdb sub-agent reported no relevant content.

    We treat the explicit ``NO_RELEVANT_CONTENT`` sentinel as well as truly
    empty payloads (``""``, ``"[]"``, ``"{}"``) as "empty". Error strings
    (e.g. ``"⚠️ The database service is temporarily unavailable …"``) are
    deliberately NOT matched so the LLM can still handle them gracefully.
    """
    text = _tool_message_text(message)
    if not text:
        return True
    if text in {"[]", "{}"}:
        return True
    return text.upper() == _GDB_EMPTY_SENTINEL


def route_after_tools(state: AjraSakhaState) -> str:
    """If the most recent tool batch shows that `gdb` returned nothing useful,
    short-circuit straight to the canned acknowledgement instead of looping
    back to the LLM (which would otherwise hallucinate or run further
    fallbacks). All other cases continue with the regular flow."""
    messages = state.get("messages") or []
    for msg in reversed(messages):
        # Stop scanning once we hit the AIMessage that issued the current
        # tool_calls — anything before that belongs to an older turn.
        if isinstance(msg, AIMessage):
            break
        if isinstance(msg, ToolMessage) and getattr(msg, "name", None) == "gdb":
            if _is_empty_gdb_tool_content(msg):
                logger.info(
                    "gdb returned empty/NO_RELEVANT_CONTENT — short-circuiting "
                    "to canned reviewer-upload acknowledgement"
                )
                return "empty_gdb_reply"
    return "ajrasakha"


def empty_gdb_reply_node(state: AjraSakhaState) -> dict:
    """Deterministic terminal node: emits the reviewer-upload acknowledgement
    plus the mandatory testing-version disclaimer when gdb has no match."""
    return {
        "messages": [AIMessage(content=EMPTY_GDB_REPLY)],
        "location": state.get("location"),
    }


def _message_to_text(message: BaseMessage) -> str:
    """Flatten a message's content (string or list of blocks) into plain text."""
    content = message.content
    if content is None:
        return ""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict):
                text = block.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return " ".join(parts).strip()
    return str(content).strip()


def route_after_ajrasakha(state: AjraSakhaState) -> str:
    """Replacement for ``tools_condition``: if the main LLM still has tool_calls
    pending, run the tools; otherwise hand the final answer to the relevance
    checker before returning to the farmer."""
    messages = state.get("messages") or []
    if not messages:
        return "relevance_check"
    last_message = messages[-1]
    if isinstance(last_message, AIMessage) and getattr(last_message, "tool_calls", None):
        return "tools"
    return "relevance_check"


def _is_unsourced_agricultural_advice(answer_text: str) -> bool:
    """Heuristic: True when the answer looks like substantive agricultural
    advice but lacks ANY attribution to approved data sources.

    This catches cases where the LLM generated a helpful-sounding answer
    from its own training data instead of from GDB/Reviewer/POP tools.
    Answers about weather, market prices, soil health, and government schemes
    that cite their official sources are NOT flagged by this check.
    """
    import re
    from ajrasakha.agents.answer_quality import strip_warning_disclaimer

    # CRITICAL: Strip the testing disclaimer FIRST. It contains URLs,
    # source names (Annam.ai, IMD, Agmarknet), and "expert-verified" which
    # would create false-positive attribution signals.
    stripped = strip_warning_disclaimer(answer_text.strip())

    # Answers that admit no/limited DB match should be fully replaced with
    # the canned EMPTY_GDB_REPLY — flag them as unsourced. Must check BEFORE
    # the length filter so short "limited info" answers aren't skipped.
    if is_no_database_match_answer(stripped):
        return True

    # Short answers (greetings, clarifications, scope rejections) are fine.
    if len(stripped) < 150:
        return False

    # Weather / market / soil / scheme answers with official source citations
    # are legitimate even without expert names — skip them.
    _OFFICIAL_SOURCES = re.compile(
        r"IMD|eNAM|Agmarknet|soilhealth\.dac\.gov\.in|myscheme\.gov\.in|"
        r"APMC|mandi|forecast|temperature|humidity|rainfall|"
        r"₹/quintal|market price|modal price",
        re.IGNORECASE,
    )
    if _OFFICIAL_SOURCES.search(stripped):
        return False

    # Clarification requests and scope rejections are fine.
    _CLARIFICATION = re.compile(
        r"could you (?:please )?(?:tell|share|provide|specify)|"
        r"which (?:crop|state|district)|"
        r"please (?:share|provide|tell|specify)|"
        r"what is your|"
        r"I (?:am|'m) only designed to help|"
        r"not (?:related to|about) agriculture",
        re.IGNORECASE,
    )
    if _CLARIFICATION.search(stripped):
        return False

    # Now check for source-attribution signals. If NONE are present in the
    # answer body (disclaimer already stripped), it was generated from LLM
    # knowledge.
    _EXPERT_INDICATORS = re.compile(
        r"expert|author|agri\s*specialist|agriexpert|specialist|reviewed\s+by",
        re.IGNORECASE,
    )
    _SOURCE_INDICATORS = re.compile(
        r"source|reference|sourced\s+from|approved\s+materials|"
        r"annam\.ai|golden\s*(?:data|db)|package\s+of\s+practices",
        re.IGNORECASE,
    )
    _URL_PATTERN = re.compile(r"https?://|www\.", re.IGNORECASE)

    has_expert = bool(_EXPERT_INDICATORS.search(stripped))
    has_source = bool(_SOURCE_INDICATORS.search(stripped))
    has_link   = bool(_URL_PATTERN.search(stripped))

    # If none of the three attribution signals are present, it's unsourced.
    if not has_expert and not has_source and not has_link:
        return True

    return False


async def relevance_check_node(
    state: AjraSakhaState,
    config: RunnableConfig,
) -> dict:
    """Verify the assistant's final answer is BOTH on-topic AND sourced from
    approved data (GDB, Reviewer, POP, or official government APIs).

    Two checks are performed:
    1. **Heuristic pre-check**: catches obvious cases where the LLM generated
       agricultural advice from its own knowledge (no expert names, no source
       links, no citation table). These are replaced immediately.
    2. **LLM-based check**: for borderline cases, an LLM verifies both topic
       relevance and source attribution.
    """
    messages = state.get("messages") or []
    if not messages:
        return {}

    final_answer_msg: AIMessage | None = None
    for msg in reversed(messages):
        if isinstance(msg, AIMessage) and not getattr(msg, "tool_calls", None):
            final_answer_msg = msg
            break

    last_user_msg: HumanMessage | None = None
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            last_user_msg = msg
            break

    if final_answer_msg is None or last_user_msg is None:
        return {}

    question_text = _message_to_text(last_user_msg)
    answer_text = _message_to_text(final_answer_msg)

    if not question_text or not answer_text:
        return {}

    # Never second-guess the canned acknowledgement itself — it's already the
    # safe fallback we'd otherwise route to.
    if answer_text.startswith(EMPTY_GDB_REPLY[:80]):
        return {}

    # ── Heuristic pre-check: catch unsourced agricultural advice ──────────
    if _is_unsourced_agricultural_advice(answer_text):
        logger.info(
            "Heuristic pre-check: answer is agricultural advice with NO source "
            "attribution (no expert, no source link, no citation) — replacing "
            "with canned reviewer-upload acknowledgement (len=%d)",
            len(answer_text),
        )
        return {
            "messages": [AIMessage(content=EMPTY_GDB_REPLY, id=final_answer_msg.id)],
            "location": state.get("location"),
        }

    # ── LLM-based relevance + source verification ────────────────────────
    try:
        checker = ChatAnthropic(model=CLAUDE_MODEL).with_structured_output(_RelevanceCheck)
        result = await checker.ainvoke(
            [
                SystemMessage(content=RELEVANCE_CHECK_PROMPT),
                HumanMessage(
                    content=(
                        f"Farmer's question:\n{question_text}\n\n"
                        f"Proposed answer:\n{answer_text}"
                    )
                ),
            ],
            config=config,
        )
    except (asyncio.CancelledError, TimeoutError, APITimeoutError,
            APIConnectionError, APIStatusError) as exc:
        logger.warning(
            "Relevance check failed (%s: %s) — falling back to heuristic "
            "(answer already passed pre-check, allowing through)",
            type(exc).__name__, exc,
        )
        return {}
    except Exception as exc:
        logger.warning(
            "Relevance check raised unexpectedly (%s: %s) — falling back to "
            "heuristic (answer already passed pre-check, allowing through)",
            type(exc).__name__, exc,
        )
        return {}

    if result.is_relevant:
        return {}

    logger.info(
        "LLM relevance check flagged answer as not relevant (reason: %s) — "
        "replacing with canned reviewer-upload acknowledgement",
        result.reasoning,
    )
    # Reuse the original message id so the `add_messages` reducer overwrites
    # the irrelevant answer instead of appending a second AIMessage.
    return {
        "messages": [AIMessage(content=EMPTY_GDB_REPLY, id=final_answer_msg.id)],
        "location": state.get("location"),
    }


def sanitize_answer_node(state: AjraSakhaState) -> dict:
    """Adjust the 2-hour reviewer disclaimer on the final farmer-facing answer.

    - Strong GDB-style answer (expert + sources + links): strip disclaimer if present.
    - Weak / no-database-match answer: append disclaimer if missing.
    """
    messages = state.get("messages") or []
    final_answer_msg: AIMessage | None = None
    for msg in reversed(messages):
        if isinstance(msg, AIMessage) and not getattr(msg, "tool_calls", None):
            final_answer_msg = msg
            break

    if final_answer_msg is None:
        return {}

    answer_text = _message_to_text(final_answer_msg)
    if not answer_text or answer_text.startswith(EMPTY_GDB_REPLY[:80]):
        return {}

    if is_sufficient_expert_answer(answer_text):
        cleaned = strip_two_hour_disclaimer(answer_text)
        if cleaned == answer_text:
            return {}
        logger.info(
            "Removing 2-hour disclaimer from sufficient expert answer (len %d -> %d)",
            len(answer_text),
            len(cleaned),
        )
        return {
            "messages": [AIMessage(content=cleaned, id=final_answer_msg.id)],
            "location": state.get("location"),
        }

    updated = ensure_two_hour_disclaimer(answer_text)
    if updated == answer_text:
        return {}

    logger.info(
        "Appending 2-hour disclaimer to insufficient/no-match answer (len %d -> %d)",
        len(answer_text),
        len(updated),
    )
    return {
        "messages": [AIMessage(content=updated, id=final_answer_msg.id)],
        "location": state.get("location"),
    }


builder = StateGraph(AjraSakhaState)
builder.add_node("exact_search", exact_search_node)
builder.add_node("ajrasakha", ajrasakha_node)
builder.add_node("tools", tools_node)
builder.add_node("empty_gdb_reply", empty_gdb_reply_node)
builder.add_node("relevance_check", relevance_check_node)
builder.add_node("sanitize_answer", sanitize_answer_node)

builder.add_edge(START, "exact_search")
builder.add_conditional_edges(
    "exact_search", 
    route_after_exact_search,
    {END: END, "ajrasakha": "ajrasakha"}
)
builder.add_conditional_edges(
    "ajrasakha",
    route_after_ajrasakha,
    {"tools": "tools", "relevance_check": "relevance_check"},
)
builder.add_conditional_edges(
    "tools",
    route_after_tools,
    {"ajrasakha": "ajrasakha", "empty_gdb_reply": "empty_gdb_reply"},
)
builder.add_edge("empty_gdb_reply", END)
builder.add_edge("relevance_check", "sanitize_answer")
builder.add_edge("sanitize_answer", END)

graph = builder.compile()
