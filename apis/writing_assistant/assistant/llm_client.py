"""MiniMax chat-completions client. Mirrors the OpenAI-compatible
request/response shape already used against this same self-hosted model
elsewhere in this repo (ai/ajrasakha/agents/config.py's
get_minimax_chat_model, apis/ans_gen_pop/llm_client.py).

Every call goes through _chat_completion() - the one seam tests monkeypatch
so no automated test ever makes a real network call.
"""

import json
import logging
import re
import time
from urllib.parse import urlparse

import httpx

from . import config, text_checks
from .models import LLMUnavailableError, StepCoverage

log = logging.getLogger("writing_assistant.llm_client")

# The self-hosted reasoning model sometimes wraps its answer in a markdown
# code fence even when the prompt asks for plain JSON or plain text -
# live-confirmed (a real classify_step_coverage response broke json.loads
# with "Expecting value: line 3 column 1", the exact signature of
# content starting "\n\n```json\n{...}"). M3 (public API) never needed
# this. Anchored to the WHOLE response (after trimming whitespace) on
# purpose - a fence wrapping only part of the content is a different,
# unconfirmed failure shape, not this one, and a loose match risks
# silently mangling a legitimate answer that merely contains backticks.
_MARKDOWN_FENCE_RE = re.compile(r"^```(?:json)?\s*\n?(.*?)\n?```$", re.DOTALL)


def _strip_markdown_fence(content: str) -> str:
    match = _MARKDOWN_FENCE_RE.match(content.strip())
    return match.group(1).strip() if match else content


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
    verifies its own output - that is the separate guardrail's job.

    Rewrites one section at a time (text_checks.split_sections), not the
    whole draft in one call - live-confirmed the whole-document version
    reliably stalls/times out on the self-hosted model for certain drafts
    (the identical draft failed the identical way twice in separate
    requests, ruling out random bad luck), while short, narrowly-scoped
    calls (e.g. classify_step_coverage) run fine. A section whose own call
    fails falls back to its original, unrewritten text - safe by
    construction (identical text can't introduce a technical-content
    change) and lets the rest of the document still get polished. Only
    raises if every section fails."""
    sections = text_checks.split_sections(draft_text)
    polished_sections = []
    failures = 0
    for i, section in enumerate(sections, start=1):
        messages = [
            {"role": "system", "content": _POLISH_SYSTEM_PROMPT},
            {"role": "user", "content": section},
        ]
        try:
            content = _chat_completion(
                messages, temperature=0.0, call_name=f"generate_polish[section {i}]",
                timeout=config.MINIMAX_POLISH_TIMEOUT_SECONDS,
            )
            polished_sections.append(content.strip())
        except LLMUnavailableError as exc:
            log.warning("polishing section %d failed, keeping it unchanged: %s", i, exc)
            polished_sections.append(section)
            failures += 1
    if failures == len(sections):
        raise LLMUnavailableError(f"MiniMax call failed for every section ({failures}/{len(sections)})")
    return "\n\n".join(polished_sections)


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
    content = _chat_completion(
        messages, temperature=0.0, call_name="check_meaning_preserved", timeout=config.MINIMAX_POLISH_TIMEOUT_SECONDS
    )
    try:
        parsed = json.loads(content)
        return bool(parsed["changed"]), str(parsed.get("explanation", ""))
    except (json.JSONDecodeError, KeyError, TypeError) as exc:
        raise LLMUnavailableError(f"Could not parse semantic-check response: {exc}") from exc


_STEP_COVERAGE_SYSTEM_PROMPT = (
    "You check whether a farmer-facing draft answer covers one specific "
    "expected step from a fixed checklist every draft is scored against. "
    "The draft is given as a numbered list of sections. You are also "
    "given the full ordered list of every other expected step, for "
    "context only - credit THIS step only for content that is distinctly "
    "about its own topic, never for content that is more specifically a "
    "different listed step's topic - even when the two are related by "
    "the same underlying narrative (e.g. severity and a decision-to-"
    "escalate step both discuss how bad the problem is getting, but a "
    "decision step still needs its own explicit decision/threshold "
    "content, not just the severity step's description of the problem "
    "worsening). A step late in the list (e.g. a closing summary/"
    "conclusion step) must not be credited just because the draft's "
    "earlier sections already cover the facts it would summarize - a "
    "summary step needs the draft to actually tie them together, not "
    "merely contain them elsewhere. The test is structural, not just "
    "factual: a fact belonging to this step being true somewhere in the "
    "draft is not enough by itself - the draft needs its own distinct "
    "portion (a sentence, bullet, or section) whose purpose is "
    "addressing this step. A passing mention of this step's topic inside "
    "a different section whose own main purpose is something else (e.g. "
    "the opening introduction briefly restating a fact that the real "
    "expected step is supposed to establish) is missing for this step, "
    "not covered - crediting it would mean the author never had to write "
    "this step at all. Recognize equivalent wording - do not require "
    "exact keyword matches. If the draft has no sentence or heading "
    "distinctly about this step's own topic, respond missing - do not "
    "give partial credit just because a different section's content is "
    "thematically related (e.g. a section about chemical control does "
    "not cover a missing decision-point step just because both concern "
    "treatment). "
    "Judge by the actual content under a heading, never by the heading's "
    "label alone - a section heading matching this step's name proves "
    "nothing by itself. A heading with no real content beneath it (blank, "
    "placeholder, or only whitespace) is missing, not covered. Content "
    "that is gibberish, nonsensical, or does not meaningfully address any "
    "real topic is also missing, however long it is. If a section's "
    "actual content clearly belongs to a DIFFERENT step than the heading "
    "suggests (e.g. a 'Conclusion' heading whose text is really "
    "introductory background, or an 'Introduction' heading whose text is "
    "really a closing summary), that mislabeled content does not satisfy "
    "this step - only real content that actually serves this step's own "
    "purpose counts, regardless of what heading the author gave it. "
    "You are also given the actual question this draft is answering - if "
    "the draft is clearly about a different subject (a different named "
    "pest, disease, crop, or topic than the question asks about), "
    "respond missing for every step regardless of how generically similar "
    "the draft's wording sounds (e.g. generic-sounding 'use cultural "
    "measures like spacing and drainage' does not satisfy a step if the "
    "draft is actually about a different pest than the question is "
    "about). Respond only with a JSON object of "
    'this exact shape: {"coverage": "covered" or "partial" or "missing", '
    '"section_index": <the 1-based section number that primarily '
    "addresses THIS step specifically, or null if coverage is "
    '"missing">}. "covered" means the draft clearly addresses this '
    'step\'s own topic, with real, substantive content (even in '
    'different words). "partial" means the draft touches on it but '
    "leaves out part of what the step/example describes. \"missing\" "
    "means the draft does not address this step's own topic at all - "
    "including a blank heading, gibberish, or content that actually "
    "belongs to a different step."
)


def classify_step_coverage(
    draft_text: str,
    step_description: str,
    example: str,
    all_step_descriptions: list[str] | None = None,
    question: str | None = None,
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

    question (the actual question this draft is answering) lets the
    model reject generic-sounding content when the draft is actually
    about a different pest/disease/crop than the question asks about -
    confirmed live that a pest question's answer was credited by an
    unrelated disease's draft almost in full, since "use cultural
    measures" reads as plausible for any pest/disease in isolation
    (Revision 16, ISS-10)."""
    sections = text_checks.split_sections(draft_text)
    numbered_draft = "\n\n".join(f"[{i}] {s}" for i, s in enumerate(sections, start=1))
    payload = {"draft": numbered_draft, "expected_step": step_description, "example_of_what_satisfies_it": example}
    if all_step_descriptions:
        payload["all_expected_steps_in_order_for_context_only"] = all_step_descriptions
    if question:
        payload["the_question_this_draft_is_answering"] = question
    user_content = json.dumps(payload)
    messages = [
        {"role": "system", "content": _STEP_COVERAGE_SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]
    # step_description folded into call_name (not just "classify_step_coverage")
    # so a timeout/failure log line says which expected step stalled - a
    # live, reproducible stall on one draft needs this to tell "always the
    # same step" apart from "any step, just unlucky" (see config.py's
    # MINIMAX_COVERAGE_TIMEOUT_SECONDS comment).
    content = _chat_completion(
        messages,
        temperature=0.0,
        call_name=f"classify_step_coverage[{step_description[:40]}]",
        timeout=config.MINIMAX_COVERAGE_TIMEOUT_SECONDS,
    )
    try:
        parsed = json.loads(content)
        coverage = StepCoverage(parsed["coverage"])
        section_index = parsed.get("section_index")
        return coverage, int(section_index) if section_index is not None else None
    except (json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
        raise LLMUnavailableError(f"Could not parse step-coverage response: {exc}") from exc


def _chat_completion(messages: list[dict], call_name: str = "unknown", timeout: float | None = None, **kwargs) -> str:
    if not config.MINIMAX_BASE_URL:
        raise LLMUnavailableError("MINIMAX_BASE_URL is not set")

    budget = timeout if timeout is not None else config.MINIMAX_TIMEOUT_SECONDS
    url = config.MINIMAX_BASE_URL.rstrip("/") + config.MINIMAX_CHAT_PATH
    headers = {"Content-Type": "application/json"}
    if config.MINIMAX_API_KEY:
        headers["Authorization"] = f"Bearer {config.MINIMAX_API_KEY}"

    payload = {"model": config.MINIMAX_MODEL, "messages": messages, "seed": config.MINIMAX_SEED, **kwargs}
    needs_proxy = config.MINIMAX_USE_TAILNET_PROXY and _is_tailnet_host(
        urlparse(config.MINIMAX_BASE_URL).hostname or ""
    )
    proxy = _TAILNET_SOCKS_PROXY if needs_proxy else None
    # Input size, not output - what we send, to correlate a slow/timed-out
    # call with how much the model had to read. Logged on failure only, so
    # this costs nothing on the normal path.
    content_chars = sum(len(m.get("content", "")) for m in messages)

    # The self-hosted reasoning model occasionally over-thinks a prompt and
    # stalls for the full timeout before failing - live-confirmed (not a
    # connectivity problem, the same request succeeds normally on a retry).
    # With the 20s budget tuned for its typical 2-7s latency, and a full
    # /polish-draft request making ~25-30 sequential calls (step coverage
    # alone is 3x-voted per step), one retry on a genuine network-level
    # failure meaningfully cuts how often a single rare stall turns an
    # otherwise-good request into not_assessed/unavailable - without
    # weakening the majority vote or raising the per-call budget back up.
    # Scoped to httpx.HTTPError only: a KeyError/IndexError/ValueError means
    # a response DID come back, just not shaped as expected - retrying the
    # identical request won't fix a parsing problem, only reattempting a
    # genuinely failed/timed-out one is worth it.
    last_exc: Exception | None = None
    for attempt in range(2):
        t0 = time.monotonic()
        try:
            response = httpx.post(
                url, json=payload, headers=headers, timeout=budget, proxy=proxy
            )
            response.raise_for_status()
            data = response.json()
            # MiniMax's own official API reports some failures via base_resp
            # inside an HTTP 200 rather than an HTTP error status (confirmed
            # by a live probe against the real API) - the self-hosted/
            # OpenAI-compatible path doesn't send this field at all, hence
            # .get().
            base_resp = data.get("base_resp")
            if base_resp and base_resp.get("status_code") not in (None, 0):
                raise LLMUnavailableError(f"MiniMax reported an error: {base_resp}")
            return _strip_markdown_fence(data["choices"][0]["message"]["content"])
        except httpx.HTTPError as exc:
            last_exc = exc
            elapsed = time.monotonic() - t0
            if attempt == 0:
                log.warning(
                    "%s failed after %.1fs on attempt 1/2 (budget %.0fs, input %d chars, model %s): %s - retrying once",
                    call_name, elapsed, budget, content_chars, config.MINIMAX_MODEL, exc,
                )
                continue
            log.error(
                "%s failed after %.1fs on attempt 2/2 (budget %.0fs, input %d chars, model %s): %s",
                call_name, elapsed, budget, content_chars, config.MINIMAX_MODEL, exc,
            )
        except (KeyError, IndexError, ValueError) as exc:
            # Not retried - see the comment above the loop.
            elapsed = time.monotonic() - t0
            log.error(
                "%s got a malformed response after %.1fs (budget %.0fs, input %d chars, model %s): %s",
                call_name, elapsed, budget, content_chars, config.MINIMAX_MODEL, exc,
            )
            raise LLMUnavailableError(f"MiniMax call failed: {exc}") from exc

    raise LLMUnavailableError(f"MiniMax call failed: {last_exc}") from last_exc
