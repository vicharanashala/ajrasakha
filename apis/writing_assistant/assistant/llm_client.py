"""MiniMax chat-completions client. Mirrors the OpenAI-compatible
request/response shape already used against this same self-hosted model
elsewhere in this repo (ai/ajrasakha/agents/config.py's
get_minimax_chat_model, apis/ans_gen_pop/llm_client.py).

Every call goes through _chat_completion() - the one seam tests monkeypatch
so no automated test ever makes a real network call.
"""

import json

import httpx

from . import config, text_checks
from .models import LLMUnavailableError, QuestionType, SelectionClassification, StepCoverage

_POLISH_SYSTEM_PROMPT = (
    "You correct grammar, spelling, punctuation, and sentence construction "
    "in short agricultural advisory answers written by a human expert. "
    "You improve clarity only. You must NEVER add, remove, or change any "
    "fact, recommendation, instruction, chemical name, dosage, quantity, "
    "unit, timing, condition, or the certainty of any claim. If you cannot "
    "improve the wording without touching any of that, return the text "
    "unchanged. Return only the corrected text, nothing else - no preamble, "
    "no explanation."
)

_SEMANTIC_CHECK_SYSTEM_PROMPT = (
    "You compare an original agricultural advisory sentence against a "
    "proposed rewrite. Answer only with a JSON object of the exact shape "
    '{"changed": true|false, "explanation": "..."}. Set "changed" to true '
    "if the rewrite adds, removes, or alters any fact, recommendation, "
    "instruction, chemical name, dosage, quantity, unit, timing, condition, "
    "or the certainty/strength of any claim, or changes which instruction a "
    "quantity or condition is attached to. Set it to false only if the "
    "rewrite is a pure language/grammar improvement with no such change."
)


def generate_polish(draft_text: str) -> str:
    """Returns a candidate grammar/spelling/clarity-only rewrite. Never
    verifies its own output - that is the separate guardrail's job."""
    messages = [
        {"role": "system", "content": _POLISH_SYSTEM_PROMPT},
        {"role": "user", "content": draft_text},
    ]
    content = _chat_completion(messages, temperature=0.0)
    return content.strip()


def check_meaning_preserved(original_text: str, rewrite_text: str) -> tuple[bool, str]:
    """Second-opinion check - structured output, not proof. Returns
    (changed, explanation). Raises LLMUnavailableError if the response can't
    be parsed as the expected JSON shape - callers must treat that as a
    failed check, never as 'no change detected'."""
    user_content = json.dumps({"original": original_text, "rewrite": rewrite_text})
    messages = [
        {"role": "system", "content": _SEMANTIC_CHECK_SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]
    content = _chat_completion(messages, temperature=0.0)
    try:
        parsed = json.loads(content)
        return bool(parsed["changed"]), str(parsed.get("explanation", ""))
    except (json.JSONDecodeError, KeyError, TypeError) as exc:
        raise LLMUnavailableError(f"Could not parse semantic-check response: {exc}") from exc


_SELECTION_SYSTEM_PROMPT = (
    "You classify a farmer's agricultural question against a fixed set of "
    "reference structures. You NEVER decide which reference takes "
    "precedence over another - you only report matches and ambiguity; a "
    "separate deterministic step applies the precedence rules. Respond "
    "only with a JSON object of this exact shape: "
    '{"domain": "<one of the listed domains, or null if none fit confidently>", '
    '"question_type": "Broad" or "Narrow" or null, '
    '"matched_direct_topic": <integer index into the Direct Topic list that '
    "clearly and specifically matches, or null>, "
    '"ambiguous_direct_topics": [<indices of two or more Direct Topic entries '
    "that could equally plausibly match, if genuinely ambiguous - otherwise []>], "
    '"matched_crop_variants": [<indices into the Crop Variant list whose crop '
    "is clearly the one in the question - 0, 1, or more if genuinely ambiguous>]}"
)


def classify_and_select(
    question: str,
    known_domains: list[str],
    direct_topic_candidates: list[tuple[str | None, str | None, str]],
    crop_variant_candidates: list[tuple[str | None, str | None, str | None, str]],
) -> SelectionClassification:
    lines = [f"Question: {question}", "", "Known domains:"]
    lines += [f"  - {d}" for d in known_domains]
    lines.append("")
    lines.append("Direct Topic candidates (index: domain/code - question):")
    for i, (domain, code, topic_question) in enumerate(direct_topic_candidates):
        lines.append(f"  [{i}] {domain}/{code} - {topic_question}")
    lines.append("")
    lines.append("Crop Variant candidates (index: domain/code/crop - question):")
    for i, (domain, code, crop, variant_question) in enumerate(crop_variant_candidates):
        lines.append(f"  [{i}] {domain}/{code}/{crop} - {variant_question}")

    messages = [
        {"role": "system", "content": _SELECTION_SYSTEM_PROMPT},
        {"role": "user", "content": "\n".join(lines)},
    ]
    content = _chat_completion(messages, temperature=0.0)
    try:
        parsed = json.loads(content)
        return SelectionClassification(
            domain=parsed.get("domain"),
            question_type=QuestionType(parsed["question_type"]) if parsed.get("question_type") else None,
            matched_direct_topic=parsed.get("matched_direct_topic"),
            ambiguous_direct_topics=parsed.get("ambiguous_direct_topics") or [],
            matched_crop_variants=parsed.get("matched_crop_variants") or [],
        )
    except (json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
        raise LLMUnavailableError(f"Could not parse selection-classification response: {exc}") from exc


_STEP_COVERAGE_SYSTEM_PROMPT = (
    "You check whether a farmer-facing draft answer covers one specific "
    "expected step from a reference answer structure. The draft is given "
    "as a numbered list of sections. Recognize equivalent wording - do "
    "not require exact keyword matches. If the draft has no sentence or "
    "heading about this step's topic at all, respond missing - do not "
    "give partial credit just because a different section's content is "
    "thematically related (e.g. a section about chemical control does "
    "not cover a missing decision-point step just because both concern "
    "treatment). Respond only with a JSON object of this exact shape: "
    '{"coverage": "covered" or "partial" or "missing", "section_index": '
    "<the 1-based section number that primarily addresses this step, or "
    'null if coverage is "missing">}. "covered" means the draft clearly '
    'addresses this step (even in different words). "partial" means the '
    "draft touches on it but leaves out part of what the step/example "
    'describes. "missing" means the draft does not address this step\'s '
    "topic at all."
)


def classify_step_coverage(draft_text: str, step_description: str, example: str) -> tuple[StepCoverage, int | None]:
    """Returns (coverage, section_index) - section_index is the 1-based
    index (per text_checks.split_sections) of the draft section that
    primarily addresses this step, or None when coverage is missing.
    Used by structural_validator to flag out-of-order sections (Writing
    Assistant Build Plan, Revision 14, ISS-06)."""
    sections = text_checks.split_sections(draft_text)
    numbered_draft = "\n\n".join(f"[{i}] {s}" for i, s in enumerate(sections, start=1))
    user_content = json.dumps(
        {"draft": numbered_draft, "expected_step": step_description, "example_of_what_satisfies_it": example}
    )
    messages = [
        {"role": "system", "content": _STEP_COVERAGE_SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]
    content = _chat_completion(messages, temperature=0.0)
    try:
        parsed = json.loads(content)
        coverage = StepCoverage(parsed["coverage"])
        section_index = parsed.get("section_index")
        return coverage, int(section_index) if section_index is not None else None
    except (json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
        raise LLMUnavailableError(f"Could not parse step-coverage response: {exc}") from exc


def _chat_completion(messages: list[dict], **kwargs) -> str:
    if not config.MINIMAX_BASE_URL:
        raise LLMUnavailableError("MINIMAX_BASE_URL is not set")

    url = config.MINIMAX_BASE_URL.rstrip("/") + config.MINIMAX_CHAT_PATH
    headers = {"Content-Type": "application/json"}
    if config.MINIMAX_API_KEY:
        headers["Authorization"] = f"Bearer {config.MINIMAX_API_KEY}"

    payload = {"model": config.MINIMAX_MODEL, "messages": messages, "seed": config.MINIMAX_SEED, **kwargs}

    try:
        response = httpx.post(url, json=payload, headers=headers, timeout=config.MINIMAX_TIMEOUT_SECONDS)
        response.raise_for_status()
        data = response.json()
        # MiniMax's own official API reports some failures via base_resp
        # inside an HTTP 200 rather than an HTTP error status (confirmed by
        # a live probe against the real API) - the self-hosted/OpenAI-
        # compatible path doesn't send this field at all, hence .get().
        base_resp = data.get("base_resp")
        if base_resp and base_resp.get("status_code") not in (None, 0):
            raise LLMUnavailableError(f"MiniMax reported an error: {base_resp}")
        return data["choices"][0]["message"]["content"]
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
        raise LLMUnavailableError(f"MiniMax call failed: {exc}") from exc
