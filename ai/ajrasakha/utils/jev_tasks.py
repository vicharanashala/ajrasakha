"""Jev request builders and result mappers, one pair per integration point.

Kept separate from the HTTP client so each mapping can be unit-tested without
network access. Builders return ``(state, questions)`` for the Decisions API;
mappers turn a ``JevResult`` into the exact application type the existing
function already returns.
"""

from __future__ import annotations

from typing import Any, Sequence

try:  # normal package layout
    from ajrasakha.utils.jev_client import (
        JevInvalidResponse,
        JevResult,
        choice_question,
        noul_confidence,
        noul_question,
        require_confidence,
        score_question,
    )
except ImportError:  # flat layout inside the golden / answer-shortener service containers
    from jev_client import (  # type: ignore[no-redef]
        JevInvalidResponse,
        JevResult,
        choice_question,
        noul_confidence,
        noul_question,
        require_confidence,
        score_question,
    )

# ---------------------------------------------------------------- crop requirement

CROP_TASK = "crop_requirement"
CROP_LABELS = ("input_crop_required", "crop_output_requested", "crop_not_required")


def crop_requirement_request(
    *, question: str, original_question: str, domain: str, domain_description: str,
    domain_remarks: str, additional_remarks: str, default_crop_required: bool,
) -> tuple[dict[str, Any], dict[str, Any]]:
    state = {
        "question": question,
        "original_question": original_question,
        "domain": domain,
        "domain_description": domain_description,
        "domain_remarks": domain_remarks,
        "additional_domain_remarks": additional_remarks,
    }
    questions = {
        "crop": choice_question(
            "Decide whether the farmer must provide a specific crop as an INPUT before this question "
            "can be answered correctly.",
            {
                "input_crop_required": "The farmer has an existing or intended crop but must name it because the "
                "requested advice depends on that crop (fertilizer, pesticide, disease, weed control, sowing "
                "practice, variety selection, crop-dependent machinery such as seed drill, planter, harvester).",
                "crop_output_requested": "The farmer is asking which crop, plant or crop to grow or what to plant; "
                "the crop is the answer being requested, not a missing input.",
                "crop_not_required": "The question can be answered without a specific crop (for example: How do I "
                "register an FPO?).",
            },
        )
    }
    return state, questions


def crop_requirement_result(result: JevResult) -> str:
    choice, _probs, confidence = result.choice("crop")
    if choice not in CROP_LABELS:
        raise JevInvalidResponse(f"unexpected crop choice {choice!r}")
    require_confidence(CROP_TASK, confidence)
    return choice


# ---------------------------------------------------------------- language

LANGUAGE_TASK = "language"


def language_request(text: str, script_context: str, languages: Sequence[str]) -> tuple[dict[str, Any], dict[str, Any]]:
    state = {"farmer_text": text, "unicode_script_detected": script_context}
    questions = {
        "language": choice_question(
            "Which spoken language is the farmer using in farmer_text? Judge the language of the words, verbs and "
            "sentence structure, not the writing system. Latin-script Hindi (Hinglish) is Hindi; Latin-script "
            "Tamil/Telugu/Punjabi etc. is that language. Ignore state, district and crop names when they appear in "
            "an otherwise English sentence (English verbs and structure mean English). A bare English crop or place "
            "name is English; a bare Hindi crop name (gehu, chawal) is Hindi; a place name in a native script is "
            "that script's language (Devanagari place names default to Hindi). For a Devanagari text use "
            "Marathi/Nepali markers to tell them apart from Hindi.",
            {lang: f"The farmer is speaking {lang}" for lang in languages},
        )
    }
    return state, questions


def language_result(result: JevResult, languages: Sequence[str]) -> str:
    choice, _probs, confidence = result.choice("language")
    if choice not in languages:
        raise JevInvalidResponse(f"unexpected language {choice!r}")
    require_confidence(LANGUAGE_TASK, confidence)
    return choice


# ---------------------------------------------------------------- Golden DB: relevance filter / pending duplicate / similar question

GOLDEN_FILTER_TASK = "golden_relevance"
PENDING_DUP_TASK = "pending_duplicate"
SIMILAR_FILTER_TASK = "similar_filter"
SIMILAR_CLASSIFY_TASK = "similar_classify"
SIMILAR_TIE_TASK = "similar_tiebreak"
GOLDEN_CLASSIFY_TASK = "golden_classify"
GOLDEN_TIE_TASK = "golden_tiebreak"


def _candidate_keys(n: int) -> list[str]:
    return [f"c{i}" for i in range(1, n + 1)]


def golden_relevance_request(original_query: str, crop: str, state: str, pairs: Sequence[Any]):
    keys = _candidate_keys(len(pairs))
    state_obj = {
        "farmer_question": original_query.strip(),
        "farmer_crop": crop,
        "farmer_state": state,
        "note": "All candidates were retrieved for this crop and state; crop/state need not appear in candidate text.",
        "candidates": {
            k: {"question": (p.question_text or "")[:400], "answer_excerpt": (p.answer_text or "")[:400]}
            for k, p in zip(keys, pairs)
        },
    }
    crit = {
        "SAME": "The candidate question is the same as the farmer question: exact match or a clear paraphrase "
                "(same intent, same problem; wording may differ).",
        "KEEP": "There is a common thread (same or related topic, similar symptom or issue, same farming topic) "
                "but it is not a same/paraphrase match. When unsure between KEEP and REJECT, KEEP.",
        "REJECT": "The candidate is completely irrelevant to the farmer question.",
    }
    questions = {k: choice_question(f"How does candidate {k} relate to farmer_question?", crit) for k in keys}
    return state_obj, questions


def _decisions(result: JevResult, n: int, allowed: tuple, task: str) -> list[dict]:
    out = []
    for k in _candidate_keys(n):
        choice, _p, conf = result.choice(k)
        if choice not in allowed:
            raise JevInvalidResponse(f"unexpected choice {choice!r}")
        require_confidence(task, conf)
        out.append({"relevance_decision": choice, "relevance_reason": f"jev confidence {conf:.2f}", "llm_parse_ok": True})
    return out


def golden_relevance_results(result: JevResult, n: int) -> list[dict]:
    return _decisions(result, n, ("SAME", "KEEP", "REJECT"), GOLDEN_FILTER_TASK)


# Evaluation-only combined relevance + answer sufficiency decision.  Production
# callers continue to use golden_relevance_request/results unless explicitly
# changed after the experiment has been reviewed.
GOLDEN_CHOICE_NOUL_TASK = "golden_choice_noul"
GOLDEN_ANSWER_VERIFY_TASK = "golden_answer_verify"
GOLDEN_CANDIDATE_RERANK_TASK = "golden_candidate_rerank"


def golden_choice_noul_request(original_query: str, crop: str, state: str, pairs: Sequence[Any]):
    """Ask intent and answer sufficiency together in one Jev round trip."""
    keys = _candidate_keys(len(pairs))
    state_obj = {
        "farmer_question": original_query.strip(),
        "farmer_crop": crop,
        "farmer_state": state,
        "candidates": {
            k: {
                "question": (p.question_text or "")[:400],
                # Long GDB answers often introduce the disease before listing
                # the requested spray/control later. Keep enough text for Jev
                # to judge actual answer coverage rather than only the intro.
                "answer": (p.answer_text or "")[:4000],
            }
            for k, p in zip(keys, pairs)
        },
    }
    intent_criteria = {
        "SAME": "The candidate question is the same request or a clear paraphrase.",
        "KEEP": "The candidate is related, but its question is not the same request.",
        "REJECT": "The candidate is irrelevant or conflicts on the crop, disease, pest, practice, or requested fact.",
    }
    questions: dict[str, Any] = {}
    for k in keys:
        questions[f"{k}_intent"] = choice_question(
            f"How does candidates.{k}.question relate to farmer_question?",
            intent_criteria,
        )
        questions[f"{k}_sufficient"] = noul_question(
            f"Does candidates.{k}.answer directly and sufficiently answer farmer_question for farmer_crop and "
            "farmer_state? Answer yes only when it supplies the requested fact or action and does not conflict on "
            "crop, pest, disease, growth stage, farming practice, or region. A related topic or matching title alone "
            "is not sufficient."
        )
    return state_obj, questions


def golden_choice_noul_results(result: JevResult, n: int) -> list[dict]:
    """Return both the categorical intent result and P(answer is sufficient)."""
    out = []
    for k in _candidate_keys(n):
        choice, probabilities, confidence = result.choice(f"{k}_intent")
        if choice not in ("SAME", "KEEP", "REJECT"):
            raise JevInvalidResponse(f"unexpected choice {choice!r}")
        p_sufficient = result.noul(f"{k}_sufficient")
        out.append({
            "intent": choice,
            "intent_probabilities": probabilities,
            "intent_confidence": confidence,
            "answer_sufficiency": p_sufficient,
        })
    return out


def select_golden_choice_noul(
    results: Sequence[dict],
    pairs: Sequence[Any],
    *,
    sufficiency_threshold: float = 0.5,
) -> int | None:
    """Select an answer-covered candidate; return its zero-based index.

    Sufficiency is the primary signal. Intent probability and vector similarity
    break ties. REJECT candidates are never eligible.
    """
    eligible = [
        i for i, r in enumerate(results)
        if r.get("intent") != "REJECT"
        and float(r.get("answer_sufficiency", 0.0)) >= sufficiency_threshold
    ]
    if not eligible:
        return None

    def rank(i: int) -> tuple[float, float, float, float]:
        r = results[i]
        probs = r.get("intent_probabilities") or {}
        similarity = getattr(pairs[i], "similarity_score", None) or 0.0
        return (
            float(r.get("answer_sufficiency", 0.0)),
            float(probs.get("SAME", 0.0)),
            float(r.get("intent_confidence", 0.0)),
            float(similarity),
        )

    return max(eligible, key=rank)


def golden_candidate_rerank_request(
    original_query: str,
    crop: str,
    state: str,
    candidate: Any,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Build one compact, atomic Jev request for one retrieved GDB record.

    Keeping candidates in separate states prevents another candidate from
    influencing the decision and lets callers evaluate several records
    concurrently without creating one very large prompt.
    """
    state_obj = {
        "farmer_question": original_query.strip(),
        "farmer_crop": crop,
        "farmer_state": state,
        "candidate_question": (candidate.question_text or "")[:500],
        "candidate_answer": (candidate.answer_text or "")[:4000],
    }
    questions = {
        "task_alignment": choice_question(
            "How closely does candidate_question match the action or information requested by farmer_question?",
            {
                "SAME_TASK": "It asks for the same action or information. Wording may differ and a location may be omitted when the advice can still apply there.",
                "PARTIAL_TASK": "It covers one material part of the request or a broader/narrower version of the same task.",
                "DIFFERENT_TASK": "It asks for a different action or fact. Availability, planting instructions, diagnosis, prevention, and treatment are different tasks.",
            },
        ),
        "answer_evidence": noul_question(
            "Does candidate_answer contain concrete information that can answer farmer_question, rather than "
            "only discussing a related topic?"
        ),
        "target_match": noul_question(
            "Are the material targets compatible between farmer_question and this candidate: crop, disease, "
            "pest, weed, symptom, practice, scheme, location, season, and growth stage when stated?"
        ),
        "complete_coverage": noul_question(
            "Does candidate_answer cover every material part of farmer_question with usable information?"
        ),
        "has_conflict": noul_question(
            "Does this candidate materially conflict with farmer_question on the requested task, crop, problem, "
            "location, season, or growth stage?"
        ),
    }
    return state_obj, questions


def golden_candidate_rerank_result(result: JevResult) -> dict[str, Any]:
    """Parse the five atomic probabilities used by the experimental reranker."""
    task, task_probabilities, task_confidence = result.choice("task_alignment")
    if task not in {"SAME_TASK", "PARTIAL_TASK", "DIFFERENT_TASK"}:
        raise JevInvalidResponse(f"unexpected task alignment {task!r}")
    return {
        "task_alignment": task,
        "task_probabilities": task_probabilities,
        "task_confidence": task_confidence,
        "same_task": float(task_probabilities.get("SAME_TASK", 0.0)),
        "answer_evidence": result.noul("answer_evidence"),
        "target_match": result.noul("target_match"),
        "complete_coverage": result.noul("complete_coverage"),
        "has_conflict": result.noul("has_conflict"),
    }


def golden_candidate_rerank_policy(
    checks: dict[str, Any],
    *,
    task_threshold: float,
    evidence_threshold: float,
    target_threshold: float,
    max_conflict_probability: float,
) -> dict[str, Any]:
    """Apply transparent eligibility gates and return a risk-adjusted score.

    Thresholds are deliberately supplied by the caller: their defaults are
    experimental and must be calibrated against reviewed GDB examples.
    """
    task_alignment = str(checks.get("task_alignment") or "DIFFERENT_TASK")
    task_probabilities = checks.get("task_probabilities") or {}
    same_task = float(task_probabilities.get("SAME_TASK", checks.get("same_task", 0.0)))
    partial_task = float(task_probabilities.get("PARTIAL_TASK", 0.0))
    evidence = float(checks.get("answer_evidence", 0.0))
    target = float(checks.get("target_match", 0.0))
    coverage = float(checks.get("complete_coverage", 0.0))
    conflict = float(checks.get("has_conflict", 1.0))

    failed_gates: list[str] = []
    if task_alignment != "SAME_TASK" or same_task < task_threshold:
        failed_gates.append("same_task")
    if evidence < evidence_threshold:
        failed_gates.append("answer_evidence")
    if target < target_threshold:
        failed_gates.append("target_match")
    if conflict > max_conflict_probability:
        failed_gates.append("has_conflict")

    task_fit = same_task + (0.5 * partial_task)
    mean_positive = (task_fit + evidence + target + coverage) / 4.0
    score = mean_positive * (1.0 - conflict)
    hard_reject = task_alignment == "DIFFERENT_TASK" or conflict >= 0.8
    reviewable = not hard_reject and (task_alignment in {"SAME_TASK", "PARTIAL_TASK"})
    return {
        "eligible": not failed_gates,
        "reviewable": reviewable,
        "hard_reject": hard_reject,
        "failed_gates": failed_gates,
        "quality_score": mean_positive,
        "risk_adjusted_score": score,
    }


def golden_answer_verify_request(
    original_query: str,
    crop: str,
    state: str,
    selected_match: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Build a small verify-after request for the answer chosen by GDB."""
    state_obj = {
        "farmer_question": original_query.strip(),
        "farmer_crop": crop,
        "farmer_state": state,
        "selected_gdb_question": (selected_match.get("question") or "")[:400],
        "selected_gdb_answer": (selected_match.get("answer") or "")[:4000],
    }
    questions = {
        "target_alignment": choice_question(
            "How closely does selected_gdb_answer address the specific crop, problem, disease, pest, weed, practice, "
            "scheme, or other target in farmer_question? Judge meaning, including local names and symptoms.",
            {
                "SAME_TARGET": "It addresses the same specific target, including a clear synonym or symptom match.",
                "BROAD_TARGET": "It covers the requested target only as part of a broader topic.",
                "DIFFERENT_TARGET": "It addresses a different crop, disease, pest, practice, scheme, or target.",
            },
        ),
        "task_coverage": choice_question(
            "How completely does selected_gdb_answer perform the action requested by farmer_question? Judge the "
            "actual answer, not only its title. Extra background does not reduce coverage when the requested answer "
            "is present.",
            {
                "FULL_TASK": "It directly answers every material part of the request with usable information.",
                "PARTIAL_TASK": "It answers at least one requested part but omits another material part or needed detail.",
                "DIFFERENT_TASK": "It answers a different request, such as availability instead of how to plant.",
            },
        ),
        "has_conflict": noul_question(
            "Does selected_gdb_answer materially conflict with farmer_question on the crop, target problem, "
            "requested action, location requirement, season, or growth stage?"
        ),
    }
    return state_obj, questions


def golden_answer_verify_result(result: JevResult) -> dict[str, Any]:
    target, target_probabilities, target_confidence = result.choice("target_alignment")
    coverage, coverage_probabilities, coverage_confidence = result.choice("task_coverage")
    if target not in {"SAME_TARGET", "BROAD_TARGET", "DIFFERENT_TARGET"}:
        raise JevInvalidResponse(f"unexpected target alignment {target!r}")
    if coverage not in {"FULL_TASK", "PARTIAL_TASK", "DIFFERENT_TASK"}:
        raise JevInvalidResponse(f"unexpected task coverage {coverage!r}")
    return {
        "target_alignment": target,
        "target_probabilities": target_probabilities,
        "target_confidence": target_confidence,
        "task_coverage": coverage,
        "task_probabilities": coverage_probabilities,
        "task_confidence": coverage_confidence,
        "has_conflict": result.noul("has_conflict"),
    }


def golden_answer_gate_decision(
    checks: dict[str, Any],
    *,
    max_conflict_probability: float = 0.2,
    reject_conflict_probability: float = 0.8,
) -> str:
    """Return accept, review, or reject using transparent application policy."""
    target = checks.get("target_alignment")
    coverage = checks.get("task_coverage")
    has_conflict = float(checks.get("has_conflict", 1.0))
    if target == "DIFFERENT_TARGET" or coverage == "DIFFERENT_TASK" or has_conflict >= reject_conflict_probability:
        return "reject"
    if target == "SAME_TARGET" and coverage == "FULL_TASK" and has_conflict <= max_conflict_probability:
        return "accept"
    return "review"


def pending_duplicate_request(original_query: str, crop: str, state: str, candidates: Sequence[Any]):
    keys = _candidate_keys(len(candidates))
    state_obj = {
        "new_question": original_query.strip(),
        "crop": crop,
        "state": state,
        "existing_pending_questions": {k: (getattr(c, "question_text", None) or "")[:400] for k, c in zip(keys, candidates)},
    }
    crit = {
        "SAME": "The existing question is the same as the new question: exact match or a clear paraphrase "
                "(same intent, same problem; wording may differ).",
        "NOT_SAME": "Different question or only loosely related topic.",
    }
    questions = {k: choice_question(f"Is existing_pending_questions.{k} a duplicate of new_question?", crit) for k in keys}
    return state_obj, questions


def pending_duplicate_results(result: JevResult, n: int) -> list[dict]:
    return _decisions(result, n, ("SAME", "NOT_SAME"), PENDING_DUP_TASK)


def similar_filter_request(original_query: str, questions_in: Sequence[Any]):
    keys = _candidate_keys(len(questions_in))
    state_obj = {
        "input_question": original_query.strip(),
        "candidates": {k: getattr(q, "question_text", str(q)) for k, q in zip(keys, questions_in)},
    }
    crit = {
        "SAME": "The candidate is essentially the same as the input question: exact match or clear paraphrase.",
        "KEEP": "Any common thread (same or related topic, similar issue, same farming topic) but not a paraphrase.",
        "REJECT": "Completely irrelevant to the input question.",
    }
    return state_obj, {k: choice_question(f"How does candidate {k} relate to input_question?", crit) for k in keys}


def similar_filter_results(result: JevResult, n: int) -> list[dict]:
    return _decisions(result, n, ("SAME", "KEEP", "REJECT"), SIMILAR_FILTER_TASK)


def similar_classify_request(original_query: str, candidate_question: str):
    state_obj = {"input_question": original_query.strip(), "candidate_question": candidate_question.strip()}
    q = {"cls": choice_question(
        "Is candidate_question similar enough to answer input_question? String matching is critical for local names, "
        "diseases, crops and chemicals; same disease/pest but a different crop is RELATED; be lenient: prefer RELATED "
        "over DIFFERENT when there is any connection.",
        {"SAME": "Exact match or clear paraphrase.",
         "RELATED": "A related topic or similar issue that could help answer the input.",
         "DIFFERENT": "About a different topic or problem."})}
    return state_obj, q


def similar_classify_result(result: JevResult) -> dict:
    choice, _p, conf = result.choice("cls")
    if choice not in ("SAME", "RELATED", "DIFFERENT"):
        raise JevInvalidResponse(f"unexpected similarity class {choice!r}")
    require_confidence(SIMILAR_CLASSIFY_TASK, conf)
    return {"classification": choice, "reason": f"jev confidence {conf:.2f}", "llm_parse_ok": True}


def _tie_criteria(descs: Sequence[str]) -> dict[str, str]:
    return {str(i): d for i, d in enumerate(descs, 1)}


def similar_tie_request(original_query: str, candidates: Sequence[Any], winning_class: str):
    descs = [f"Candidate {i}: {getattr(q, 'question_text', str(q))}" for i, (_score, q, _cls) in enumerate(candidates, 1)]
    state_obj = {"input_question": original_query.strip(), "shared_classification": winning_class}
    q = {"best": choice_question(
        "All candidates received the same classification. Pick the single best match for input_question based on "
        "intent alignment, specificity vs generality and topic relevance.", _tie_criteria(descs))}
    return state_obj, q


def index_result(result: JevResult, n: int, task: str) -> tuple[int, float]:
    """Return (1-based index, confidence) for a numbered-candidate choice named ``best``."""
    choice, _p, conf = result.choice("best")
    try:
        idx = int(choice)
    except ValueError as exc:
        raise JevInvalidResponse(f"non-numeric candidate {choice!r}") from exc
    if not 1 <= idx <= n:
        raise JevInvalidResponse(f"candidate {idx} out of range")
    require_confidence(task, conf)
    return idx, conf


# ---------------------------------------------------------------- Golden DB: coverage classification / tie-breaker

def golden_classify_request(original_query: str, retrieved_question: str, retrieved_answer: str, crop: str, state: str):
    state_obj = {
        "farmer_question": original_query.strip(),
        "farmer_request": "Ignore my district name in the question.",
        "farmer_crop": crop,
        "farmer_state": state,
        "retrieved_question": (retrieved_question or "")[:2000],
        "retrieved_expert_answer": (retrieved_answer or "")[:4000],
    }
    q = {"cls": choice_question(
        "Classify whether the retrieved expert Q&A can answer the farmer's question. String matching is very "
        "important for local names, diseases, crops and chemical names: if the strings do not match, choose "
        "PARTIALLY_COVERED or NOT_COVERED, and never assume local names or slang are the same unless the retrieved "
        "Q&A explicitly says so. Treat all districts as the same. If deciding between COVERED_BY_CONTEXT and "
        "PARTIALLY_COVERED, choose PARTIALLY_COVERED.",
        {"SAME_INTENT": "The farmer question is the same as the retrieved question, or the existing answer can be "
                        "reused without modification.",
         "COVERED_BY_CONTEXT": "The query has no ambiguity and the retrieved answer fully covers the farmer query "
                               "without any missing information.",
         "PARTIALLY_COVERED": "A different question; relevant but incomplete, or requires assumptions or outside "
                              "information to answer.",
         "NOT_COVERED": "The Q&A does not contain the information needed."})}
    return state_obj, q


def golden_classify_result(result: JevResult) -> dict:
    choice, _p, conf = result.choice("cls")
    if choice not in ("SAME_INTENT", "COVERED_BY_CONTEXT", "PARTIALLY_COVERED", "NOT_COVERED"):
        raise JevInvalidResponse(f"unexpected class {choice!r}")
    require_confidence(GOLDEN_CLASSIFY_TASK, conf)
    return {"classification": choice, "reason": f"jev confidence {conf:.2f}", "llm_parse_ok": True}


def golden_tie_request(original_query: str, candidates: Sequence[tuple], winning_class: str):
    descs = []
    for i, (_s, pair, cls_result) in enumerate(candidates, 1):
        descs.append(
            f"Candidate {i}: Question: {(pair.question_text or '')[:300]} | Answer excerpt: "
            f"{(pair.answer_text or '')[:500]} | Prior classification reason: {cls_result.get('reason', '')}"
        )
    state_obj = {"farmer_question": original_query.strip(), "shared_classification": winning_class}
    q = {"best": choice_question(
        "These candidates were all classified as the same class and are equally eligible. Pick the ONE that best "
        "answers the farmer.", _tie_criteria(descs))}
    return state_obj, q


# ---------------------------------------------------------------- query safety / agriculture relevance (query_preprocessor)

SAFETY_TASK = "safety"
AGRI_TASK = "agri_relevance"


def safety_request(query: str):
    state_obj = {"user_query": query.strip()}
    q = {"safety": choice_question(
        "You are a strict content-safety classifier for an Indian agriculture Q&A bot. ANY profanity or vulgar words "
        "(including mild ones like 'hell'), ANY abusive or harassing language toward anyone, ANY slurs, hate speech or "
        "discriminatory language, ANY threats or violent language, ANY explicit sexual content and ANY spam or "
        "promotional content make the query unsafe.",
        {"safe": "No vulgar, abusive, hateful, threatening, sexual or spam content.",
         "vulgar": "Contains profanity, vulgar words, explicit sexual content or spam.",
         "abusive": "Contains abusive or harassing language, slurs, hate speech or threats toward anyone."})}
    return state_obj, q


def safety_result(result: JevResult) -> dict:
    choice, _p, conf = result.choice("safety")
    if choice not in ("safe", "vulgar", "abusive"):
        raise JevInvalidResponse(f"unexpected safety category {choice!r}")
    require_confidence(SAFETY_TASK, conf)
    return {"is_safe": choice == "safe", "category": choice, "reason": f"jev confidence {conf:.2f}"}


def agri_relevance_request(query: str):
    state_obj = {"user_query": query.strip()}
    q = {"agri": choice_question(
        "Determine whether the query is related to agriculture, farming or allied activities.",
        {"related": "Crop cultivation, pest and disease management, fertilizers and nutrients, soil and irrigation, "
                    "weather and climate for farming, market prices for crops, animal husbandry and dairy, farm "
                    "equipment and machinery, government schemes for farmers, agricultural best practices.",
         "not_related": "Sports, politics, entertainment, general knowledge unrelated to farming, personal or "
                        "domestic topics not related to agriculture."})}
    return state_obj, q


def agri_relevance_result(result: JevResult) -> dict:
    choice, _p, conf = result.choice("agri")
    if choice not in ("related", "not_related"):
        raise JevInvalidResponse(f"unexpected relevance category {choice!r}")
    require_confidence(AGRI_TASK, conf)
    return {"is_related": choice == "related", "category": choice, "reason": f"jev confidence {conf:.2f}"}


# ---------------------------------------------------------------- weather tool / mandi action / sufficiency / ACC tools

WEATHER_TASK = "weather_intent"
MANDI_TASK = "mandi_intent"
SUFFICIENCY_TASK = "answer_sufficiency"
ACC_TASK = "acc_tools"

WEATHER_TOOLS = {
    "get_current_and_forecast_info": "Current / today's / live weather observation and forecast; specific-date weather; "
                                     "multi-day 3/5/7 day forecast; historical or previous weather for a date or range; "
                                     "default fallback for general weather questions.",
    "get_rainfall_and_monsoon_info": "Rainfall amount, rain condition, precipitation stats; current, forecast or "
                                     "historical rainfall; rain forecasts and rain chances (today, tomorrow, next days, "
                                     "specific date, morning/evening); monsoon progress and status; district rainfall "
                                     "departures; past 24 hours recorded rainfall.",
    "get_temperature_info": "Temperature (min/max), humidity, feels-like; hot weather, cold weather, heatwave or "
                            "coldwave checks; today, forecast, previous dates and ranges for temperature.",
    "get_location_weather": "Hyper-local weather for a block, tehsil, taluk, village or panchayat; nearby AWS weather "
                            "stations within a radius.",
    "get_weather_nowcast": "Short-term nowcast for the next 1-3 hours ONLY (radar-based 0-3 hour predictions). Not for "
                           "general current weather or multi-day forecasts.",
    "get_weather_alerts": "Official IMD warnings and severe weather alerts: red / orange / yellow alerts, cyclone, "
                          "storm warnings (Day 1-5), warnings and severe weather threats.",
}


def weather_tool_request(query: str, today: str):
    state_obj = {"farmer_query": query.strip(), "today": today}
    q = {"tool": choice_question(
        "Route this farmer weather query to exactly one IMD weather tool (pick the best single tool).", WEATHER_TOOLS)}
    return state_obj, q


def weather_tool_result(result: JevResult) -> str:
    choice, _p, conf = result.choice("tool")
    if choice not in WEATHER_TOOLS:
        raise JevInvalidResponse(f"unexpected weather tool {choice!r}")
    require_confidence(WEATHER_TASK, conf)
    return choice


MANDI_ACTIONS = {
    "get_today_price": "Today's / latest commodity price; default single price question without a named mandi; "
                       "modal / min-and-max price with no historical period; a place or district without an APMC/mandi keyword.",
    "get_price_with_nearby": "A specific named mandi/APMC (mandi keyword present) and a general today's, current or "
                             "specific-date price including modal, min or max price: the named mandi's price AND nearby markets' prices.",
    "get_price_history": "Historical prices over a date range or past N days; price trend.",
    "get_price_summary": "Aggregated min/max/modal price statistics over a period.",
    "get_highest_price": "ONLY the highest / maximum / best selling / peak price across markets, district, state or a "
                         "named mandi (any date or range).",
    "get_lowest_price": "ONLY the lowest / minimum / cheapest / least price across markets, district, state or a "
                        "named mandi (any date or range).",
    "get_today_arrival": "Today's arrival quantity for a commodity.",
    "get_arrival_history": "Historical arrival quantities over a date range or past days.",
    "get_extreme_arrival": "Highest or lowest arrival across markets or dates.",
    "search_markets": "Search or list mandis / APMCs by name and state; which mandis are there.",
}


def mandi_action_request(query: str, today: str, crop: Any = None, state: Any = None):
    state_obj = {"farmer_query": query.strip(), "today": today}
    if crop:
        state_obj["crop_context"] = crop
    if state:
        state_obj["state_context"] = state
    q = {"action": choice_question(
        "Choose the single primary mandi price-server action that answers the farmer's query.", MANDI_ACTIONS)}
    return state_obj, q


def mandi_action_result(result: JevResult) -> str:
    choice, _p, conf = result.choice("action")
    if choice not in MANDI_ACTIONS:
        raise JevInvalidResponse(f"unexpected mandi action {choice!r}")
    require_confidence(MANDI_TASK, conf)
    return choice


def _noul_threshold() -> float:
    import os
    try:
        return float(os.getenv("JEV_NOUL_THRESHOLD", "0.5"))
    except ValueError:
        return 0.5


def sufficiency_request(rephrased_query: str, answer: str):
    state_obj = {"farmer_question": rephrased_query.strip(), "generated_answer": answer[:2000]}
    q = {"sufficient": noul_question(
        "Does generated_answer adequately address the farmer's original question? If the farmer asked for crop "
        "recommendations, pest advice, fertilizer suggestions or general agricultural guidance based on weather or "
        "market data but the answer only contains raw weather or mandi data without addressing the actual question, "
        "the answer is NOT adequate. If the answer directly provides the specific information requested, it is adequate.")}
    return state_obj, q


def sufficiency_result(result: JevResult) -> tuple[bool, float]:
    p = result.noul("sufficient")
    require_confidence(SUFFICIENCY_TASK, noul_confidence(p))
    return p >= _noul_threshold(), p


ACC_TOOLS = ("gdb", "weather", "market", "schemes")
ACC_TOOL_DESC = {
    "weather": "The question is about weather (current weather, forecast, rain, temperature, alerts).",
    "market": "The question is about market prices or mandi rates.",
    "schemes": "The question is about government schemes, subsidies, yojanas or farmer benefits.",
    "gdb": "The question is about farming practices, diseases, pests, fertilizers or general agricultural advice.",
}


def acc_tools_request(context: str):
    state_obj = {"call_center_context": context}
    q = {t: noul_question(f"A query may require several tools. {ACC_TOOL_DESC[t]} Should the '{t}' tool be used for any of the extracted questions?")
         for t in ACC_TOOLS}
    return state_obj, q


def acc_tools_result(result: JevResult) -> list[str]:
    thr = _noul_threshold()
    selected = []
    for t in ACC_TOOLS:
        p = result.noul(t)
        require_confidence(ACC_TASK, noul_confidence(p))
        if p >= thr:
            selected.append(t)
    return selected or ["gdb"]  # same default as the existing planner_node


# ---------------------------------------------------------------- answer shortener: segment relevance ranking

SHORTENER_TASK = "shortener_ranking"
SHORTENER_LEVELS = ["irrelevant", "weak", "relevant", "essential"]


def shortener_rank_request(original_query: str, segments: Sequence[Any]):
    """``segments`` are the prompt dicts built by the service: {"id", "text", ...}."""
    state_obj = {
        "original_query": original_query,
        "segments": {seg["id"]: seg["text"] for seg in segments},
    }
    questions = {
        seg["id"]: score_question(
            f"How relevant is the answer segment '{seg['id']}' to original_query? Rate how directly this segment "
            "answers what the farmer asked.",
            SHORTENER_LEVELS,
        )
        for seg in segments
    }
    return state_obj, questions


def shortener_rank_result(result: JevResult, segment_ids: Sequence[str], mandatory_ids: Sequence[str]) -> list[str]:
    """Rank all segment ids: mandatory first (source order), then by score desc, ties by source order."""
    scores = {}
    for sid in segment_ids:
        score, _p, conf = result.score(sid)
        require_confidence(SHORTENER_TASK, conf)
        scores[sid] = score
    mandatory = [s for s in segment_ids if s in set(mandatory_ids)]
    rest = [s for s in segment_ids if s not in set(mandatory_ids)]
    order = {sid: i for i, sid in enumerate(segment_ids)}
    rest.sort(key=lambda s: (-scores[s], order[s]))
    return mandatory + rest


# ---------------------------------------------------------------- planner decision fields (shadow / override inside planner_node)

PLANNER_TASK = "planner_decisions"


def planner_decisions_request(
    user_text: str,
    recent_farmer_messages: Sequence[str],
    prev_ai_answer: str | None,
    pending_clarification: bool,
):
    """Build the decision-only planner request. Descriptions are taken from PLANNER_SYSTEM_PROMPT."""
    from ajrasakha.agents.domains import ALLOWED_DOMAINS_LIST, DOMAIN_CROP_POLICIES

    state_obj: dict[str, Any] = {
        "latest_farmer_message": user_text,
        "recent_farmer_messages": list(recent_farmer_messages)[-4:],
    }
    if prev_ai_answer:
        state_obj["previous_ai_answer"] = prev_ai_answer[:1500]
    if pending_clarification:
        state_obj["server_asked_farmer_for_missing_location_or_crop"] = True

    q: dict[str, Any] = {
        "is_greeting": noul_question(
            "Is the farmer's latest message ONLY a greeting, salutation or courtesy (hi, hello, namaste, ram ram, "
            "thanks, bye) with no agricultural query or farming context?"),
        "is_agriculture_related": noul_question(
            "Is the farmer's primary intent about farming (weather for crops or fields, mandi prices, soil, "
            "fertilizer, crop pests and diseases, farming government schemes, crop cultivation)? It is NOT when the "
            "primary intent is something else (making money, buying a bike, personal finance), when one farming topic "
            "is mixed with a clearly off-topic goal, when the question is about animal husbandry, livestock, "
            "veterinary science, animal health, fisheries or aquaculture, or when the message is only a greeting."),
        "weather": noul_question(
            "Is live or current weather data REQUIRED to answer (current or recent conditions, weather for a specific "
            "period such as tomorrow or next week, what to do based on CURRENT weather)? General agricultural "
            "knowledge about weather for a crop (weather requirements, best sowing weather, forecasting strategies) "
            "does not need live data."),
        "is_multiple_crops": noul_question(
            "Does the farmer name two or more specific crops for the question? A crop category such as vegetables, "
            "rabi crops, all crops or any crop does not count."),
    }
    if prev_ai_answer:
        q["is_follow_up"] = noul_question(
            "Is the latest message a transformation request on the previous AI answer (language change, format "
            "change, detail request, simplification, tone change, rephrase) that can be answered from the previous "
            "answer alone with no new tool calls? A new substantive question or one needing new data is not.")
        q["follow_up_type"] = choice_question(
            "If the latest message is a follow-up on the previous answer, which kind is it?",
            {"language_change": "Translate or repeat in another language.",
             "format_change": "Bullets, shorter, paragraph, table.",
             "detail_request": "Explain more, elaborate, give details.",
             "simplify": "Simpler words, easier explanation.",
             "tone_change": "For a beginner, for an expert, polite.",
             "rephrase": "Reword or rewrite with the same meaning."})
    if pending_clarification:
        q["is_new_question"] = noul_question(
            "The server asked the farmer for a missing location or crop. Does the latest message NOT answer that "
            "request but ask a new, different question? A message that supplies the location or crop, says the farmer "
            "does not know, or says any crop is fine is not a new question.")
    domain_crit = {}
    for d in ALLOWED_DOMAINS_LIST:
        desc = (DOMAIN_CROP_POLICIES.get(d) or {}).get("description") or ""
        domain_crit[d] = (desc.split("Example")[0].strip()[:220]) or d
    domain_crit["Weather"] = ("Current weather, rainfall condition, rain prediction, nowcast, temperature, humidity, "
                              "climate, forecasts or severe weather alerts. Use instead of Sowing Time and Weather "
                              "unless the farmer explicitly asks about sowing dates or planting timing.")
    q["primary_domain"] = choice_question("Which single domain best describes the farmer's latest message?", domain_crit)
    return state_obj, q


def planner_decisions_result(result: JevResult) -> dict[str, Any]:
    """Map to the PlannerOutput field names. Fields not asked for are simply absent."""
    thr = _noul_threshold()
    out: dict[str, Any] = {}
    for key in ("is_greeting", "is_agriculture_related", "weather", "is_multiple_crops", "is_follow_up", "is_new_question"):
        if key in result.answers:
            p = result.noul(key)
            require_confidence(PLANNER_TASK, noul_confidence(p))
            out[key] = p >= thr
            out[key + "_p"] = p
    if "follow_up_type" in result.answers:
        choice, _pr, conf = result.choice("follow_up_type")
        out["follow_up_type"] = choice
    choice, _pr, conf = result.choice("primary_domain")
    require_confidence(PLANNER_TASK, conf)
    out["primary_domain"] = choice
    out["primary_domain_confidence"] = conf
    return out


# ---------------------------------------------------------------- legacy weather agent classifier (still active in the ACC workflow)

WEATHER_CLASSIFIER_TASK = "weather_classifier"
WEATHER_DATA_TYPES = {
    "forecast": "Weather, rain or temperature forecast in the next hours, days, tomorrow, next week.",
    "current_aws": "Current or live temperature, wind, rain or real-time conditions.",
    "district_warnings": "Specific local alerts, warnings or weather threat codes for a district.",
    "district_rainfall": "Rainfall statistics or season statistics versus normal in the district.",
    "district": "Both district warnings and rainfall statistics together.",
    "subdivision_warnings": "National or all-India meteorological subdivision warnings.",
    "subdivision_rainfall": "National or all-India subdivision rainfall distribution forecasts.",
    "bundle": "A complete all-in-one bundle of forecast, current station observations and district details.",
}


def weather_classifier_request(query: str):
    return {"farmer_query": query.strip()}, {"category": choice_question(
        "Classify the farmer weather query into exactly one category.", WEATHER_DATA_TYPES)}


def weather_classifier_result(result: JevResult) -> str:
    choice, _p, conf = result.choice("category")
    if choice not in WEATHER_DATA_TYPES:
        raise JevInvalidResponse(f"unexpected weather category {choice!r}")
    require_confidence(WEATHER_CLASSIFIER_TASK, conf)
    return choice


# ---------------------------------------------------------------- combined safety + strict agriculture (POST /v1/classify-query)

COMBINED_TASK = "combined_classification"


def combined_request(query: str):
    state_obj = {"user_query": query.strip()}
    q = {
        "safety": choice_question(
            "Check whether the query contains vulgar or abusive content. ANY profanity (fuck, shit, ass, hell, bastard, "
            "etc.), abusive or harassing language, slurs, threats, hate speech or spam makes it unsafe.",
            {"safe": "No vulgar, abusive, threatening, hateful or spam content.",
             "unsafe": "Contains profanity, abuse, slurs, threats, hate speech, explicit sexual content or spam."}),
        "agriculture": choice_question(
            "Check whether the query is STRICTLY about crop farming only.",
            {"related": "Crop cultivation (rice, wheat, cotton, vegetables, fruits, etc.), pest and disease management "
                        "for crops, fertilizers for crops, soil management, irrigation for crops, weather impact on farming.",
             "not_related": "Animal husbandry, livestock, poultry, dairy farming, fisheries, aquaculture, veterinary "
                            "questions, animals, fish or non-crop farming activities, and anything not about crop farming."}),
    }
    return state_obj, q


def combined_result(result: JevResult) -> dict:
    s, _p, sc_ = result.choice("safety")
    a, _p2, ac_ = result.choice("agriculture")
    if s not in ("safe", "unsafe") or a not in ("related", "not_related"):
        raise JevInvalidResponse("unexpected combined classification choice")
    require_confidence(COMBINED_TASK, min(sc_, ac_))
    return {
        "is_safe": s == "safe",
        "safety_reason": f"jev confidence {sc_:.2f}",
        "is_agriculture": a == "related",
        "agriculture_reason": f"jev confidence {ac_:.2f}",
    }


# ---- Golden relevance filter, Score mode (alternative to Choice) ----
RELEVANCE_LEVELS = [
    "irrelevant to the farmer question",
    "related: same topic or thread but not the same question",
    "same question: exact match or clear paraphrase",
]


def golden_relevance_score_request(original_query: str, crop: str, state: str, pairs: Sequence[Any]):
    state_obj, _ = golden_relevance_request(original_query, crop, state, pairs)
    questions = {
        k: score_question(
            f"How closely does candidate {k} match farmer_question? Level 0 = completely irrelevant, level 1 = a common "
            "thread (same or related topic, similar issue) but not the same question, level 2 = the same question "
            "(exact match or clear paraphrase).",
            RELEVANCE_LEVELS,
        )
        for k in _candidate_keys(len(pairs))
    }
    return state_obj, questions


def golden_relevance_score_results(result: JevResult, n: int) -> list[dict]:
    """Fixed mapping decided in advance: <0.5 REJECT, >=1.5 SAME, else KEEP."""
    out = []
    for k in _candidate_keys(n):
        score, _p, conf = result.score(k)
        require_confidence(GOLDEN_FILTER_TASK, conf)
        decision = "REJECT" if score < 0.5 else ("SAME" if score >= 1.5 else "KEEP")
        out.append({"relevance_decision": decision, "relevance_reason": f"jev score {score:.2f}", "llm_parse_ok": True})
    return out
