"""structural_validator tests. llm_client calls are monkeypatched - no real
network call. Every test scores against the one fixed checklist
(structural_validator.FIXED_STEPS, 10 steps) - no CSV-based domain/topic/
crop matching anymore (explicit team simplification)."""

import threading

from assistant import llm_client, structural_validator
from assistant.models import LLMUnavailableError, ReferenceStep, StepCoverage, StructuralValidationStatus

_NUM_STEPS = len(structural_validator.FIXED_STEPS)
_FIRST_STEP = structural_validator.FIXED_STEPS[0].step
_SECOND_STEP = structural_validator.FIXED_STEPS[1].step
_LAST_STEP = structural_validator.FIXED_STEPS[-1].step

# Every step's own example text, verbatim - a stand-in for "a draft that
# genuinely addresses every step". There's no deterministic override
# anymore (removed - it compared the draft against the step's own
# abstract example text, which doesn't share vocabulary with any real
# topic-specific draft; see score_coverage's comment), so the mocked
# coverage/section_index is what decides every test's outcome now - this
# draft's actual content is just for readability.
_FULL_DRAFT = " ".join(s.example for s in structural_validator.FIXED_STEPS)

# Content is irrelevant to the outcome (no textual-evidence check exists
# to react to it) - used for tests where the draft's content itself
# doesn't matter, only the mocked classify_step_coverage behavior does.
_UNRELATED_DRAFT = "The weather today is pleasant and farmers are busy with their daily chores around the village."


def _mock_all_steps(monkeypatch, coverage: StepCoverage, section_index: int = 1):
    def _classify(draft, question, steps, all_step_names):
        return {s.step: (coverage, section_index) for s in steps}

    monkeypatch.setattr(llm_client, "classify_all_steps_coverage", _classify)


# A skipped step is never checked at all (no call for it) and can never
# block completeness - a draft covering only the non-skipped steps is
# still COMPLETE, since completeness is defined over what was actually
# asked for.
def test_skipped_steps_are_excluded_and_dont_block_completeness(monkeypatch):
    seen_step_names = []

    def _record(draft, question, steps, all_step_names):
        seen_step_names.extend(s.step for s in steps)
        return {s.step: (StepCoverage.COVERED, 1) for s in steps}

    monkeypatch.setattr(llm_client, "classify_all_steps_coverage", _record)
    result = structural_validator.validate_structure(
        "q", _FULL_DRAFT, skip_steps=["Biological control", "Safety and PHI"]
    )

    assert "Biological control" not in seen_step_names
    assert "Safety and PHI" not in seen_step_names
    assert len(result.steps) == _NUM_STEPS - 2
    assert all(s.step not in ("Biological control", "Safety and PHI") for s in result.steps)
    assert result.status == StructuralValidationStatus.COMPLETE


def test_unrecognized_skip_step_name_is_a_no_op(monkeypatch):
    _mock_all_steps(monkeypatch, StepCoverage.COVERED)
    result = structural_validator.validate_structure("q", _FULL_DRAFT, skip_steps=["Not A Real Step"])
    assert len(result.steps) == _NUM_STEPS


def test_all_steps_covered_is_complete(monkeypatch):
    _mock_all_steps(monkeypatch, StepCoverage.COVERED)
    result = structural_validator.validate_structure("q", _FULL_DRAFT)
    assert result.status == StructuralValidationStatus.COMPLETE
    assert len(result.steps) == _NUM_STEPS


def test_missing_steps_reported_not_invented(monkeypatch):
    coverages = {_FIRST_STEP: (StepCoverage.COVERED, 1)}

    def _classify(draft, question, steps, all_step_names):
        return {s.step: coverages.get(s.step, (StepCoverage.MISSING, None)) for s in steps}

    monkeypatch.setattr(llm_client, "classify_all_steps_coverage", _classify)
    result = structural_validator.validate_structure("q", _FULL_DRAFT)

    assert result.status == StructuralValidationStatus.INCOMPLETE
    assert result.steps[0].coverage == StepCoverage.COVERED
    assert result.steps[-1].coverage == StepCoverage.MISSING
    # the missing step's own reference text is present, nothing generated
    assert result.steps[-1].example == structural_validator.FIXED_STEPS[-1].example


def test_partial_coverage_with_no_missing_step_is_partial(monkeypatch):
    _mock_all_steps(monkeypatch, StepCoverage.PARTIAL)
    result = structural_validator.validate_structure("q", _FULL_DRAFT)
    assert result.status == StructuralValidationStatus.PARTIAL


# ISS-08 (Writing Assistant Build Plan, Revision 14): the reference's
# suggestion text is "what's expected" explanation for a gap - it must
# never appear on an already-covered step, or it reads as an invented
# issue on a correct draft.
def test_covered_step_has_no_suggestion_text(monkeypatch):
    _mock_all_steps(monkeypatch, StepCoverage.COVERED)
    result = structural_validator.validate_structure("q", _FULL_DRAFT)
    assert result.steps[0].suggestion_1 is None
    assert result.steps[0].suggestion_2 is None


def test_partial_step_keeps_its_suggestion_text(monkeypatch):
    _mock_all_steps(monkeypatch, StepCoverage.PARTIAL)
    result = structural_validator.validate_structure("q", _FULL_DRAFT)
    assert result.steps[0].suggestion_1 == structural_validator.FIXED_STEPS[0].suggestion_1


# ISS-06 (Writing Assistant Build Plan, Revision 14): out-of-order sections
# are flagged, but only for steps whose position was confidently located.
def test_out_of_order_step_is_flagged(monkeypatch):
    # Step 1 located in section 2, step 2 located in section 1 - step 2
    # appears before step 1 in the draft.
    positions = {_FIRST_STEP: 2, _SECOND_STEP: 1}

    def _classify(draft, question, steps, all_step_names):
        return {s.step: (StepCoverage.COVERED, positions.get(s.step, 3)) for s in steps}

    monkeypatch.setattr(llm_client, "classify_all_steps_coverage", _classify)
    result = structural_validator.validate_structure("q", _FULL_DRAFT)
    assert len(result.order_warnings) == 1
    assert _SECOND_STEP in result.order_warnings[0]
    assert _FIRST_STEP in result.order_warnings[0]


def test_in_order_steps_have_no_warnings(monkeypatch):
    _mock_all_steps(monkeypatch, StepCoverage.COVERED, section_index=1)
    result = structural_validator.validate_structure("q", _FULL_DRAFT)
    assert result.order_warnings == []


def test_missing_step_never_gets_an_order_warning(monkeypatch):
    # A missing step has no position at all - must never be fabricated.
    def _classify(draft, question, steps, all_step_names):
        return {
            s.step: (StepCoverage.COVERED, 1) if s.step == _FIRST_STEP else (StepCoverage.MISSING, None)
            for s in steps
        }

    monkeypatch.setattr(llm_client, "classify_all_steps_coverage", _classify)
    result = structural_validator.validate_structure("q", _FULL_DRAFT)
    assert result.order_warnings == []


def test_llm_missing_is_trusted_as_is(monkeypatch):
    # No deterministic override anymore (removed - see score_coverage's
    # comment): the majority-voted LLM judgment is the only signal, even
    # when the draft genuinely does contain that step's vocabulary.
    _mock_all_steps(monkeypatch, StepCoverage.MISSING)
    result = structural_validator.validate_structure("q", _FULL_DRAFT)
    assert all(s.coverage == StepCoverage.MISSING for s in result.steps)


def test_a_step_omitted_from_the_models_response_is_not_assessed(monkeypatch):
    # The response schema doesn't force the model to include every
    # requested step - if it drops one, that step gets no vote from this
    # attempt (not "missing"), same fail-closed principle as a call that
    # fails outright.
    def _classify(draft, question, steps, all_step_names):
        return {s.step: (StepCoverage.COVERED, 1) for s in steps if s.step != _LAST_STEP}

    monkeypatch.setattr(llm_client, "classify_all_steps_coverage", _classify)
    result = structural_validator.validate_structure("q", _FULL_DRAFT)
    last = next(s for s in result.steps if s.step == _LAST_STEP)
    assert last.coverage == StepCoverage.NOT_ASSESSED


def test_coverage_scoring_unavailable_for_every_vote_marks_every_step_not_assessed(monkeypatch):
    # Every single checklist-call attempt fails - a single bad call no
    # longer aborts the whole request (see _vote_checklist), so this
    # reports every step as NOT_ASSESSED rather than failing the whole
    # response.
    def _raise(draft, question, steps, all_step_names):
        raise LLMUnavailableError("simulated outage")

    monkeypatch.setattr(llm_client, "classify_all_steps_coverage", _raise)
    result = structural_validator.validate_structure("q", _UNRELATED_DRAFT)
    assert result.status == StructuralValidationStatus.PARTIAL
    assert all(s.coverage == StepCoverage.NOT_ASSESSED for s in result.steps)


# Revision 16 (ISS-05, continued): confirmed live that a closing
# summary/conclusion-style step still got credited just because the
# facts it would summarize already existed in other, genuinely-present
# sections. The fix gives the model the full ordered list of every
# step's name as context, so it can tell "this is my own distinct
# topic" apart from "this is just a recap of a different step" - lock
# in the plumbing that passes that list through.
def test_classify_all_steps_coverage_receives_the_full_step_list_and_steps_to_score(monkeypatch):
    seen_calls = []
    lock = threading.Lock()

    def _record(draft, question, steps, all_step_names):
        with lock:
            seen_calls.append((tuple(s.step for s in steps), tuple(all_step_names)))
        return {s.step: (StepCoverage.COVERED, 1) for s in steps}

    monkeypatch.setattr(llm_client, "classify_all_steps_coverage", _record)
    structural_validator.validate_structure("q", _FULL_DRAFT)

    # The whole checklist is voted on up to 3x (majority vote, ISS-04/11
    # mitigation) at the CALL level now, not per-step - votes 1 and 2
    # agreeing here (both COVERED for every step) short-circuits the 3rd,
    # so this is 2 calls total for the entire 10-step checklist, each one
    # carrying every step to score plus the full step-name list for
    # context.
    assert len(seen_calls) == 2
    expected_names = tuple(s.step for s in structural_validator.FIXED_STEPS)
    for steps_to_score, all_step_names in seen_calls:
        assert steps_to_score == expected_names
        assert all_step_names == expected_names


# Revision 17 (ISS-04/11): the same exact (question, draft) submitted
# twice must return the exact same result, even if the underlying model
# would have judged it differently on a second real call.
def test_validate_structure_cached_is_deterministic_on_repeated_identical_input(monkeypatch):
    _mock_all_steps(monkeypatch, StepCoverage.COVERED)

    first = structural_validator.validate_structure_cached("q", _FULL_DRAFT)
    second = structural_validator.validate_structure_cached("q", _FULL_DRAFT)

    assert first is second
    assert first.steps[0].coverage == StepCoverage.COVERED


# A NOT_ASSESSED step is a transient failure wearing a "partial"/
# "incomplete" status - must never be cached, or a bad answer sticks to
# this input until restart even though a later identical request would
# succeed cleanly (Revision 18).
def test_validate_structure_cached_does_not_cache_a_not_assessed_step(monkeypatch):
    # Failure is now at the call level (see _vote_checklist) - this
    # simulates the model's response consistently omitting the last step
    # from its JSON array during the first pass (every attempt), present
    # again on the second pass.
    first_pass_done = {"flag": False}

    def _classify(draft, question, steps, all_step_names):
        results = {s.step: (StepCoverage.COVERED, 1) for s in steps}
        if not first_pass_done["flag"]:
            results.pop(_LAST_STEP, None)
        return results

    monkeypatch.setattr(llm_client, "classify_all_steps_coverage", _classify)

    first = structural_validator.validate_structure_cached("q2", _FULL_DRAFT)
    first_pass_done["flag"] = True
    second = structural_validator.validate_structure_cached("q2", _FULL_DRAFT)

    assert first.status == StructuralValidationStatus.PARTIAL
    assert any(s.coverage == StepCoverage.NOT_ASSESSED for s in first.steps)
    assert second.status == StructuralValidationStatus.COMPLETE
    assert first is not second  # not served from cache


# ISS-04/11 mitigation: the underlying model is not fully reproducible
# even at temperature=0 - majority-vote the one call most visibly prone
# to flipping. Re-architected from a per-step vote to a per-CALL vote
# (one call now scores the whole checklist at once) - see
# _CHECKLIST_VOTES' own comment in structural_validator.py.
_VOTE_STEPS = [ReferenceStep(sl_no=1, step="Introduction", example="Test the soil.")]


def test_vote_checklist_unanimous_passes_through(monkeypatch):
    monkeypatch.setattr(
        llm_client, "classify_all_steps_coverage",
        lambda *a, **kw: {"Introduction": (StepCoverage.COVERED, 3)},
    )
    result, corroborated = structural_validator._vote_checklist("draft", "q", _VOTE_STEPS, ["Introduction"])
    assert result == {"Introduction": (StepCoverage.COVERED, 3)}
    assert corroborated


def test_vote_checklist_majority_wins_over_minority(monkeypatch):
    votes = iter(
        [
            {"Introduction": (StepCoverage.PARTIAL, 2)},
            {"Introduction": (StepCoverage.COVERED, 1)},
            {"Introduction": (StepCoverage.COVERED, 1)},
        ]
    )
    monkeypatch.setattr(llm_client, "classify_all_steps_coverage", lambda *a, **kw: next(votes))
    result, corroborated = structural_validator._vote_checklist("draft", "q", _VOTE_STEPS, ["Introduction"])
    assert result == {"Introduction": (StepCoverage.COVERED, 1)}
    assert corroborated  # 2 of 3 agree


def test_vote_checklist_three_way_split_takes_the_most_cautious(monkeypatch):
    votes = iter(
        [
            {"Introduction": (StepCoverage.COVERED, 1)},
            {"Introduction": (StepCoverage.PARTIAL, 2)},
            {"Introduction": (StepCoverage.MISSING, None)},
        ]
    )
    monkeypatch.setattr(llm_client, "classify_all_steps_coverage", lambda *a, **kw: next(votes))
    result, corroborated = structural_validator._vote_checklist("draft", "q", _VOTE_STEPS, ["Introduction"])
    assert result == {"Introduction": (StepCoverage.MISSING, None)}
    assert not corroborated  # the winner is a tie-break, backed by one vote


# Live-confirmed: the combined-checklist call shape cuts a full request
# from ~30 coverage calls (10 fixed steps x 3 votes) down to ~2-3 total
# calls - a single failed attempt must still not fail the whole step.
def test_vote_checklist_one_failed_attempt_still_uses_the_others(monkeypatch):
    calls = {"n": 0}

    def _side_effect(*a, **kw):
        calls["n"] += 1
        if calls["n"] == 2:
            raise LLMUnavailableError("simulated outage")
        return {"Introduction": (StepCoverage.COVERED, 1)}

    monkeypatch.setattr(llm_client, "classify_all_steps_coverage", _side_effect)
    result, corroborated = structural_validator._vote_checklist("draft", "q", _VOTE_STEPS, ["Introduction"])
    assert result == {"Introduction": (StepCoverage.COVERED, 1)}
    assert corroborated  # the two votes that came back agree


def test_vote_checklist_all_attempts_failing_returns_not_assessed(monkeypatch):
    def _raise(*a, **kw):
        raise LLMUnavailableError("simulated outage")

    monkeypatch.setattr(llm_client, "classify_all_steps_coverage", _raise)
    result, corroborated = structural_validator._vote_checklist("draft", "q", _VOTE_STEPS, ["Introduction"])
    assert result == {"Introduction": (StepCoverage.NOT_ASSESSED, None)}
    assert not corroborated


# Live-confirmed on a slow host: votes 1 and 2 both timed out, and the
# fallback 3rd call alone marked a well-structured draft missing on every
# step. That lone vote is still the answer for this request, but it must
# not be cached - the next identical request re-runs instead of replaying
# an uncorroborated verdict until restart.
def test_single_surviving_vote_is_returned_but_not_cached(monkeypatch):
    calls = {"n": 0}
    lock = threading.Lock()

    def _classify(draft, question, steps, all_step_names):
        with lock:
            calls["n"] += 1
            n = calls["n"]
        if n <= 2:
            raise LLMUnavailableError("simulated timeout")
        return {s.step: (StepCoverage.MISSING, None) for s in steps}

    monkeypatch.setattr(llm_client, "classify_all_steps_coverage", _classify)

    first = structural_validator.validate_structure_cached("q3", _FULL_DRAFT)
    assert first.status == StructuralValidationStatus.INCOMPLETE
    assert calls["n"] == 3

    second = structural_validator.validate_structure_cached("q3", _FULL_DRAFT)
    assert second is not first  # recomputed, not served from cache
    assert calls["n"] > 3
