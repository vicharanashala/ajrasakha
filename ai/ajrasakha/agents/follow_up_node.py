"""Follow-up node — transforms the previous AI answer based on the farmer's
follow-up request (language change, format change, detail, simplification, tone,
rephrase) without invoking any specialist tools.

Inputs (read from state):
    plan.follow_up_type    - "language_change" | "format_change" | "detail_request" |
                             "simplify" | "tone_change" | "rephrase"
    plan.main_question     - the previous turn's rephrased_query
    plan.vocal_language    - the farmer's vocal language (one of OFFICIAL_LANGUAGES)
    plan.script_language   - the farmer's script (English for Latin/Roman)
    messages               - last AI message in thread is the previous answer

Output:
    messages: [AIMessage(content=new_answer)]
    plan:     { ...plan, gdb_has_data: False, translate_path: None }

The graph routes the follow-up node's output to translate_answer for footers.
"""

from __future__ import annotations

import logging
from typing import Optional

from openai import APITimeoutError, APIConnectionError, APIStatusError
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from ajrasakha.agents.config import FOLLOW_UP_MODEL, get_minimax_chat_model
from ajrasakha.agents.llm_trace import trace_llm_request, trace_llm_response
from ajrasakha.agents.prompts import FOLLOW_UP_SYSTEM_PROMPT, FOLLOW_UP_TYPE_INSTRUCTIONS
from ajrasakha.agents.state import AjraSakhaState
from ajrasakha.agents.thread_logging import end_conversation_turn
from ajrasakha.agents.thread_trace import trace_event
from ajrasakha.agents.translation_catalog import language_pair_from_plan

logger = logging.getLogger(__name__)


def _message_to_text(message: BaseMessage) -> str:
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


def _previous_ai_answer(messages: list[BaseMessage]) -> str:
    """Return the content of the last farmer-facing AI message in the thread."""
    for msg in reversed(messages):
        if isinstance(msg, AIMessage) and not getattr(msg, "tool_calls", None):
            text = _message_to_text(msg)
            if text:
                return text
    return ""


def _latest_human_text(messages: list[BaseMessage]) -> str:
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            return _message_to_text(msg)
    return ""


def _type_instruction(follow_up_type: Optional[str]) -> str:
    if follow_up_type and follow_up_type in FOLLOW_UP_TYPE_INSTRUCTIONS:
        return FOLLOW_UP_TYPE_INSTRUCTIONS[follow_up_type]
    return (
        "Apply the farmer's follow-up request to the previous answer (translate, "
        "reformat, expand, simplify, change tone, or rephrase). Preserve facts; "
        "change only what was asked."
    )


async def follow_up_node(state: AjraSakhaState, config: RunnableConfig) -> dict:
    """Generate a transformed answer from the previous AI message + follow-up request."""
    plan = state.get("plan") or {}
    messages = state.get("messages") or []
    script, vocal = language_pair_from_plan(plan)

    follow_up_type = plan.get("follow_up_type")
    main_question = plan.get("main_question") or ""
    previous_answer = _previous_ai_answer(messages)
    follow_up_text = _latest_human_text(messages)

    trace_event(
        "follow_up_node_input",
        follow_up_type=follow_up_type,
        main_question=main_question,
        follow_up_text=follow_up_text[:200],
        previous_answer_len=len(previous_answer),
        script=script,
        vocal=vocal,
    )

    if not previous_answer or not follow_up_text:
        logger.warning(
            "follow_up_node: missing input — previous_answer_len=%d follow_up_text_len=%d",
            len(previous_answer),
            len(follow_up_text),
        )
        # Nothing to transform — fall back to a safe placeholder; translate_answer
        # will append the standard footers.
        fallback = (
            "Sorry, I could not find your previous answer to transform. "
            "Please resend your question."
        )
        end_conversation_turn(fallback, outcome="follow_up_missing_input")
        return {
            "messages": [AIMessage(content=fallback)],
            "plan": {**plan, "gdb_has_data": False, "translate_path": None},
            "location": state.get("location"),
        }

    type_instruction = _type_instruction(follow_up_type)
    # Deliberately do NOT pin the output language here — let Sonnet figure out
    # the target language from the follow-up text itself (e.g. "translate to
    # Telugu", "Hindi mein batao"). Pinning language_pair would force a Hindi
    # body when the farmer types in Hinglish but asks for Telugu.

    system_content = (
        FOLLOW_UP_SYSTEM_PROMPT
        + "\n\n"
        + type_instruction
    )

    human_content = (
        f"FOLLOW-UP TYPE: {follow_up_type or 'unspecified'}\n\n"
        f"MAIN QUESTION (what the previous answer was about):\n{main_question}\n\n"
        f"PREVIOUS AI ANSWER (to transform):\n{previous_answer}\n\n"
        f"FARMER'S FOLLOW-UP REQUEST:\n{follow_up_text}\n\n"
        "Produce the transformed answer now."
    )

    llm_messages: list[BaseMessage] = [
        SystemMessage(content=system_content),
        HumanMessage(content=human_content),
    ]

    try:
        llm = get_minimax_chat_model()
        trace_llm_request(
            "follow_up",
            model=FOLLOW_UP_MODEL,
            messages=llm_messages,
            vocal_language=vocal,
            script_language=script,
        )
        response = await llm.ainvoke(llm_messages, config=config)
        new_answer = _message_to_text(response)
        trace_llm_response(
            "follow_up",
            output=new_answer,
            vocal_language=vocal,
            script_language=script,
        )
        if not new_answer.strip():
            raise RuntimeError("LLM returned empty follow-up body")
        end_conversation_turn(new_answer, outcome="follow_up")
        return {
            "messages": [AIMessage(content=new_answer)],
            "plan": {**plan, "gdb_has_data": False, "translate_path": None},
            "location": state.get("location"),
        }
    except (APITimeoutError, APIConnectionError, asyncio_TimeoutError) as exc:
        logger.warning(
            "follow_up_node: LLM failed (%s: %s) — returning previous answer as-is",
            type(exc).__name__,
            exc,
        )
        # Degraded fallback: keep the previous answer; translate_answer still
        # applies language footers. Better to over-serve than to lose context.
        end_conversation_turn(previous_answer, outcome="follow_up_fallback")
        return {
            "messages": [AIMessage(content=previous_answer)],
            "plan": {**plan, "gdb_has_data": False, "translate_path": None},
            "location": state.get("location"),
        }
    except APIStatusError as exc:
        logger.warning(
            "follow_up_node: API status error %s — returning previous answer as-is",
            exc.status_code,
        )
        end_conversation_turn(previous_answer, outcome="follow_up_fallback")
        return {
            "messages": [AIMessage(content=previous_answer)],
            "plan": {**plan, "gdb_has_data": False, "translate_path": None},
            "location": state.get("location"),
        }
    except Exception as exc:
        logger.warning(
            "follow_up_node: unexpected error (%s: %s) — returning previous answer as-is",
            type(exc).__name__,
            exc,
        )
        end_conversation_turn(previous_answer, outcome="follow_up_fallback")
        return {
            "messages": [AIMessage(content=previous_answer)],
            "plan": {**plan, "gdb_has_data": False, "translate_path": None},
            "location": state.get("location"),
        }


# asyncio.TimeoutError is TimeoutError in 3.11+, kept as alias for older runtimes
asyncio_TimeoutError = TimeoutError
