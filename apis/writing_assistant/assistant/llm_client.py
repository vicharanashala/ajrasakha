"""Gemini (public API, gemini-3.8-flash) client. Replaces the self-hosted
MiniMax-M2.7 client this service used before - team-provided access to
Gemini for this endpoint. A directly-reachable public HTTPS API, so there
is no tailnet/SOCKS proxy to route through (unlike the self-hosted
model's 100.x tailnet address).

Every call goes through _chat_completion() - the one seam tests monkeypatch
so no automated test ever makes a real network call.

The concurrency semaphore, per-call timeout budgets, and hedged-request
racing below are carried over unchanged from the MiniMax tuning (team
request - see config.py). That mechanism is provider-agnostic; the
specific NUMBERS it's tuned to (a 5-call concurrency cap, 20-30s
timeouts, an 8s hedge delay) were derived against MiniMax's own serving
stack, not Gemini's - flagged at each value's own definition, not
re-litigated here.
"""

import json
import logging
import re
import threading
import time
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from typing import Callable, TypeVar

import httpx

from . import config, text_checks
from .models import LLMUnavailableError, ReferenceStep, StepCoverage

T = TypeVar("T")

log = logging.getLogger("writing_assistant.llm_client")

# Some Gemini responses wrap answer text in a markdown code fence even
# when the prompt asks for plain JSON or plain text - the same failure
# shape MiniMax had (see the old llm_client.py history). Cheap and
# harmless to keep even if Gemini turns out to need it less often.
# Anchored to the WHOLE response (after trimming whitespace) on purpose -
# a fence wrapping only part of the content is a different, unconfirmed
# failure shape, not this one, and a loose match risks silently mangling
# a legitimate answer that merely contains backticks.
_MARKDOWN_FENCE_RE = re.compile(r"^```(?:json)?\s*\n?(.*?)\n?```$", re.DOTALL)


def _strip_markdown_fence(content: str) -> str:
    match = _MARKDOWN_FENCE_RE.match(content.strip())
    return match.group(1).strip() if match else content


# One shared, persistent connection (reused across every call, in every
# thread) instead of opening a fresh TCP connection per request - same
# connection-reuse win measured against MiniMax (~1.3s/call), expected to
# carry over since it's pure HTTP-client plumbing, not provider-specific.
# Lazy (not built at import time) so a missing GEMINI_API_KEY still
# surfaces as the normal "not set" error on first real call, same as
# before.
_client: httpx.Client | None = None
_client_lock = threading.Lock()


def _get_client() -> httpx.Client:
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                _client = httpx.Client()
    return _client


def _post(url: str, json: dict, headers: dict, timeout: float):
    """The one seam between llm_client and the network - tests monkeypatch
    this instead of httpx.post, since calls go through a shared, reused
    Client rather than a fresh one-off connection per call."""
    return _get_client().post(url, json=json, headers=headers, timeout=timeout)


# One process-wide bounded pool, shared by every request (not created per
# request) - see config.GEMINI_MAX_CONCURRENT_CALLS for why this cap
# exists (carried over from the MiniMax tuning) and what it was actually
# tuned against. httpx.Client is documented thread-safe for concurrent
# sync requests, so sharing one Client (above) across this pool's worker
# threads is safe.
_pool = ThreadPoolExecutor(max_workers=config.GEMINI_MAX_CONCURRENT_CALLS, thread_name_prefix="gemini-call")

# Gates every REAL network call to the model - both a "primary" attempt
# dispatched through run_concurrent above AND a hedge fired from inside
# _chat_completion's own racing logic. Without this, hedging quietly
# defeats the whole point of the concurrency cap: up to
# GEMINI_MAX_CONCURRENT_CALLS logical items can each be running a hedge
# pair at once, so real concurrent calls could reach 2x the cap (this
# exact bug was live-confirmed against MiniMax - a run with several
# sections hedging at once pushed effective concurrency back toward the
# contention zone the cap was tuned to avoid). Sized identically to
# _pool on purpose - a hedge attempt simply queues for a slot like any
# other call when the budget is fully spent on primary attempts, rather
# than ever exceeding the cap.
_concurrency_semaphore = threading.BoundedSemaphore(config.GEMINI_MAX_CONCURRENT_CALLS)


def run_concurrent(fns: list[Callable[[], T]]) -> list[T]:
    """Runs each zero-arg callable in fns through the shared bounded pool
    and returns their results in the same order as fns (not completion
    order) - callers that reassemble output by position (e.g. rejoining
    polished sections, or structural_validator's step order for
    order_warnings) rely on this. Each fn is expected to handle its own
    LLMUnavailableError internally (as structural_validator's checklist-
    vote attempts and _generate_polish_per_section's per-section calls
    already do) - an exception here means a real bug, not a flaky call,
    and should propagate like any other call would."""
    futures = [_pool.submit(fn) for fn in fns]
    return [f.result() for f in futures]

# Per-section fallback prompt (used only by _generate_polish_per_section
# below) - the whole-document prompt further down is tried first.
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

# Tried first by generate_polish, below - one call instead of one per
# section, so it must preserve section boundaries/headings itself (the
# per-section fallback doesn't need to, since each section is its own
# whole call there). Live-confirmed on a real 10-section draft with
# several real grammar errors: Gemini fixed every error, left every
# already-correct section byte-identical, preserved every heading's
# exact text/order/count, and preserved every dose/unit/PHI figure, in
# one ~5s call - unlike MiniMax, which is why this service used to split
# per-section at all.
_POLISH_WHOLE_DOC_SYSTEM_PROMPT = (
    "You correct grammar, spelling, punctuation, and sentence construction "
    "in a farmer-facing agricultural advisory answer written by a human "
    "expert. The answer is organized into sections, each starting with its "
    "own heading line, separated by blank lines. You improve clarity only. "
    "You must NEVER add, remove, or change any fact, recommendation, "
    "instruction, chemical name, dosage, quantity, unit, timing, condition, "
    "or the certainty of any claim. You must preserve the exact same "
    "section headings, in the exact same order and count, with their exact "
    "original text, capitalization and punctuation style - never reworded, "
    "merged, split, reordered, added, or removed. Never add markdown/markup "
    "that wasn't already there (no asterisks, underscores, or other "
    "emphasis added around words); never remove or add emoji, bullet/"
    "numbering style (keep '1)' as '1)', not '1.'), or any other symbol "
    "that was already present; never change the capitalization of a proper "
    "noun (a named disease, pest, variety, or scheme) unless it is a "
    "genuine spelling error. If a section's body has no genuine grammar/"
    "spelling/clarity issue, return that section's body completely "
    "unchanged, character for character - do not make a stylistic change "
    "just to produce a different output. Return the ENTIRE corrected "
    "document, with every section and its heading, separated by blank "
    "lines exactly like the input - never only the sections you changed, "
    "never a summary, and never any preamble or explanation."
)

_SEMANTIC_CHECK_BATCH_SYSTEM_PROMPT = (
    "You compare several independent (original, rewrite) sentence/section "
    "pairs from an agricultural advisory document - judge each pair on its "
    "own, without letting one pair's verdict influence another's. For EACH "
    "pair, decide whether the rewrite adds, removes, or alters any fact, "
    "recommendation, instruction, chemical name, dosage, quantity, unit, "
    "timing, condition, or the certainty/strength of any claim, or changes "
    "which instruction a quantity or condition is attached to, compared to "
    "the original. Set changed=false only if the rewrite is a pure "
    "language/grammar improvement with no such change. Respond with a JSON "
    "array, one object per pair IN THE SAME ORDER GIVEN, each of the exact "
    'shape {"index": <0-based index of the pair, matching its position in '
    'the input>, "changed": true|false, "explanation": "..."}.'
)

_MEANING_CHECK_RESPONSE_SCHEMA = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "properties": {
            "index": {"type": "INTEGER"},
            "changed": {"type": "BOOLEAN"},
            "explanation": {"type": "STRING"},
        },
        "required": ["index", "changed", "explanation"],
    },
}


def generate_polish(draft_text: str) -> tuple[str, list[int]]:
    """Returns (candidate_rewrite, failed_section_numbers). Never verifies
    its own output - that is the separate guardrail's job.

    Tries ONE whole-document rewrite call first (see
    _POLISH_WHOLE_DOC_SYSTEM_PROMPT's own comment for why this is now
    reliable against Gemini, unlike against the self-hosted MiniMax model
    this replaced) - replaces what used to always cost one call per
    section (up to 10) plus a sequential retry pass. Falls back to the
    slower per-section path (_generate_polish_per_section, kept verbatim
    from before this change) only if the whole-document call fails
    outright, or comes back with a different section count than the
    original - a dropped/merged section is not safe to reassemble, so
    that's treated as a failed attempt, never silently returned."""
    try:
        content = _chat_completion(
            [
                {"role": "system", "content": _POLISH_WHOLE_DOC_SYSTEM_PROMPT},
                {"role": "user", "content": draft_text},
            ],
            temperature=0.0,
            call_name="generate_polish[whole-document]",
            timeout=config.GEMINI_POLISH_TIMEOUT_SECONDS,
            thinking_level="low",
        )
        rewritten = content.strip()
        original_sections = text_checks.split_sections(draft_text)
        rewritten_sections = text_checks.split_sections(rewritten)
        if len(rewritten_sections) == len(original_sections):
            return rewritten, []
        log.warning(
            "generate_polish: whole-document call returned %d section(s), expected %d - "
            "falling back to the per-section path",
            len(rewritten_sections), len(original_sections),
        )
    except LLMUnavailableError as exc:
        log.warning("generate_polish: whole-document call failed, falling back to the per-section path: %s", exc)
    return _generate_polish_per_section(draft_text)


def _generate_polish_per_section(draft_text: str) -> tuple[str, list[int]]:
    """Rewrites one section at a time (text_checks.split_sections) -
    carried over from the MiniMax client this service originally
    replaced, where the whole-document version reliably stalled/timed out
    for certain drafts while short, narrowly-scoped calls ran fine. Kept
    as generate_polish's fallback path (above) for the same reason: it
    survives a draft shape the single whole-document call can't handle,
    even against Gemini. A section whose own call fails falls back to its
    original, unrewritten text - safe by construction (identical text
    can't introduce a technical-content change) - and its 1-based section
    number is reported in failed_section_numbers so the caller can tell a
    genuine full polish apart from a partial one that silently kept some
    sections untouched. Only raises if every section fails.

    Sections are independent of each other, so they're dispatched through
    the shared bounded pool (run_concurrent) instead of one at a time -
    live load-tested (against MiniMax) at 3.85x-25.88x faster than
    sequential for this exact call shape, with the process-wide cap
    preventing concurrent requests from overloading the model together.

    Any section that still fails after that gets ONE more attempt, run
    strictly sequentially (not through the pool) after every other
    section has already finished - recovers reliability for exactly the
    minority of sections that need it, without paying the fully-
    sequential cost on the common case."""
    sections = text_checks.split_sections(draft_text)

    def _polish_one(i: int, section: str) -> tuple[str, int | None]:
        messages = [
            {"role": "system", "content": _POLISH_SYSTEM_PROMPT},
            {"role": "user", "content": section},
        ]
        try:
            content = _chat_completion(
                messages, temperature=0.0, call_name=f"generate_polish[section {i}]",
                timeout=config.GEMINI_POLISH_TIMEOUT_SECONDS, thinking_level="low",
            )
            return content.strip(), None
        except LLMUnavailableError as exc:
            log.warning("polishing section %d failed, keeping it unchanged: %s", i, exc)
            return section, i

    results = run_concurrent(
        [lambda i=i, s=s: _polish_one(i, s) for i, s in enumerate(sections, start=1)]
    )
    polished_sections = [content for content, _ in results]
    failed_section_numbers = [i for _, i in results if i is not None]

    if failed_section_numbers and len(failed_section_numbers) < len(sections):
        log.info(
            "generate_polish: retrying section(s) %s sequentially (uncontended) after the concurrent pass",
            failed_section_numbers,
        )
        still_failed = []
        for i in failed_section_numbers:
            content, failed_i = _polish_one(i, sections[i - 1])
            polished_sections[i - 1] = content
            if failed_i is not None:
                still_failed.append(failed_i)
        failed_section_numbers = still_failed

    if len(failed_section_numbers) == len(sections):
        raise LLMUnavailableError(
            f"Gemini call failed for every section ({len(failed_section_numbers)}/{len(sections)})"
        )
    return "\n\n".join(polished_sections), failed_section_numbers


def check_meaning_preserved_batch(pairs: list[tuple[str, str]]) -> list[tuple[bool, str]]:
    """One call checks every (original, rewrite) pair at once - replaces
    what used to cost one call per changed section (run_concurrent over
    check_meaning_preserved, one call each). Returns results in the same
    order as `pairs`, re-indexed from the model's own "index" field
    rather than trusted to come back in order. Raises LLMUnavailableError
    (never a partial list) if any pair's index is missing from the
    response or the JSON doesn't parse - callers must treat that as the
    whole batch failing, the same fail-closed principle as every other
    check here; a batch that silently returned fewer judgments than pairs
    sent would otherwise look indistinguishable from a passing result."""
    if not pairs:
        return []
    payload = {"pairs": [{"original": o, "rewrite": r} for o, r in pairs]}
    messages = [
        {"role": "system", "content": _SEMANTIC_CHECK_BATCH_SYSTEM_PROMPT},
        {"role": "user", "content": json.dumps(payload)},
    ]
    content = _chat_completion(
        messages,
        temperature=0.0,
        call_name="check_meaning_preserved_batch",
        timeout=config.GEMINI_POLISH_TIMEOUT_SECONDS,
        response_schema=_MEANING_CHECK_RESPONSE_SCHEMA,
        thinking_level="low",
    )
    try:
        parsed = json.loads(content)
        by_index = {int(item["index"]): (bool(item["changed"]), str(item.get("explanation", ""))) for item in parsed}
        return [by_index[i] for i in range(len(pairs))]
    except (json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
        raise LLMUnavailableError(f"Could not parse batched semantic-check response: {exc}") from exc


# Scores EVERY step passed in `steps` in one call, rather than one call
# per step - replaces what used to cost up to 30 calls per request (10
# fixed steps x 3 majority votes). Gemini's larger context and better
# instruction-following make this reliable in one shot (live-confirmed
# against the full 10-step checklist, a partial-draft case, a mislabeled-
# heading case, and a wrong-topic case - see the commit/PR notes this
# change shipped with). Still majority-voted, just at the whole-checklist
# level instead of per-step (see structural_validator's own voting logic)
# - a step still needs ALL vote attempts to come back with no answer for
# it before it's NOT_ASSESSED, same fail-closed guarantee as before, just
# correlated across steps within one call instead of independent per call.
_ALL_STEPS_COVERAGE_SYSTEM_PROMPT = (
    "You check whether a farmer-facing draft answer covers each step from "
    "a list of expected steps (steps_to_score), scored against a fixed "
    "checklist every draft is judged against. The draft is given as a "
    "numbered list of sections. You are also given the full ordered list "
    "of every expected step in the checklist "
    "(all_expected_steps_in_order_for_context_only, steps_to_score "
    "included), for context only - credit a given step only for content "
    "that is distinctly about its own topic, never for content that is "
    "more specifically a different listed step's topic - even when the "
    "two are related by the same underlying narrative (e.g. severity and "
    "a decision-to-escalate step both discuss how bad the problem is "
    "getting, but a decision step still needs its own explicit decision/"
    "threshold content, not just the severity step's description of the "
    "problem worsening). A step late in the list (e.g. a closing summary/"
    "conclusion step) must not be credited just because the draft's "
    "earlier sections already cover the facts it would summarize - a "
    "summary step needs the draft to actually tie them together, not "
    "merely contain them elsewhere. The test is structural, not just "
    "factual: a fact belonging to a step being true somewhere in the "
    "draft is not enough by itself - the draft needs its own distinct "
    "portion (a sentence, bullet, or section) whose purpose is addressing "
    "that step. A passing mention of a step's topic inside a different "
    "section whose own main purpose is something else (e.g. the opening "
    "introduction briefly restating a fact that the real expected step is "
    "supposed to establish) is missing for that step, not covered - "
    "crediting it would mean the author never had to write that step at "
    "all. Recognize equivalent wording - do not require exact keyword "
    "matches. If the draft has no sentence or heading distinctly about a "
    "step's own topic, respond missing for it - do not give partial "
    "credit just because a different section's content is thematically "
    "related (e.g. a section about chemical control does not cover a "
    "missing decision-point step just because both concern treatment). "
    "Judge by the actual content under a heading, never by the heading's "
    "label alone - a section heading matching a step's name proves "
    "nothing by itself. A heading with no real content beneath it (blank, "
    "placeholder, or only whitespace) is missing, not covered. Content "
    "that is gibberish, nonsensical, or does not meaningfully address any "
    "real topic is also missing, however long it is. If a section's "
    "actual content clearly belongs to a DIFFERENT step than its heading "
    "suggests (e.g. a 'Conclusion' heading whose text is really "
    "introductory background, or an 'Introduction' heading whose text is "
    "really a closing summary), that mislabeled content does not satisfy "
    "the heading's own step - only real content that actually serves a "
    "step's own purpose counts for that step, regardless of what heading "
    "the author gave it; mislabeled content may instead satisfy whichever "
    "step it actually serves. You are also given the actual question this "
    "draft is answering - if the draft is clearly about a different "
    "subject (a different named pest, disease, crop, or topic than the "
    "question asks about), respond missing for every step in "
    "steps_to_score regardless of how generically similar the draft's "
    "wording sounds (e.g. generic-sounding 'use cultural measures like "
    "spacing and drainage' does not satisfy a step if the draft is "
    "actually about a different pest than the question is about). For "
    "EVERY step in steps_to_score, respond with exactly one JSON object "
    'of this shape: {"step": "<the exact step text as given>", '
    '"coverage": "covered" or "partial" or "missing", "section_index": '
    "<the 1-based section number that primarily addresses THAT step "
    'specifically, or null if its coverage is "missing">}. "covered" '
    "means the draft clearly addresses that step's own topic, with real, "
    'substantive content (even in different words). "partial" means the '
    "draft touches on it but leaves out part of what the step/example "
    'describes. "missing" means the draft does not address that step\'s '
    "own topic at all - including a blank heading, gibberish, or content "
    "that actually belongs to a different step. Respond with a JSON "
    "array containing exactly one such object per step in steps_to_score, "
    "in the same order steps_to_score was given."
)

def _step_coverage_response_schema(step_names: list[str]) -> dict:
    """"step" is constrained to the exact names being scored: results are
    matched back by name, so a model echoing a name with any variation
    (an en-dash for a hyphen, different casing) would otherwise silently
    cost that step its vote and leave it NOT_ASSESSED."""
    return {
        "type": "ARRAY",
        "items": {
            "type": "OBJECT",
            "properties": {
                "step": {"type": "STRING", "enum": step_names},
                "coverage": {"type": "STRING", "enum": ["covered", "partial", "missing"]},
                "section_index": {"type": "INTEGER", "nullable": True},
            },
            "required": ["step", "coverage"],
        },
    }


def classify_all_steps_coverage(
    draft_text: str,
    question: str,
    steps: list[ReferenceStep],
    all_step_names: list[str],
) -> dict[str, tuple[StepCoverage, int | None]]:
    """Returns {step_name: (coverage, section_index)} for every step in
    `steps` that the model's response actually included - a step the
    model's JSON array omits simply isn't a key in the returned dict
    (callers treat that the same as a failed vote for that one step,
    never as "missing"; see structural_validator's voting logic).
    section_index is the 1-based index (per text_checks.split_sections)
    of the draft section that primarily addresses that step, or None when
    its coverage is missing. Used by structural_validator to flag
    out-of-order sections (Writing Assistant Build Plan, Revision 14,
    ISS-06).

    all_step_names (every step's name, steps included, in order) gives
    the model the context to tell "this is distinctly step N's own
    topic" apart from "this merely overlaps with a different step's
    topic" - confirmed live (against MiniMax) that a summary/conclusion-
    style step was otherwise credited just because the facts it would
    summarize already existed in other, genuinely-present sections
    (Writing Assistant Build Plan, Revision 16, ISS-05).

    question (the actual question this draft is answering) lets the
    model reject generic-sounding content when the draft is actually
    about a different pest/disease/crop than the question asks about -
    confirmed live (against MiniMax) that a pest question's answer was
    credited by an unrelated disease's draft almost in full, since "use
    cultural measures" reads as plausible for any pest/disease in
    isolation (Revision 16, ISS-10)."""
    sections = text_checks.split_sections(draft_text)
    numbered_draft = "\n\n".join(f"[{i}] {s}" for i, s in enumerate(sections, start=1))
    payload = {
        "draft": numbered_draft,
        "the_question_this_draft_is_answering": question,
        "all_expected_steps_in_order_for_context_only": all_step_names,
        "steps_to_score": [{"step": s.step, "example": s.example} for s in steps],
    }
    messages = [
        {"role": "system", "content": _ALL_STEPS_COVERAGE_SYSTEM_PROMPT},
        {"role": "user", "content": json.dumps(payload)},
    ]
    content = _chat_completion(
        messages,
        temperature=0.0,
        call_name="classify_all_steps_coverage",
        timeout=config.GEMINI_COVERAGE_TIMEOUT_SECONDS,
        response_schema=_step_coverage_response_schema([s.step for s in steps]),
        thinking_level="medium",
    )
    try:
        parsed = json.loads(content)
        results: dict[str, tuple[StepCoverage, int | None]] = {}
        for item in parsed:
            coverage = StepCoverage(item["coverage"])
            section_index = item.get("section_index")
            results[item["step"]] = (coverage, int(section_index) if section_index is not None else None)
        return results
    except (json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
        raise LLMUnavailableError(f"Could not parse step-coverage response: {exc}") from exc


# How long a single call runs before a second, independent attempt
# fires in parallel - originally carried over from the MiniMax tuning
# (chosen there to sit just past that model's own typical 2-7s latency).
# Re-tuned for Gemini's own call shape: since classify_all_steps_coverage
# now scores the whole 10-step checklist in one call (thinkingLevel
# "medium"), live-measured latency for that call alone ranges ~5-15s even
# on ordinary drafts - the old 8s delay would hedge (double the real
# network calls) on a large fraction of perfectly healthy requests, not
# just genuinely stuck ones. 18s sits comfortably past that measured
# range while still well under GEMINI_COVERAGE_TIMEOUT_SECONDS (30s), so
# a truly stuck call still gets hedged before its timeout, but a normal
# one no longer pays for a redundant duplicate call. This is a hedge, not
# a retry: both attempts race, and whichever succeeds first wins.
_HEDGE_DELAY_SECONDS = 18.0


def _chat_completion(
    messages: list[dict],
    call_name: str = "unknown",
    timeout: float | None = None,
    response_schema: dict | None = None,
    thinking_level: str | None = None,
    **kwargs,
) -> str:
    if not config.GEMINI_API_KEY:
        raise LLMUnavailableError("GEMINI_API_KEY is not set")

    budget = timeout if timeout is not None else config.GEMINI_TIMEOUT_SECONDS
    url = f"{config.GEMINI_BASE_URL.rstrip('/')}/models/{config.GEMINI_MODEL}:generateContent"
    # The key goes in a header, not the URL query string, so it never
    # ends up in access logs or history the way a ?key= param would.
    headers = {"Content-Type": "application/json", "x-goog-api-key": config.GEMINI_API_KEY}

    # messages keeps the same system/user shape every call site already
    # uses - translated here into Gemini's own shape (a separate
    # systemInstruction field, plus a "contents" list of role/parts
    # turns) so no call site had to change.
    system_instruction = next((m["content"] for m in messages if m["role"] == "system"), None)
    contents = [{"role": m["role"], "parts": [{"text": m["content"]}]} for m in messages if m["role"] != "system"]
    generation_config = {"seed": config.GEMINI_SEED, **kwargs}
    if response_schema is not None:
        # Live-confirmed (unlike MiniMax) Gemini returns clean JSON with
        # no markdown fence at all under this - a whole failure mode
        # (_strip_markdown_fence below) this removes for every call that
        # uses it. Every JSON-returning call site passes this now.
        generation_config["responseMimeType"] = "application/json"
        generation_config["responseSchema"] = response_schema
    if thinking_level is not None:
        # "low"/"medium"/"high" - live-confirmed accepted by the real API.
        # Tuned per call site: "medium" where a harder judgment call
        # measurably benefited from it (classify_all_steps_coverage - see
        # its own comment), "low" everywhere else that's either simple
        # classification or has its own deterministic guardrail layer
        # backing it up.
        generation_config["thinkingConfig"] = {"thinkingLevel": thinking_level}
    payload = {"contents": contents, "generationConfig": generation_config}
    if system_instruction:
        payload["systemInstruction"] = {"parts": [{"text": system_instruction}]}

    # Input size, not output - what we send, to correlate a slow/timed-out
    # call with how much the model had to read. Logged on failure only, so
    # this costs nothing on the normal path.
    content_chars = sum(len(m.get("content", "")) for m in messages)

    # One deadline for the whole logical call, primary + hedge/retry. A
    # second attempt gets only what's left of the budget rather than a
    # fresh full one - otherwise a hedge fired at _HEDGE_DELAY_SECONDS
    # stretched one call to ~48s on a 30s budget, and with the structural
    # vote's sequential 3rd call on top, a single request could approach
    # two minutes on a slow host.
    deadline = time.monotonic() + budget

    def _attempt(attempt_num: int) -> str:
        # Acquired before the real network call (both a primary attempt
        # and a hedge) so total concurrent model calls process-wide never
        # exceeds the proven-safe ceiling - see _concurrency_semaphore's
        # own comment. t0 starts only once the slot is actually held, so
        # the elapsed time logged below reflects the real call's own
        # latency, not time spent queued for a slot.
        with _concurrency_semaphore:
            t0 = time.monotonic()
            attempt_timeout = budget if attempt_num == 1 else max(1.0, deadline - t0)
            try:
                response = _post(url, json=payload, headers=headers, timeout=attempt_timeout)
                response.raise_for_status()
                data = response.json()
                candidates = data.get("candidates") or []
                if not candidates:
                    block_reason = (data.get("promptFeedback") or {}).get("blockReason", "no candidates returned")
                    raise LLMUnavailableError(f"Gemini returned no candidates ({block_reason})")
                parts = candidates[0].get("content", {}).get("parts") or []
                text = "".join(p.get("text", "") for p in parts)
                if not text:
                    raise LLMUnavailableError(
                        f"Gemini candidate had no text (finishReason={candidates[0].get('finishReason')})"
                    )
                return _strip_markdown_fence(text)
            except httpx.HTTPError as exc:
                elapsed = time.monotonic() - t0
                log.warning(
                    "%s failed after %.1fs on attempt %d (budget %.0fs, input %d chars, model %s): %s",
                    call_name, elapsed, attempt_num, attempt_timeout, content_chars, config.GEMINI_MODEL, exc,
                )
                # A 4xx (bad key, bad request, 429 quota exhausted) will
                # fail the same way on an immediate second attempt - and a
                # 429 retry only adds load to the exhausted quota. Raised as
                # LLMUnavailableError so it's final, never hedged/retried.
                # 408 is a timeout, retried like any other stall.
                if isinstance(exc, httpx.HTTPStatusError):
                    status = exc.response.status_code
                    if 400 <= status < 500 and status != 408:
                        raise LLMUnavailableError(f"Gemini call failed: {exc}") from exc
                raise
            except (KeyError, IndexError, ValueError) as exc:
                # Not retried/hedged - a response DID come back, just not
                # shaped as expected. Reattempting the identical request
                # would just reproduce the same malformed response, unlike
                # a genuine network-level failure or stall.
                raise LLMUnavailableError(f"Gemini call failed: {exc}") from exc

    # Not a `with` block on purpose: Executor.__exit__ calls
    # shutdown(wait=True), which would block the winning, fast attempt's
    # return on the losing, still-running one finishing too - exactly
    # defeating the point of hedging. shutdown(wait=False) below lets a
    # winning result return immediately; the loser's thread simply runs
    # to its own natural end (bounded by its own httpx timeout) and is
    # discarded.
    racer = ThreadPoolExecutor(max_workers=2, thread_name_prefix="gemini-hedge")
    try:
        pending = {racer.submit(_attempt, 1)}
        attempts_started = 1
        last_exc: Exception | None = None

        # Give attempt 1 a head start up to the hedge delay before deciding
        # whether to hedge - most calls finish well within this and never
        # trigger a second attempt at all.
        done, pending = wait(pending, timeout=_HEDGE_DELAY_SECONDS)
        if not done:
            pending.add(racer.submit(_attempt, 2))
            attempts_started = 2
        else:
            for fut in done:
                try:
                    return fut.result()
                except LLMUnavailableError as exc:
                    last_exc = exc  # malformed response or 4xx - final, no hedge
                except httpx.HTTPError as exc:
                    last_exc = exc
                    if attempts_started < 2:
                        pending.add(racer.submit(_attempt, 2))
                        attempts_started = 2

        while pending:
            done, pending = wait(pending, return_when=FIRST_COMPLETED)
            for fut in done:
                try:
                    return fut.result()
                except (LLMUnavailableError, httpx.HTTPError) as exc:
                    last_exc = exc
    finally:
        racer.shutdown(wait=False)

    log.error(
        "%s failed after exhausting all attempts (budget %.0fs, input %d chars, model %s): %s",
        call_name, budget, content_chars, config.GEMINI_MODEL, last_exc,
    )
    raise LLMUnavailableError(f"Gemini call failed: {last_exc}") from last_exc
