import asyncio
import logging
import os
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient

from anthropic import APITimeoutError, APIConnectionError, APIStatusError
from dotenv import load_dotenv
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, BaseMessage, SystemMessage, HumanMessage, ToolMessage
from langchain_core.runnables import RunnableConfig, patch_config
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.graph import StateGraph, START, END
from langgraph.store.base import BaseStore

from ajrasakha.agents.answer_quality import (
    ensure_two_hour_disclaimer,
    is_sufficient_expert_answer,
    strip_two_hour_disclaimer,
)
from ajrasakha.agents.config import CLAUDE_MODEL, MCP_URLS
from ajrasakha.agents.location_context import (
    extract_location_updates_from_new_tool_messages,
    main_agent_location_context_message,
    merge_location_dict,
    merge_location_from_ai_tool_calls,
)
from ajrasakha.agents.memory import load_long_term_summary
from ajrasakha.agents.plan_executor import (
    ensure_location_node,
    execute_plan_node,
    route_after_execute,
    upload_reviewer_only_node,
)
from ajrasakha.agents.planner import (
    clarify_node,
    planner_node,
    route_after_ensure_location,
    route_after_planner,
)
from ajrasakha.agents.prompts import (
    EMPTY_GDB_REPLY,
    EXPERT_QUEUE_REPLY_MARKER,
    LLM_FALLBACK_MSG,
    WARNING_TEXT,
    WHATSAPP_SYSTEM_PROMPT,
)
from ajrasakha.agents.state import AjraSakhaState, Location, TRANSLATE_PATH_EMPTY_GDB
from ajrasakha.agents.assemble_answer_body import assemble_answer_body_node
from ajrasakha.agents.answer_shortener import answer_shortener_node
from ajrasakha.agents.non_agriculture_reply import non_agriculture_reply_node
from ajrasakha.agents.weather_unavailable_reply import weather_unavailable_reply_node
from ajrasakha.agents.tool_registry import get_main_tool_node

load_dotenv()

from ajrasakha.agents.crop_chemical_resolver import ensure_crop_master_loaded
from ajrasakha.agents.thread_logging import setup_thread_file_logging, with_thread_logging

ensure_crop_master_loaded()
setup_thread_file_logging()

MCP_SERVERS = {
    "golden_db":        {"url": MCP_URLS["gdb"],       "transport": "http"},
    "weather_server":   {"url": MCP_URLS["weather"],   "transport": "http"},
    "soil_server":      {"url": MCP_URLS["soil"],      "transport": "http"},
    "agmarknet_server": {"url": MCP_URLS["agmarknet"], "transport": "http"},
    "enam_server":      {"url": MCP_URLS["enam"],      "transport": "http"},
    "location_server":  {"url": MCP_URLS["location"],  "transport": "http"},
}

_tools_cache: list | None = None


def use_planner_graph() -> bool:
    return os.getenv("USE_PLANNER_GRAPH", "true").lower() in ("true", "1", "yes")


async def _get_main_tools_legacy() -> list:
    from ajrasakha.agents.tool_registry import get_main_tools
    return await get_main_tools()


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


# Sentinel returned by the gdb sub-agent (see GDB_SYSTEM_PROMPT rule 4) when
# every retrieval path comes back empty.
_GDB_EMPTY_SENTINEL = "NO_RELEVANT_CONTENT"


logger = logging.getLogger(__name__)


async def ajrasakha_node(
    state: AjraSakhaState,
    config: RunnableConfig,
    *,
    store: BaseStore | None = None,
) -> dict:
    main_tools = await _get_main_tools_legacy()
    merged_configurable = dict((config.get("configurable") or {}))
    merged_configurable["location"] = state.get("location")
    enriched_config = patch_config(config, configurable=merged_configurable)
    llm = ChatAnthropic(model=CLAUDE_MODEL).bind_tools(main_tools)
    long_term_summary = await load_long_term_summary(store, config)
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
    tool_node = await get_main_tool_node()

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
        result = await tool_node.ainvoke(state, config=enriched_config)
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



def route_after_tools_planner(state: AjraSakhaState) -> str:
    """After execute_plan: assemble body, translate, or empty GDB catalog path."""
    return route_after_execute(state)


def route_after_translate_answer(state: AjraSakhaState) -> str:
    """Shorten final answers, but leave expert-queue acknowledgements unchanged.

    Both normal LangGraph syntheses and direct expert-reviewed answers pass through
    ``translate_answer`` before they become farmer-facing. The empty-GDB route is
    different: it is only a notice that an expert answer is pending, not an answer
    that should receive a short/full representation.
    """
    plan = state.get("plan") or {}
    if plan.get("translate_path") == TRANSLATE_PATH_EMPTY_GDB:
        return "end"
    return "answer_shortener"


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


async def empty_gdb_reply_node(state: AjraSakhaState) -> dict:
    """Planner graph: empty body; translate_answer adds catalog 2-hour + testing."""
    from ajrasakha.agents.answer_footers import build_expert_queue_content
    from ajrasakha.agents.state import TRANSLATE_PATH_EMPTY_GDB
    from ajrasakha.agents.translation_catalog import language_pair_from_plan

    plan = {
        **(state.get("plan") or {}),
        "translate_path": TRANSLATE_PATH_EMPTY_GDB,
        "expert_queue": False,
    }
    if use_planner_graph():
        return {
            "messages": [AIMessage(content="")],
            "plan": plan,
            "location": state.get("location"),
        }
    script, vocal = language_pair_from_plan(plan)
    return {
        "messages": [AIMessage(content=build_expert_queue_content(script, vocal))],
        "plan": plan,
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
    """If the main LLM still has tool_calls pending, run tools; else sanitize the answer."""
    messages = state.get("messages") or []
    if not messages:
        return "sanitize_answer"
    last_message = messages[-1]
    if isinstance(last_message, AIMessage) and getattr(last_message, "tool_calls", None):
        return "tools"
    return "sanitize_answer"


def sanitize_answer_node(state: AjraSakhaState) -> dict:
    """Adjust the 2-hour reviewer disclaimer on the final farmer-facing answer.

    Disabled in _build_graph() (planner graph ends at translate_answer). Re-enable by
    uncommenting the sanitize_answer node and edges below.

    - GDB returned real data (gdb_has_data=True): ALWAYS strip the 2-hour disclaimer.
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
    if not answer_text or EXPERT_QUEUE_REPLY_MARKER in answer_text:
        return {}

    # Check if GDB returned real expert data
    plan = state.get("plan") or {}
    gdb_has_data = plan.get("gdb_has_data", False)

    if gdb_has_data:
        # GDB provided real data → ALWAYS strip the 2-hour disclaimer
        cleaned = strip_two_hour_disclaimer(answer_text)
        if cleaned == answer_text:
            return {}
        logger.info(
            "Removing 2-hour disclaimer from GDB-sourced answer (gdb_has_data=True, len %d -> %d)",
            len(answer_text),
            len(cleaned),
        )
        return {
            "messages": [AIMessage(content=cleaned, id=final_answer_msg.id)],
            "location": state.get("location"),
        }

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


def _build_graph():
    builder = StateGraph(AjraSakhaState)
    builder.add_node("empty_gdb_reply", with_thread_logging(empty_gdb_reply_node))
    builder.add_node("answer_shortener", with_thread_logging(answer_shortener_node))
    # builder.add_node("sanitize_answer", sanitize_answer_node)  # disabled: 2-hour disclaimer post-process

    if use_planner_graph():
        builder.add_node("planner", with_thread_logging(planner_node))
        builder.add_node("clarify", with_thread_logging(clarify_node))
        builder.add_node("ensure_location", with_thread_logging(ensure_location_node))
        builder.add_node("upload_reviewer_only", with_thread_logging(upload_reviewer_only_node))
        builder.add_node("non_agriculture_reply", with_thread_logging(non_agriculture_reply_node))
        builder.add_node(
            "weather_unavailable_reply",
            with_thread_logging(weather_unavailable_reply_node),
        )
        builder.add_node("execute_plan", with_thread_logging(execute_plan_node))
        builder.add_node("assemble_answer_body", with_thread_logging(assemble_answer_body_node))
        from ajrasakha.agents.translate_answer import translate_answer_node

        builder.add_node("translate_answer", with_thread_logging(translate_answer_node))

        builder.add_edge(START, "planner")
        builder.add_conditional_edges(
            "planner",
            route_after_planner,
            {"clarify": "clarify", "ensure_location": "ensure_location"},
        )
        builder.add_edge("clarify", END)
        builder.add_conditional_edges(
            "ensure_location",
            route_after_ensure_location,
            {
                "upload_reviewer_only": "upload_reviewer_only",
                "execute_plan": "execute_plan",
            },
        )
        builder.add_edge("upload_reviewer_only", "non_agriculture_reply")
        builder.add_edge("non_agriculture_reply", END)
        builder.add_conditional_edges(
            "execute_plan",
            route_after_tools_planner,
            {
                "assemble_answer_body": "assemble_answer_body",
                "translate_answer": "translate_answer",
                "empty_gdb_reply": "empty_gdb_reply",
                "weather_unavailable_reply": "weather_unavailable_reply",
            },
        )
        builder.add_edge("weather_unavailable_reply", END)
        builder.add_edge("assemble_answer_body", "translate_answer")
        builder.add_conditional_edges(
            "translate_answer",
            route_after_translate_answer,
            {"answer_shortener": "answer_shortener", "end": END},
        )
        builder.add_edge("empty_gdb_reply", "translate_answer")
        # builder.add_edge("translate_answer", "sanitize_answer")
    else:
        builder.add_edge("empty_gdb_reply", END)
    builder.add_edge("answer_shortener", END)
    # builder.add_edge("sanitize_answer", END)
    return builder.compile()



graph = _build_graph()
