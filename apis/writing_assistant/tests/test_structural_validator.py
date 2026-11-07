"""structural_validator tests. llm_client calls are monkeypatched - no real
network call. Every test scores against the one fixed checklist
(structural_validator.FIXED_STEPS, 10 steps) - no CSV-based domain/topic/
crop matching anymore (explicit team simplification)."""

from assistant import llm_client, structural_validator
from assistant.models import LLMUnavailableError, ReferenceStep, StepCoverage, StructuralValidationStatus

_NUM_STEPS = len(structural_validator.FIXED_STEPS)
_FIRST_STEP = structural_validator.FIXED_STEPS[0].step
_SECOND_STEP = structural_validator.FIXED_STEPS[1].step
_LAST_STEP = structural_validator.FIXED_STEPS[-1].step

# Every step's own example text, verbatim - guarantees genuine textual
# evidence (Revision 15's deterministic safety net) for every one of the
# 10 steps, so a mocked coverage/section_index survives unchanged. Used
# whenever a test's mock is what should decide the outcome, not the
# safety net.
_FULL_DRAFT = " ".join(s.example for s in structural_validator.FIXED_STEPS)

# Shares no real (length>=4, non-stopword) vocabulary with any of the 10
# steps' example text - guarantees zero textual evidence everywhere, so
# the safety net downgrades every step to "missing" regardless of what
# classify_step_coverage claims. Used to test that override, and for
# tests where the draft's content is otherwise irrelevant (an outage).
_UNRELATED_DRAFT = "The weather today is pleasant and farmers are busy with their daily chores around the village."


def _mock_all_steps(monkeypatch, coverage: StepCoverage, section_index: int = 1):
    monkeypatch.setattr(
        llm_client, "classify_step_coverage",
        lambda draft, step, example, all_steps=None, question=None: (coverage, section_index),
    )


def test_all_steps_covered_is_complete(monkeypatch):
    _mock_all_steps(monkeypatch, StepCoverage.COVERED)
    result = structural_validator.validate_structure("q", _FULL_DRAFT)
    assert result.status == StructuralValidationStatus.COMPLETE
    assert len(result.steps) == _NUM_STEPS


def test_missing_steps_reported_not_invented(monkeypatch):
    coverages = {_FIRST_STEP: (StepCoverage.COVERED, 1)}

    def _classify(draft, step, example, all_steps=None, question=None):
        return coverages.get(step, (StepCoverage.MISSING, None))

    monkeypatch.setattr(llm_client, "classify_step_coverage", _classify)
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

    def _classify(draft, step, example, all_steps=None, question=None):
        return (StepCoverage.COVERED, positions.get(step, 3))

    monkeypatch.setattr(llm_client, "classify_step_coverage", _classify)
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
    def _classify(draft, step, example, all_steps=None, question=None):
        if step == _FIRST_STEP:
            return (StepCoverage.COVERED, 1)
        return (StepCoverage.MISSING, None)

    monkeypatch.setattr(llm_client, "classify_step_coverage", _classify)
    result = structural_validator.validate_structure("q", _FULL_DRAFT)
    assert result.order_warnings == []


# ISS-05 (Writing Assistant Build Plan, Revision 15): confirmed live that
# prompt tightening alone wasn't enough when a removed step's topic is
# still name-dropped once, in passing, in an unrelated section - the LLM
# still gave partial credit. A deterministic textual-evidence check now
# overrides that to "missing" when the step's own topic has no real
# presence anywhere in the draft.
def test_llm_overclaim_on_genuinely_absent_step_is_overridden_to_missing(monkeypatch):
    # The LLM (wrongly) says "partial" for every step, but the draft
    # shares no real vocabulary with any of them.
    _mock_all_steps(monkeypatch, StepCoverage.PARTIAL)
    result = structural_validator.validate_structure("q", _UNRELATED_DRAFT)
    assert all(s.coverage == StepCoverage.MISSING for s in result.steps)
    assert result.steps[-1].example == structural_validator.FIXED_STEPS[-1].example


def test_llm_missing_is_never_promoted_by_the_textual_check(monkeypatch):
    # The override only ever downgrades toward "missing" - it must never
    # promote a step the LLM already scored missing, even if the draft
    # genuinely does contain that step's vocabulary.
    _mock_all_steps(monkeypatch, StepCoverage.MISSING)
    result = structural_validator.validate_structure("q", _FULL_DRAFT)
    assert all(s.coverage == StepCoverage.MISSING for s in result.steps)


def test_coverage_scoring_unavailable_for_every_vote_marks_every_step_not_assessed(monkeypatch):
    # Every single vote call fails - a single bad call no longer aborts
    # the whole request (see _vote_step_coverage), so this reports every
    # step as NOT_ASSESSED rather than failing the whole response.
    def _raise(draft, step, example, all_steps=None, question=None):
        raise LLMUnavailableError("simulated outage")

    monkeypatch.setattr(llm_client, "classify_step_coverage", _raise)
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
def test_classify_step_coverage_receives_the_full_step_list(monkeypatch):
    seen_calls = []

    def _record(draft, step, example, all_steps=None, question=None):
        seen_calls.append(all_steps)
        return (StepCoverage.COVERED, 1)

    monkeypatch.setattr(llm_client, "classify_step_coverage", _record)
    structural_validator.validate_structure("q", _FULL_DRAFT)

    # Each step is voted on 3x (majority vote, ISS-04/11 mitigation) -
    # 10 steps x 3 votes = 30 calls, every one of them carrying the full
    # step list regardless of which vote it is.
    assert len(seen_calls) == _NUM_STEPS * structural_validator._COVERAGE_VOTES
    expected_names = [s.step for s in structural_validator.FIXED_STEPS]
    assert all(call == expected_names for call in seen_calls)


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
    calls = {"count": 0}

    def _classify_step_coverage(draft, step, example, all_steps=None, question=None):
        calls["count"] += 1
        # Every vote for the last step fails on the first computation
        # only (calls 1 through _NUM_STEPS*3 cover every step x3 votes,
        # in FIXED_STEPS order) - the second validate_structure_cached
        # call must recompute fresh, not reuse a stale NOT_ASSESSED
        # result.
        first_pass_calls = _NUM_STEPS * structural_validator._COVERAGE_VOTES
        if step == _LAST_STEP and calls["count"] <= first_pass_calls:
            raise LLMUnavailableError("simulated transient timeout")
        return (StepCoverage.COVERED, 1)

    monkeypatch.setattr(llm_client, "classify_step_coverage", _classify_step_coverage)

    first = structural_validator.validate_structure_cached("q2", _FULL_DRAFT)
    second = structural_validator.validate_structure_cached("q2", _FULL_DRAFT)

    assert first.status == StructuralValidationStatus.PARTIAL
    assert any(s.coverage == StepCoverage.NOT_ASSESSED for s in first.steps)
    assert second.status == StructuralValidationStatus.COMPLETE
    assert first is not second  # not served from cache


# ISS-04/11 mitigation: the underlying model is not fully reproducible
# even at temperature=0 - majority-vote the one call most visibly prone
# to flipping (per-step coverage) instead of trusting a single call.
_VOTE_STEP = ReferenceStep(sl_no=1, step="Introduction", example="Test the soil.")


def test_vote_step_coverage_unanimous_passes_through(monkeypatch):
    monkeypatch.setattr(llm_client, "classify_step_coverage", lambda *a, **kw: (StepCoverage.COVERED, 3))
    result = structural_validator._vote_step_coverage("draft", _VOTE_STEP, ["Introduction"], "q")
    assert result == (StepCoverage.COVERED, 3)


def test_vote_step_coverage_majority_wins_over_minority(monkeypatch):
    votes = iter([(StepCoverage.PARTIAL, 2), (StepCoverage.COVERED, 1), (StepCoverage.COVERED, 1)])
    monkeypatch.setattr(llm_client, "classify_step_coverage", lambda *a, **kw: next(votes))
    result = structural_validator._vote_step_coverage("draft", _VOTE_STEP, ["Introduction"], "q")
    assert result == (StepCoverage.COVERED, 1)


def test_vote_step_coverage_three_way_split_takes_the_most_cautious(monkeypatch):
    votes = iter([(StepCoverage.COVERED, 1), (StepCoverage.PARTIAL, 2), (StepCoverage.MISSING, None)])
    monkeypatch.setattr(llm_client, "classify_step_coverage", lambda *a, **kw: next(votes))
    result = structural_validator._vote_step_coverage("draft", _VOTE_STEP, ["Introduction"], "q")
    assert result == (StepCoverage.MISSING, None)


# Live-confirmed on real traffic: a full request needs ~30 coverage calls
# (10 fixed steps x 3 votes), and the self-hosted model's rare per-call
# stall becomes near-certain to hit at least one of them - so a single
# failed vote must no longer fail the whole step (or request).
def test_vote_step_coverage_one_failed_vote_still_uses_the_other_two(monkeypatch):
    # 2 real votes agree, 1 fails; majority of the votes that actually
    # came back wins.
    calls = {"n": 0}

    def _side_effect(*a, **kw):
        calls["n"] += 1
        if calls["n"] == 2:
            raise LLMUnavailableError("simulated outage")
        return (StepCoverage.COVERED, 1)

    monkeypatch.setattr(llm_client, "classify_step_coverage", _side_effect)
    result = structural_validator._vote_step_coverage("draft", _VOTE_STEP, ["Introduction"], "q")
    assert result == (StepCoverage.COVERED, 1)


def test_vote_step_coverage_all_votes_failing_returns_not_assessed(monkeypatch):
    def _raise(*a, **kw):
        raise LLMUnavailableError("simulated outage")

    monkeypatch.setattr(llm_client, "classify_step_coverage", _raise)
    result = structural_validator._vote_step_coverage("draft", _VOTE_STEP, ["Introduction"], "q")
    assert result == (StepCoverage.NOT_ASSESSED, None)
