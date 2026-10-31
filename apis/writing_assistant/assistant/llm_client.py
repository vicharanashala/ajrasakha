"""MiniMax chat-completions client. Mirrors the OpenAI-compatible
request/response shape already used against this same self-hosted model
elsewhere in this repo (ai/ajrasakha/agents/config.py's
get_minimax_chat_model, apis/ans_gen_pop/llm_client.py).

Every call goes through _chat_completion() - the one seam tests monkeypatch
so no automated test ever makes a real network call.
"""

import json
import re
from urllib.parse import urlparse

import httpx

from . import config, text_checks
from .models import LLMUnavailableError, QuestionType, SelectionClassification, StepCoverage

# Tailscale's userspace-networking mode (see scripts/start.sh) creates no
# network interface, so a 100.x address is only reachable through the
# local SOCKS5 proxy tailscaled exposes. Mirrors
# backend/src/bootstrap/tailnetProxy.ts's isTailnetHost exactly, so both
# services agree on what needs the proxy - everything else (the public
# MiniMax API) keeps its normal direct route.
_TAILNET_SOCKS_PROXY = "socks5h://localhost:1055"
_TAILNET_HOST_RE = re.compile(r"^100\.(\d+)\.")


def _is_tailnet_host(hostname: str) -> bool:
    if hostname.endswith(".ts.net"):
        return True
    m = _TAILNET_HOST_RE.match(hostname)
    return bool(m) and 64 <= int(m.group(1)) <= 127

_POLISH_SYSTEM_PROMPT = (
    "You correct grammar, spelling, punctuation, and sentence construction "
    "in short agricultural advisory answers written by a human expert. "
    "You improve clarity only. You must NEVER add, remove, or change any "
    "fact, recommendation, instruction, chemical name, dosage, quantity, "
    "unit, timing, condition, or the certainty of any claim. You must also "
    "NEVER change formatting that isn't a language error: keep every "
    "heading's exact text, capitalization and punctuation style as-is "
    "(do not change a heading's dash to a colon, add a question mark, or "
    "add trailing spaces); never add markdown/markup that wasn't already "
    "there (no asterisks, underscores, or other emphasis added around "
    "words); never remove or add emoji, bullet/numbering style (keep "
    "'1)' as '1)', not '1.'), or any other symbol that was already "
    "present; never change the capitalization of a proper noun (a named "
    "disease, pest, variety, or scheme) unless it is a genuine spelling "
    "error. If the text has no genuine grammar/spelling/clarity issue to "
    "fix, return it completely unchanged, character for character - do "
    "not make a stylistic change just to produce a different output. If "
    "you cannot improve the wording without touching any of the above, "
    "return the text unchanged. Return only the corrected text, nothing "
    "else - no preamble, no explanation."
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
    "separate deterministic step applies the precedence rules. "
    "Broad vs Narrow (verified directly from the real reference data's own "
    "labeled examples - this is the actual distinction, not a generic "
    "guess): Broad means the farmer describes a symptom or situation and "
    "needs a diagnosis or a general starting plan - e.g. 'I am seeing "
    "dried up central shoots in my paddy field, what pest is this and how "
    "do I control it?', 'I want to convert my field to organic farming, "
    "how do I start?', 'How do I get a Kisan Credit Card and what will "
    "the interest rate be?' (even though phrased as 'how do I', this is "
    "Broad - the farmer has no card yet and needs the general starting "
    "picture). Narrow means the farmer already has the general situation "
    "and asks one specific, already-scoped follow-up about it - e.g. "
    "'Which chemical spray should I use for stem borer, and how many days "
    "before harvest should I stop spraying?', 'Is the Swarna variety "
    "resistant to bacterial leaf blight?', 'My cotton crop failed due to "
    "drought, how do I file an insurance claim under PMFBY?' (a specific "
    "procedure for an already-identified event, not a general starting "
    "question). The test is not the question's grammatical form (both "
    "can start with 'how do I') - it's whether the farmer still needs "
    "general orientation (Broad) or already has it and wants one "
    "specific next step (Narrow). Respond only with a JSON object of "
    "this exact shape: "
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
    "as a numbered list of sections. You are also given the full ordered "
    "list of every other expected step, for context only - credit THIS "
    "step only for content that is distinctly about its own topic, never "
    "for content that is more specifically a different listed step's "
    "topic - even when the two are related by the same underlying "
    "narrative (e.g. severity and a decision-to-escalate step both "
    "discuss how bad the problem is getting, but a decision step still "
    "needs its own explicit decision/threshold content, not just the "
    "severity step's description of the problem worsening). A step late "
    "in the list (e.g. a closing summary/conclusion step) must not be "
    "credited just because the draft's earlier sections already cover "
    "the facts it would summarize - a summary step needs the draft to "
    "actually tie them together, not merely contain them elsewhere. The "
    "test is structural, not just factual: a fact belonging to this "
    "step being true somewhere in the draft is not enough by itself - "
    "the draft needs its own distinct portion (a sentence, bullet, or "
    "section) whose purpose is addressing this step. A passing mention "
    "of this step's topic inside a different section whose own main "
    "purpose is something else (e.g. the opening introduction briefly "
    "restating a fact that the real expected step is supposed to "
    "establish) is missing for this step, not covered - crediting it "
    "would mean the author never had to write this step at all. "
    "Recognize equivalent "
    "wording - do not require exact keyword matches. If the draft has no "
    "sentence or heading distinctly about this step's own topic, respond "
    "missing - do not give partial credit just because a different "
    "section's content is thematically related (e.g. a section about "
    "chemical control does not cover a missing decision-point step just "
    "because both concern treatment). You are also given the specific "
    "subject (pest/disease/crop/topic) this whole reference answer is "
    "about - if the draft is clearly about a different subject (a "
    "different named pest, disease, crop, or topic than the one given), "
    "respond missing for every step regardless of how generically similar "
    "the draft's wording sounds (e.g. generic-sounding 'use cultural "
    "measures like spacing and drainage' does not satisfy a step if the "
    "draft is actually about a different pest than the one this reference "
    "is for). Respond only with a JSON object of "
    'this exact shape: {"coverage": "covered" or "partial" or "missing", '
    '"section_index": <the 1-based section number that primarily '
    "addresses THIS step specifically, or null if coverage is "
    '"missing">}. "covered" means the draft clearly addresses this '
    'step\'s own topic (even in different words). "partial" means the '
    "draft touches on it but leaves out part of what the step/example "
    'describes. "missing" means the draft does not address this step\'s '
    "own topic at all."
)


def classify_step_coverage(
    draft_text: str,
    step_description: str,
    example: str,
    all_step_descriptions: list[str] | None = None,
    reference_subject: str | None = None,
) -> tuple[StepCoverage, int | None]:
    """Returns (coverage, section_index) - section_index is the 1-based
    index (per text_checks.split_sections) of the draft section that
    primarily addresses this step, or None when coverage is missing.
    Used by structural_validator to flag out-of-order sections (Writing
    Assistant Build Plan, Revision 14, ISS-06).

    all_step_descriptions (every step's name, this one included, in
    order) gives the model the context to tell "this is distinctly
    step N's own topic" apart from "this merely overlaps with a
    different step's topic" - confirmed live that a summary/conclusion-
    style step was otherwise credited just because the facts it would
    summarize already existed in other, genuinely-present sections
    (Writing Assistant Build Plan, Revision 16, ISS-05).

    reference_subject (the matched reference's own topic, e.g. its
    original question text) lets the model reject generic-sounding
    content when the draft is actually about a different pest/disease/
    crop than this reference is for - confirmed live that a pest
    question's reference was credited by an unrelated disease's draft
    almost in full, since "use cultural measures" reads as plausible
    for any pest/disease in isolation (Revision 16, ISS-10)."""
    sections = text_checks.split_sections(draft_text)
    numbered_draft = "\n\n".join(f"[{i}] {s}" for i, s in enumerate(sections, start=1))
    payload = {"draft": numbered_draft, "expected_step": step_description, "example_of_what_satisfies_it": example}
    if all_step_descriptions:
        payload["all_expected_steps_in_order_for_context_only"] = all_step_descriptions
    if reference_subject:
        payload["this_reference_is_specifically_about"] = reference_subject
    user_content = json.dumps(payload)
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
    proxy = _TAILNET_SOCKS_PROXY if _is_tailnet_host(urlparse(config.MINIMAX_BASE_URL).hostname or "") else None

    try:
        response = httpx.post(
            url, json=payload, headers=headers, timeout=config.MINIMAX_TIMEOUT_SECONDS, proxy=proxy
        )
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
