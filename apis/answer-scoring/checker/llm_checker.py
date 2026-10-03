"""Model-based answer quality checks (MiniMax).

Two separate calls, so one failing doesn't lose the other:
- coverage: answer_structure, sequence, query_properly_answered
- context: contextuality, private_product_name, local_name_mismatch
"""

from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import Any

from chem_checker import BANNED_CHEMICALS, RESTRICTED_CHEMICALS
from llm_client import MINIMAX_MODEL, LLMCallFailed, call_llm
from local_names import detect_local_name_mismatch, find_local_name_records, get_relevant_names
from normalizer import AnswerContext, normalize_answer
from result_state import (
    FAIL,
    NOT_EVALUATED,
    PASS,
    check_result,
    error_result,
    not_applicable_result,
)


USE_MOCK_LLM = os.getenv("USE_MOCK_LLM", "false").strip().casefold() in {
    "1", "true", "yes", "on"
}
PROJECT_DIRECTORY = Path(__file__).resolve().parent.parent
ANSWER_TEMPLATES_PATH = PROJECT_DIRECTORY / "data" / "quality_answer_templates.json"
with ANSWER_TEMPLATES_PATH.open(encoding="utf-8") as template_source:
    ANSWER_TEMPLATES: dict[str, dict[str, Any]] = json.load(template_source)


# Keyword checks that back up the model's verdicts.

_DOSE_MENTION_PATTERN = re.compile(
    r"\d+(?:\.\d+)?\s*%?\s*(?:ml|kg|gm?|litres?|liters?|l)\b", re.IGNORECASE
)
_PHI_MENTION_PATTERN = re.compile(r"\bphi\b|pre[- ]harvest\s+interval", re.IGNORECASE)
_APPLICATION_METHOD_KEYWORDS = (
    "spray", "drench", "broadcast", "foliar", "soil application",
    "seed treatment", "dusting", "fumigation", "drip", "fertigation",
)


def _core_technical_signals(answer_text: str) -> dict[str, bool]:
    """Whether the answer mentions a dose, a PHI and an application method."""
    lowered = answer_text.casefold()
    return {
        "dose_or_quantity_mentioned": bool(_DOSE_MENTION_PATTERN.search(answer_text)),
        "phi_mentioned": bool(_PHI_MENTION_PATTERN.search(answer_text)),
        "application_method_mentioned": any(
            keyword in lowered for keyword in _APPLICATION_METHOD_KEYWORDS
        ),
    }


_IDENTIFICATION_MARKER_WORDS = (
    "identify", "identification", "symptom", "affected", "infestation",
    "infested", "damage caused", "signs of", "diagnos",
)


def _dose_precedes_identification(answer_text: str) -> bool:
    """True if a dose appears before any symptom/identification wording. Not used."""
    dose_match = _DOSE_MENTION_PATTERN.search(answer_text)
    if not dose_match:
        return False
    lowered = answer_text.casefold()
    marker_positions = [
        lowered.find(marker) for marker in _IDENTIFICATION_MARKER_WORDS
        if marker in lowered
    ]
    if not marker_positions:
        return False
    return dose_match.start() < min(marker_positions)


def _crop_mentioned_in_text(crop: str, text: str) -> bool:
    crop = (crop or "").strip()
    if not crop:
        return True  # nothing to check against -- don't flag a false conflict
    return crop.casefold() in (text or "").casefold()


_SIGNAL_TO_KEYWORDS = {
    "dose_or_quantity_mentioned": ("dose", "dosage", "quantity", "rate"),
    "phi_mentioned": ("phi", "pre-harvest", "pre harvest"),
    "application_method_mentioned": ("application method", "method of application", "how to apply", "spray"),
}


def _flag_query_answered_contradictions(
    coverage: dict[str, Any], answer_text: str
) -> None:
    """Add a note when the model says a part was answered but the keyword check finds no such term."""
    qpa = coverage.get("query_properly_answered")
    # a successful model response has no "execution" key, so go by status
    if not qpa or qpa.get("status") not in (PASS, FAIL):
        return
    detected = _core_technical_signals(answer_text)
    parts_answered_text = " ".join(str(p) for p in qpa.get("parts_answered") or []).casefold()
    for signal_key, keywords in _SIGNAL_TO_KEYWORDS.items():
        if detected.get(signal_key):
            continue  # the term genuinely appears -- no contradiction possible
        # word boundary, so "phi" doesn't match inside "aphid"
        if any(
            re.search(rf"\b{re.escape(keyword)}\b", parts_answered_text)
            for keyword in keywords
        ):
            qpa["detail"] += (
                " (Flagged for review: the model marked a part involving "
                f"'{signal_key.replace('_mentioned', '').replace('_', ' ')}' as answered, "
                "but no such term appears anywhere in the answer text -- verify this is correct.)"
            )
            return  # one flag is enough; avoid a wall of repeated notes


GENERIC_CHEMICAL_NAMES_PATH = PROJECT_DIRECTORY / "data" / "quality_generic_chemical_names.json"
with GENERIC_CHEMICAL_NAMES_PATH.open(encoding="utf-8") as generic_names_source:
    _CIBRC_GENERIC_NAMES: list[str] = json.load(generic_names_source)["names"]

# CIBRC list plus our banned/restricted names (a few are spelled differently)
_GENERIC_CHEMICAL_NAMES = {
    chemical["name"].casefold() for chemical in (*BANNED_CHEMICALS, *RESTRICTED_CHEMICALS)
} | {name.casefold() for name in _CIBRC_GENERIC_NAMES}


def _matches_known_generic_chemical(name: str) -> bool:
    """True if the flagged 'private product name' is really a generic chemical name."""
    # the model sometimes returns a list here instead of a string
    normalized = str(name or "").strip().casefold()
    if not normalized:
        return False
    return any(
        generic_name in normalized or normalized in generic_name
        for generic_name in _GENERIC_CHEMICAL_NAMES
    )

COVERAGE_CHECK_NAMES = (
    "answer_structure",
    "sequence",
    "query_properly_answered",
)
CONTEXT_CHECK_NAMES = (
    "contextuality",
    "private_product_name",
    "local_name_mismatch",
)
CHECK_NAMES = COVERAGE_CHECK_NAMES + CONTEXT_CHECK_NAMES


MOCK_COVERAGE_RESPONSE: dict[str, Any] = {
    "answer_structure": check_result(PASS, "Mock LLM check passed"),
    "sequence": check_result(PASS, "Mock LLM check passed"),
    "query_properly_answered": {
        **check_result(PASS, "Mock LLM check passed"),
        "parts_asked": [], "parts_answered": [], "missing": []
    },
}
MOCK_CONTEXT_RESPONSE: dict[str, Any] = {
    "contextuality": {
        **check_result(PASS, "Mock LLM check passed"),
        "expected": "Mock expected crop/topic",
        "found": "Mock found crop/topic",
    },
    "private_product_name": {
        **check_result(PASS, "Mock LLM check passed"), "found": None
    },
    "local_name_mismatch": {
        **check_result(PASS, "Mock LLM check passed"),
        "expected": None,
        "found": None,
        "evidence": None,
    },
}
MOCK_RESPONSE: dict[str, Any] = {**MOCK_COVERAGE_RESPONSE, **MOCK_CONTEXT_RESPONSE}


# cut very long answers so the prompt stays small (p99 answer is ~15.7k chars)
MAX_ANSWER_CHARS_FOR_PROMPT = 16000


def _truncate_answer_text(answer_text: str) -> str:
    return answer_text[:MAX_ANSWER_CHARS_FOR_PROMPT]


def _blank_coverage_result(detail: str) -> dict[str, Any]:
    """An empty answer fails every coverage check, no model call needed."""
    extra_fields = {
        "query_properly_answered": {"parts_asked": [], "parts_answered": [], "missing": []},
    }
    return {
        name: {**check_result(FAIL, detail), **extra_fields.get(name, {})}
        for name in COVERAGE_CHECK_NAMES
    }


def _blank_context_result(detail: str) -> dict[str, Any]:
    """An empty answer fails contextuality; the other two have nothing to flag, so they pass."""
    return {
        "contextuality": {**check_result(FAIL, detail), "expected": "", "found": ""},
        "private_product_name": {
            **check_result(PASS, "No answer text, so no product name is possible"),
            "found": None,
        },
        "local_name_mismatch": {
            **check_result(PASS, "No answer text, so no local name usage is possible"),
            "expected": None, "found": None, "evidence": None,
        },
    }


logger = logging.getLogger(__name__)


def _model_failure_detail(what: str, exc: Exception) -> str:
    """Detail text for a failed model call, with the real reason (keeps the
    phrase "model call failed", which _group_errored() looks for)."""
    reason = str(exc).strip()[:200]
    logger.warning("%s: model call failed after every retry: %s", what, reason or "(no detail)")
    suffix = f": {reason}" if reason else ""
    return f"{what} could not be evaluated because the model call failed{suffix}"


def _group_failure(check_names: tuple[str, ...], detail: str) -> dict[str, Any]:
    extra_fields = {
        "query_properly_answered": {"parts_asked": [], "parts_answered": [], "missing": []},
        "contextuality": {"expected": "", "found": ""},
        "private_product_name": {"found": None},
        "local_name_mismatch": {"expected": None, "found": None, "evidence": None},
    }
    return {
        name: {**error_result(detail), **extra_fields.get(name, {})}
        for name in check_names
    }


def build_coverage_prompt(
    question_text: str,
    answer_text: str,
    crop: str,
    state: str,
    question_type: str | None,
    answer_template: dict[str, Any] | None,
) -> str:
    """Prompt for answer_structure, sequence and query_properly_answered."""
    # signals come from the full text, only the prompt copy is truncated
    detected_signals = _core_technical_signals(answer_text)
    return f"""You are checking an agricultural answer for quality.

Question: {question_text}
Answer: {_truncate_answer_text(answer_text)}
Crop: {crop}
State: {state}
Question type: {question_type or "unknown"}
Complete answer template reference: {json.dumps(answer_template, ensure_ascii=False)}
Keyword-detected in the answer text (established facts, not your own
judgment call -- use them, don't re-derive them): {json.dumps(detected_signals)}

Evaluate these 3 checks and return ONLY valid JSON with no other text.
Use status PASS, FAIL, or NOT_EVALUATED.

For answer_structure, use the complete applicable template: source_sheet,
ordered_steps, optional sections, and conditional_branches as a reference for
what content and organization a strong answer typically has, not as a literal
heading or numbering script the answer must reproduce. PASS whenever the
answer's own headings or prose substantively cover the same ground in a
sensible grouping, even under different section names or without the
template's exact sub-numbering (no separate "4.1"/"4.2"-style split is
required). FAIL only when necessary content is genuinely missing or jumbled
together in a way that would confuse a farmer acting on it, never merely
because the answer is organized differently than the template. Apply a
conditional branch only when its condition or variant is relevant to the
question and answer, and never require every optional section or every
cultural-practice sub-item for a question that only asks about one specific
pest, disease, or decision.

For sequence, judge only whether the answer's ideas progress in a logical
order for someone about to act on it (problem/identification before severity
or decision criteria, before recommended treatment or application steps),
using the template's ordered_steps as a guide to what a sensible order looks
like, not as a required checklist. FAIL only when the actual order would
confuse or mislead a farmer, such as dosage appearing before what it treats
is identified, or severe- and mild-case guidance mixed together without
distinction. Do not fail sequence merely because a section is omitted or the
template's literal step numbering is not matched; that is answer_structure's
and query_properly_answered's concern, not sequence's, so do not fail both
answer_structure and sequence for the same missing-content reason.

For query_properly_answered, first decompose the question into every distinct
requested component, including dosage, method/application procedure, timing,
symptoms, management/control, varieties, or other explicitly requested parts.
Then also add any core technical element the applicable template implies a
complete answer needs -- dosage, PHI, formulation, application method/timing --
even when the question's own wording didn't explicitly ask for it, but only
when that element is actually relevant to what the question asks; do not
demand the entire template for a narrow question, and do not demand every
optional or cultural-practice sub-item (e.g. every item among crop rotation,
tillage, mulching, spacing, raised-bed planting) unless the question itself
is broad enough to need that full enumeration. When judging whether dosage,
PHI, or application method were addressed, trust the keyword-detected
signals above for whether the term appears at all -- your own job is only
to judge whether its presence is substantive and correct in context, not to
re-scan for the term yourself. Check whether each resulting part is
substantively addressed without requiring exact wording, and populate
parts_asked, parts_answered, and missing explicitly. Do not claim
that any dose, PHI, calculation, formulation, application, or agricultural
recommendation is factually correct unless authoritative reference data for
that fact is supplied. This prompt supplies structure and terminology
references, not authoritative agronomic correctness data. Therefore assess
presence/completeness only, never technical correctness.

The template's "example" and "guidance" fields on each step illustrate what
that step typically covers (format, level of detail, review conventions such
as "prescribe multiple chemicals with different modes of action" or "confirm
the chemical is not banned"). Use them only to judge whether the answer's
step covers the right kind of content and follows the stated conventions.
Never use their specific doses, PHI values, or chemical names as the
authoritative correct value for this answer's crop/state/pest combination.

Return this schema:
{{
  "answer_structure": {{"status": "PASS", "detail": "reason"}},
  "sequence": {{"status": "PASS", "detail": "reason"}},
  "query_properly_answered": {{
    "status": "PASS", "detail": "reason",
    "parts_asked": [], "parts_answered": [], "missing": []
  }}
}}

The first character of your response must be {{ and the last character must be }}.
Do not use Markdown or code fences. Do not include analysis or reasoning."""


def build_context_prompt(
    question_text: str,
    answer_text: str,
    crop: str,
    state: str,
    local_names: list[dict[str, Any]],
    used_local_names: list[dict[str, Any]],
) -> str:
    """Prompt for contextuality, private_product_name and local_name_mismatch."""
    return f"""You are checking an agricultural answer for quality.

Question: {question_text}
Answer: {_truncate_answer_text(answer_text)}
Crop: {crop}
State: {state}
Relevant structured local-name references: {json.dumps(local_names, ensure_ascii=False)}
Recognized local names used in the answer: {json.dumps(used_local_names, ensure_ascii=False)}

Evaluate these 3 checks and return ONLY valid JSON with no other text.
Use status PASS, FAIL, or NOT_EVALUATED.

For contextuality, be conservative about generic regional context: FAIL only
when the answer's crop/topic clearly does not match the question's.

For private_product_name, identify private product names only as possible
commercial brands, not registry-verified facts.

For local_name_mismatch, do not fail merely because no local name is used.
Only fail it when a documented local name is used incorrectly for the
available state/crop/category context.

Return this schema:
{{
  "contextuality": {{
    "status": "PASS", "detail": "reason",
    "expected": "crop/topic from question", "found": "crop/topic in answer"
  }},
  "private_product_name": {{"status": "PASS", "detail": "reason", "found": null}},
  "local_name_mismatch": {{
    "status": "PASS", "detail": "reason",
    "expected": null, "found": null, "evidence": null
  }}
}}

The first character of your response must be {{ and the last character must be }}.
Do not use Markdown or code fences. Do not include analysis or reasoning."""


def detect_question_type(question_text: str) -> str | None:
    """Classify a question using the configured keyword precedence."""
    normalized = question_text.casefold()
    keyword_groups = (
        ("disease", ("disease", "blight", "rot", "wilt")),
        ("pest", (
            "pest", "insect", "borer", "worm", "termite", "mealybug",
            "aphid", "grub", "infestation", "infest",
        )),
        ("fertilizer", ("fertilizer", "nutrient", "npk")),
        ("variety", ("variet", "seed", "cultivar")),
        ("weed", ("weed", "herbicide")),
        ("irrigation", (
            "irrigation", "irrigate", "drip", "sprinkler", "watering",
            "water management", "water schedule",
        )),
    )
    for question_type, keywords in keyword_groups:
        if any(keyword in normalized for keyword in keywords):
            return question_type
    # domains from the answer structure workbook, checked after the ones above
    # (specific before generic, e.g. "cold storage" before "storage")
    for question_type, pattern in _DOMAIN_PATTERNS:
        if pattern.search(normalized):
            return question_type
    return None


# word boundaries so "cowpea" doesn't match "cow" and "respond" doesn't match "pond"
_DOMAIN_PATTERNS = tuple(
    (name, re.compile(pattern))
    for name, pattern in (
        # credit and schemes first, they win over machinery/livestock/fish
        ("credit", r"\bloans?\b|kisan credit|\bkcc\b|insurance|\bpmfby\b|\bcredit\b|interest rate|\bnabard\b"),
        ("schemes", r"\bschemes?\b|subsid|\byojana|pm-? ?kisan|\bpmksy\b|financial assistance|financial support|\bgrants?\b|compensation"),
        ("fisheries", r"\bfish|aquaculture|\bprawn|\bshrimp|fingerling"),
        ("livestock", r"\bcattle\b|\bbuffalo|\bgoats?\b|\bsheep\b|poultry|\bdairy\b|livestock|\bcows?\b|\bmilch\b|veterinar|animal husbandry|piggery"),
        ("allied", r"beekeeping|apiculture|honey ?bee|mushroom|sericulture|agroforestry|\bbiogas\b"),
        ("organic", r"\borganic|natural farming|jeevamrut|beejamrit|zero budget|panchagavya|bio-?fertili[sz]er|vermicompost"),
        ("mechanisation", r"\btractor|\bmachine|mechani[sz]|\bimplements?\b|happy seeder|rotavator|\bharvester|\bthresher|seed drill|\bdrones?\b|power tiller|custom hiring"),
        ("market", r"\bmsp\b|minimum support price|\bmandi|market price|marketing|procurement|\be-?nam\b|selling price"),
        ("infrastructure", r"infrastructure|warehouse|godown|cold storage|market yard|rural road|cold chain"),
        # no plain "drying", it matches leaf-drying symptom questions
        ("postharvest", r"post-?harvest|\bstorage\b|shelf life|\bgrading\b|packaging|\bcuring\b|value addition"),
        ("climate", r"\bfrost|drought|heat stress|heat ?wave|\bhail|\bflood|waterlogg|cold wave|\bweather|climate|temperature|cyclone|monsoon"),
        ("extension", r"\btraining\b|\bkvk\b|krishi vigyan|extension|farmer group|\bfpo\b|farmer producer|helpline|awareness|demonstration|kisan call"),
        ("cultural", r"\bsowing|\bspacing|transplant|\bplanting|crop rotation|intercrop|\bpruning|land preparation|mulching|\bnursery|seed ?bed|\bharvesting|plant population"),
    )
)


def _valid_group_response(result: Any, check_names: tuple[str, ...]) -> bool:
    if not isinstance(result, dict) or set(result) != set(check_names):
        return False
    return all(
        isinstance(result[name], dict)
        and result[name].get("status") in {PASS, FAIL, NOT_EVALUATED}
        and isinstance(result[name].get("detail"), str)
        for name in check_names
    )


def _with_pass_field(result: dict[str, Any]) -> dict[str, Any]:
    for check in result.values():
        check["pass"] = (
            True if check["status"] == PASS
            else False if check["status"] == FAIL
            else None
        )
    return result


def run_coverage_checks(
    question_text: str,
    answer_text: str,
    crop: str,
    state: str,
    question_type: str | None,
    answer_template: dict[str, Any] | None,
) -> dict[str, Any]:
    """Run the coverage checks as one model call."""
    if not answer_text.strip():
        return _blank_coverage_result("Answer text is empty; nothing to evaluate")
    if USE_MOCK_LLM:
        return json.loads(json.dumps(MOCK_COVERAGE_RESPONSE))
    prompt = build_coverage_prompt(
        question_text, answer_text, crop, state, question_type, answer_template
    )
    try:
        result = call_llm(
            prompt,
            lambda parsed: _valid_group_response(parsed, COVERAGE_CHECK_NAMES),
        )
    except LLMCallFailed as exc:
        return _group_failure(
            COVERAGE_CHECK_NAMES, _model_failure_detail("Coverage checks", exc)
        )
    result = _with_pass_field(result)
    _flag_query_answered_contradictions(result, answer_text)
    return result


def run_context_checks(
    question_text: str,
    answer_text: str,
    crop: str,
    state: str,
    local_names: list[dict[str, Any]],
    used_local_names: list[dict[str, Any]],
) -> dict[str, Any]:
    """Run the context checks as one model call."""
    if not answer_text.strip():
        return _blank_context_result("Answer text is empty; nothing to evaluate")
    if USE_MOCK_LLM:
        return json.loads(json.dumps(MOCK_CONTEXT_RESPONSE))
    prompt = build_context_prompt(
        question_text, answer_text, crop, state, local_names, used_local_names
    )
    try:
        result = call_llm(
            prompt,
            lambda parsed: _valid_group_response(parsed, CONTEXT_CHECK_NAMES),
        )
    except LLMCallFailed as exc:
        return _group_failure(
            CONTEXT_CHECK_NAMES, _model_failure_detail("Context checks", exc)
        )
    return _with_pass_field(result)


def _group_errored(group_result: dict[str, Any], representative_check: str) -> bool:
    """Whether this group's model call failed (all its checks share the same detail)."""
    return "model call failed" in group_result[representative_check]["detail"]


def apply_coverage_overrides(
    coverage: dict[str, Any], question_type: str | None, answer_text: str
) -> dict[str, Any]:
    """Post-process a coverage result (used by both the full run and the retry path).

    A keyword check for required sections was tried here and removed: it
    wrongly failed about half of known-good answers.
    """
    # record which template was used, the generic one is less specific
    template_used = question_type or "general"
    coverage["answer_structure"]["template_used"] = template_used
    coverage["sequence"]["template_used"] = template_used

    # _dose_precedes_identification() is not used: it flagged long
    # multi-topic answers (a dose in one section, symptoms in another)
    return coverage


def apply_context_overrides(
    context_result: dict[str, Any],
    local_names: list[dict[str, Any]],
    used_local_names: list[dict[str, Any]],
    crop: str = "",
    answer_text: str = "",
) -> dict[str, Any]:
    """Post-process a context result that succeeded (never call on an errored group)."""
    if used_local_names:
        # detect_local_name_mismatch() is not used: many crop rows list the
        # English crop name as the "local name", so it flagged too much.
        # Keep the model's verdict until that data is cleaned.
        pass
    elif not local_names:
        context_result["local_name_mismatch"] = not_applicable_result(
            "Cannot evaluate local-name usage because no relevant reference is available",
            found=None,
            expected=None,
            evidence=None,
        )
    else:
        context_result["local_name_mismatch"] = check_result(
            PASS,
            "No recognized local or vernacular name is used in the answer",
            found=None,
            expected=None,
            evidence=None,
        )

    contextuality = context_result["contextuality"]
    if contextuality["status"] == PASS and not _crop_mentioned_in_text(crop, answer_text):
        # the crop name never appears in the answer but the model says it
        # matches: add a note (advisory only, answers can say "this crop")
        contextuality["detail"] += (
            " (Flagged for review: the crop name does not appear verbatim "
            "in the answer text -- verify the topic actually matches.)"
        )

    product = context_result["private_product_name"]
    found_name = product.get("found")
    if found_name and _matches_known_generic_chemical(found_name):
        # a generic chemical name can't be a brand, so override to PASS
        context_result["private_product_name"] = check_result(
            PASS,
            f"'{found_name}' matches a known generic chemical name, not a private brand",
            found=None,
        )

    return context_result


def run_llm_checks(context: AnswerContext) -> dict[str, Any]:
    """Run all six model-based checks as two separate calls."""
    question_type = detect_question_type(context["question_text"])
    # no specific question type: fall back to the generic template
    answer_template = ANSWER_TEMPLATES.get(question_type) if question_type else ANSWER_TEMPLATES.get("general")
    local_names = get_relevant_names(
        context["state"], context["crop"], question_type or ""
    )
    used_local_names = find_local_name_records(context["answer_text"])

    coverage = run_coverage_checks(
        context["question_text"],
        context["answer_text"],
        context["crop"],
        context["state"],
        question_type,
        answer_template,
    )
    context_result = run_context_checks(
        context["question_text"],
        context["answer_text"],
        context["crop"],
        context["state"],
        local_names,
        used_local_names,
    )
    result = {**coverage, **context_result}

    coverage_errored = _group_errored(coverage, "answer_structure")
    context_errored = _group_errored(context_result, "contextuality")
    if coverage_errored or context_errored:
        parts = [
            part
            for part, errored in (("coverage", coverage_errored), ("context", context_errored))
            if errored
        ]
        result["_error"] = f"LLM checks could not be evaluated because the model call failed ({', '.join(parts)})"

    # applies even if the coverage call failed
    result.update(
        apply_coverage_overrides(coverage, question_type, context["answer_text"])
    )
    # only when the context call worked, otherwise keep its ERROR result
    if not context_errored:
        result.update(
            apply_context_overrides(
                context_result, local_names, used_local_names,
                context["crop"], context["answer_text"],
            )
        )
    return result


if __name__ == "__main__":
    context = normalize_answer(
        {
            "question_text": "How can I control aphids in wheat in Punjab?",
            "answer_text": "Inspect wheat regularly and follow locally recommended controls.",
            "crop": "Wheat",
            "state": "Punjab",
        }
    )
    result = run_llm_checks(context)
    print(json.dumps(result, indent=2))
