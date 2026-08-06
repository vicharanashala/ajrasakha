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

from anthropic import APITimeoutError, APIConnectionError, APIStatusError
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from ajrasakha.agents.config import SYNTHESIZE_MODEL
from ajrasakha.agents.llm_trace import trace_llm_request, trace_llm_response
from ajrasakha.agents.state import AjraSakhaState
from ajrasakha.agents.thread_logging import end_conversation_turn
from ajrasakha.agents.thread_trace import trace_event
from ajrasakha.agents.translation_catalog import language_pair_from_plan

logger = logging.getLogger(__name__)


FOLLOW_UP_SYSTEM_PROMPT = """You are AjraSakha, an AI assistant for Indian farmers.

The farmer already received a complete answer to a question in this thread. They
have now sent a SHORT follow-up request to TRANSFORM that previous answer
(translate to another language, change format, give more detail, simplify, change
tone, or rephrase).

Your job: produce the transformed answer using ONLY the previous answer content
plus the follow-up request. Do NOT invent new agricultural facts, do NOT call
tools, do NOT mention sources or experts — the previous answer already carries
those.

LANGUAGE (NON-NEGOTIABLE):
- Match the farmer's follow-up language exactly. The language pair is given to
  you as (script_language, vocal_language).
- Romanized/Latin typing → reply in Latin script (e.g. Hinglish in Devanagari
  words written with English letters is a violation).
- Native script → use that script.

FORMAT (NON-NEGOTIABLE):
- WhatsApp-friendly plain text. No markdown headers (** ##), no emojis, no bullet
  markers like "- ".
- Use simple line breaks for new paragraphs.
- Keep sentences short and practical for a farmer.
- Preserve the agricultural facts from the previous answer; only change the form
  the farmer asked for.

WHAT YOU MUST NOT DO:
- Do not start with "Sure", "Here is", "Of course", or similar filler.
- Do not repeat the previous answer in the original language if a language change
  was requested.
- Do not add disclaimers, source citations, or testing notices — the application
  appends those automatically.
- Do not ask follow-up questions — answer the request now.
"""

_FOLLOW_UP_TYPE_INSTRUCTIONS = {
    "language_change": (
        "Translate the previous answer into the farmer's follow-up language. "
        "Preserve all agricultural facts and chemical names; transliterate brand "
        "names if needed."
    ),
    "format_change": (
        "Reformat the previous answer into the form the farmer asked for "
        "(bullets, short, paragraph, table-as-text). Keep all facts; change only "
        "the form."
    ),
    "detail_request": (
        "Expand the previous answer with more detail — extra context, additional "
        "steps, more explanation of why each action matters. Stay grounded in the "
        "facts already present; do not invent new ones."
    ),
    "simplify": (
        "Rewrite the previous answer in simpler words a less experienced farmer "
        "can understand. Keep it short and practical."
    ),
    "tone_change": (
        "Rewrite the previous answer with the tone the farmer asked for (expert, "
        "polite, beginner-friendly, technical). Keep the facts identical."
    ),
    "rephrase": (
        "Rephrase the previous answer — same meaning, different wording. Do not "
        "add or remove facts."
    ),
}


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
    if follow_up_type and follow_up_type in _FOLLOW_UP_TYPE_INSTRUCTIONS:
        return _FOLLOW_UP_TYPE_INSTRUCTIONS[follow_up_type]
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
    language_directive = (
        f"OUTPUT LANGUAGE: write in {vocal} using the {script} writing system.\n"
    )

    system_content = (
        FOLLOW_UP_SYSTEM_PROMPT
        + "\n"
        + type_instruction
        + "\n\n"
        + language_directive
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
        llm = ChatAnthropic(model=SYNTHESIZE_MODEL)
        trace_llm_request(
            "follow_up",
            model=SYNTHESIZE_MODEL,
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
