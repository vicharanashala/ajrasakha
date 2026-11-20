"""Check that an answer has every required section of its defined answer structure.

The model says, for each required section, whether the answer covers it, and quotes the words that do.
The code then checks that each quote is really in the answer. A section counts as present only when its
quote is verified, so an answer cannot pass by the model calling a missing section "implicit".
"""

from __future__ import annotations

import json
import re
from typing import Any

from llm_client import LLMCallFailed, call_llm
from result_state import FAIL, check_result

MIN_QUOTE_CHARS = 12
# when a quote is not word for word in the answer, this share of its longer words must be found close together
FUZZY_SHARE = 0.8
FUZZY_WINDOW_CHARS = 300
MAX_ANSWER_CHARS = 12000
# this step adds to the other checks, so it gives up sooner than they do: a failure here keeps the usual result
MAX_RETRIES = 3
RETRY_DELAYS = (1, 2, 3)


def required_sections(template: dict[str, Any] | None) -> list[str]:
    return list((template or {}).get("required_sections") or [])


def _words(text: str) -> str:
    """Lower case, with markdown marks and punctuation turned into spaces, so a quote and the answer compare."""
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s%.]|_", " ", text.casefold())).strip()


def quote_in_answer(quote: str, answer_text: str) -> bool:
    """True when the quote is in the answer, word for word or very close to it."""
    quote_text, answer = _words(quote), _words(answer_text)
    if len(quote_text) < MIN_QUOTE_CHARS:
        return False
    if quote_text in answer:
        return True
    wanted = [w for w in quote_text.split() if len(w) >= 4]
    if len(wanted) < 3:
        return False
    # slide over the answer: enough of the quote's longer words must sit within one short stretch
    step = FUZZY_WINDOW_CHARS // 3
    for start in range(0, max(1, len(answer) - FUZZY_WINDOW_CHARS // 2), step):
        window = answer[start:start + FUZZY_WINDOW_CHARS]
        if sum(w in window for w in wanted) / len(wanted) >= FUZZY_SHARE:
            return True
    return False


def build_prompt(question_text: str, answer_text: str, question_type: str, sections: list[str], step_titles: list[str]) -> str:
    listed = "\n".join(f"- {name}" for name in sections)
    titles = "\n".join(f"- {title}" for title in step_titles[:14]) or "(none)"
    return f"""You check whether an agricultural answer contains each REQUIRED section of its answer structure.

Question: {question_text}
Type of answer: {question_type}
Answer:
<<<
{answer_text[:MAX_ANSWER_CHARS]}
>>>

REQUIRED sections. Each must be covered in the answer, under any heading or in plain sentences:
{listed}

What a good answer of this type covers, for reference:
{titles}

For every required section:
- "present" is true only if the answer has real content for that section.
- "quote" is the exact words copied from the answer (8 to 30 words) that cover it. Copy them exactly, do not reword.
- If the answer does not cover the section, "present" is false and "quote" is "".
Do not count a section as present because it is probably implied. If the answer does not say it, it is missing.

Return ONLY JSON, no other text:
{{"sections": {{"section_name": {{"present": true, "quote": "exact words from the answer"}}}}}}
Use exactly the section names above. The first character of your response must be {{ and the last }}."""


def _valid(result: Any) -> bool:
    return isinstance(result, dict) and isinstance(result.get("sections"), dict)


def _missing(answer_text: str, sections: list[str], response: dict[str, Any]) -> tuple[list[str], dict[str, str]]:
    """The sections without a verified quote, and the quote found for each section that has one."""
    given = {str(k).strip().casefold(): v for k, v in response["sections"].items() if isinstance(v, dict)}
    missing, found = [], {}
    for name in sections:
        entry = given.get(name.casefold()) or {}
        quote = str(entry.get("quote") or "")
        if entry.get("present") is True and quote_in_answer(quote, answer_text):
            found[name] = quote
        else:
            missing.append(name)
    return missing, found


def humanize(names: list[str]) -> str:
    return ", ".join(name.replace("_", " ") for name in names)


def assess_sections(
    question_text: str,
    answer_text: str,
    question_type: str | None,
    template: dict[str, Any] | None,
    ask=None,
) -> dict[str, Any]:
    """Check the required sections and say whether the check really ran.

    Returns {"ran": False, "why": ...} when there was nothing to check or the model could not answer,
    and {"ran": True, "missing": [...]} when it did (an empty list means every section has a verified quote).
    ask is the function that calls the model, so the checks share one connection and one set of retries.
    """
    ask = ask or call_llm
    sections = required_sections(template)
    if not sections:
        return {"ran": False, "why": "this type of answer has no required sections"}
    if not answer_text.strip():
        return {"ran": False, "why": "the answer is empty"}
    titles = [str(step.get("title")) for step in (template or {}).get("ordered_steps") or [] if step.get("title")]
    kind = question_type or "general"
    try:
        first = ask(build_prompt(question_text, answer_text, kind, sections, titles), _valid, max_completion_tokens=4096, max_retries=MAX_RETRIES, retry_delays=RETRY_DELAYS)
    except LLMCallFailed:
        return {"ran": False, "why": "the model could not be reached"}
    if not _valid(first):
        return {"ran": False, "why": "the model's reply was not in the expected form"}
    missing, _ = _missing(answer_text, sections, first)
    if not missing:
        return {"ran": True, "missing": [], "kind": kind}
    # a section is called missing only when a second look agrees: the model can overlook a quote once
    try:
        again = ask(build_prompt(question_text, answer_text, kind, missing, titles), _valid, max_completion_tokens=4096, max_retries=MAX_RETRIES, retry_delays=RETRY_DELAYS)
    except LLMCallFailed:
        return {"ran": False, "why": "the model could not be reached for the second look"}
    if not _valid(again):
        return {"ran": False, "why": "the second reply was not in the expected form"}
    still_missing, _ = _missing(answer_text, missing, again)
    return {"ran": True, "missing": still_missing, "kind": kind}


def check_required_sections(
    question_text: str,
    answer_text: str,
    question_type: str | None,
    template: dict[str, Any] | None,
    ask=None,
) -> dict[str, Any] | None:
    """A FAIL result naming the missing required sections, or None when none is missing or it could not be checked."""
    found = assess_sections(question_text, answer_text, question_type, template, ask)
    if not found["ran"] or not found["missing"]:
        return None
    return check_result(
        FAIL,
        f"The answer does not cover required section(s) of its structure ({found['kind']}): {humanize(found['missing'])}.",
        missing_sections=found["missing"],
        template_used=found["kind"],
    )


if __name__ == "__main__":
    print(json.dumps(required_sections({"required_sections": ["a", "b"]})))
