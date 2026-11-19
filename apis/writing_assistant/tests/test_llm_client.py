"""llm_client's Gemini transport: request/response shape translation,
timeouts, retries, hedging, and the shared concurrency semaphore. The
tailnet-routing tests this file used to have (for the self-hosted MiniMax
client) are gone along with the proxy code itself - a public HTTPS API
needs no SOCKS routing."""

import threading
import time
from concurrent.futures import ThreadPoolExecutor

import httpx
import pytest

from assistant import config, llm_client
from assistant.models import LLMUnavailableError, ReferenceStep, StepCoverage


def _gemini_response(text: str):
    class _Resp:
        def raise_for_status(self):
            pass
        def json(self):
            return {"candidates": [{"content": {"parts": [{"text": text}]}}]}
    return _Resp()


# A real timeout like this (reported by the testing team, against the old
# MiniMax client) left zero trace in the server logs - llm_client had no
# logging at all. This confirms a failure is now actually diagnosable:
# which call, how long it ran, and how much input it was given, not just
# "Gemini call failed" with nothing else to go on.
def test_chat_completion_logs_call_name_elapsed_and_input_size_on_failure(monkeypatch, caplog):
    def _raise(*a, **kw):
        raise httpx.ReadTimeout("The read operation timed out")

    monkeypatch.setattr(llm_client, "_post", _raise)
    with caplog.at_level("ERROR", logger="writing_assistant.llm_client"):
        with pytest.raises(LLMUnavailableError):
            llm_client._chat_completion(
                [{"role": "system", "content": "sys"}, {"role": "user", "content": "a" * 500}],
                call_name="generate_polish",
            )
    assert len(caplog.records) == 1
    message = caplog.records[0].getMessage()
    assert "generate_polish" in message
    assert "input 503" in message  # "sys" (3 chars) + "a"*500 = 503
    assert "The read operation timed out" in message


# A stall-then-recover pattern was live-confirmed against the self-hosted
# MiniMax model (the serving stack occasionally stalling on a prompt
# before a plain retry succeeds), not yet re-confirmed against Gemini -
# but one retry on a genuine network-level failure recovering the result
# instead of surfacing a step as not_assessed is provider-agnostic
# behavior worth keeping regardless.
def test_chat_completion_retries_once_and_returns_the_successful_result(monkeypatch):
    calls = {"count": 0}

    def _fail_then_succeed(*a, **kw):
        calls["count"] += 1
        if calls["count"] == 1:
            raise httpx.ReadTimeout("The read operation timed out")
        return _gemini_response("recovered")

    monkeypatch.setattr(llm_client, "_post", _fail_then_succeed)
    result = llm_client._chat_completion([{"role": "user", "content": "hi"}])
    assert result == "recovered"
    assert calls["count"] == 2


def _status_response(status: int):
    request = httpx.Request("POST", "https://example.invalid")
    return httpx.Response(status, request=request, json={"error": {"code": status}})


# A 4xx fails identically on an immediate retry, and retrying a 429 only
# adds load to an already-exhausted quota - so no second attempt.
@pytest.mark.parametrize("status", [400, 403, 429])
def test_chat_completion_does_not_retry_a_4xx(monkeypatch, status):
    calls = {"count": 0}

    def _client_error(*a, **kw):
        calls["count"] += 1
        return _status_response(status)

    monkeypatch.setattr(llm_client, "_post", _client_error)
    with pytest.raises(LLMUnavailableError):
        llm_client._chat_completion([{"role": "user", "content": "hi"}])
    assert calls["count"] == 1


# 408 is a timeout and 5xx a server-side hiccup - both still get the retry.
@pytest.mark.parametrize("status", [408, 500, 503])
def test_chat_completion_retries_a_408_or_5xx(monkeypatch, status):
    calls = {"count": 0}

    def _fail_then_succeed(*a, **kw):
        calls["count"] += 1
        return _status_response(status) if calls["count"] == 1 else _gemini_response("recovered")

    monkeypatch.setattr(llm_client, "_post", _fail_then_succeed)
    assert llm_client._chat_completion([{"role": "user", "content": "hi"}]) == "recovered"
    assert calls["count"] == 2


# Hedging (racing a second, independent attempt once the first runs past
# the typical latency window) was built against evidence the self-hosted
# MiniMax model's slow tail was transient GPU compute contention, not a
# fixed property of one prompt - carried over for Gemini at the team's
# request (see llm_client.py's _HEDGE_DELAY_SECONDS comment), not yet
# re-confirmed Gemini's own occasional slow call has the same cause.
def test_chat_completion_hedges_a_slow_attempt_and_returns_the_faster_result(monkeypatch):
    monkeypatch.setattr(llm_client, "_HEDGE_DELAY_SECONDS", 0.05)
    calls = {"n": 0}
    lock = threading.Lock()
    slow_release = threading.Event()

    def _fake_post(url, json, headers, timeout):
        with lock:
            calls["n"] += 1
            call_num = calls["n"]
        if call_num == 1:
            # Attempt 1 stays "running" past the hedge delay on purpose,
            # so the hedge (attempt 2) is the one that actually resolves
            # first - released at the end so the thread doesn't leak
            # past the test.
            slow_release.wait(timeout=5)
        return _gemini_response(f"result-{call_num}")

    monkeypatch.setattr(llm_client, "_post", _fake_post)
    t0 = time.monotonic()
    result = llm_client._chat_completion([{"role": "user", "content": "hi"}])
    elapsed = time.monotonic() - t0

    assert result == "result-2"
    assert calls["n"] == 2
    # Must return as soon as the hedge wins, not block on attempt 1.
    assert elapsed < 1.0
    slow_release.set()


def test_chat_completion_hedge_fails_when_both_attempts_fail(monkeypatch):
    monkeypatch.setattr(llm_client, "_HEDGE_DELAY_SECONDS", 0.05)
    calls = {"n": 0}
    lock = threading.Lock()

    def _slow_fail(*a, **kw):
        with lock:
            calls["n"] += 1
        time.sleep(0.2)  # stays "running" past the hedge delay
        raise httpx.ReadTimeout("The read operation timed out")

    monkeypatch.setattr(llm_client, "_post", _slow_fail)
    with pytest.raises(LLMUnavailableError):
        llm_client._chat_completion([{"role": "user", "content": "hi"}])
    assert calls["n"] == 2


# One deadline for the whole logical call: the hedge gets only what's left
# of the budget, not a fresh full one - otherwise a hedge fired at 18s on
# a 30s budget stretched a single call to ~48s.
def test_chat_completion_hedge_only_gets_the_remaining_budget(monkeypatch):
    monkeypatch.setattr(llm_client, "_HEDGE_DELAY_SECONDS", 0.3)
    timeouts = []
    lock = threading.Lock()
    release = threading.Event()

    def _fake_post(url, json, headers, timeout):
        with lock:
            timeouts.append(timeout)
            n = len(timeouts)
        if n == 1:
            release.wait(timeout=5)  # primary stalls past the hedge delay
        return _gemini_response(f"result-{n}")

    monkeypatch.setattr(llm_client, "_post", _fake_post)
    assert llm_client._chat_completion([{"role": "user", "content": "hi"}], timeout=10) == "result-2"
    release.set()

    assert timeouts[0] == 10
    assert timeouts[1] <= 10 - 0.3


def test_chat_completion_fast_success_never_triggers_a_hedge(monkeypatch):
    monkeypatch.setattr(llm_client, "_HEDGE_DELAY_SECONDS", 0.05)
    calls = {"n": 0}

    def _fast_success(*a, **kw):
        calls["n"] += 1
        return _gemini_response("ok")

    monkeypatch.setattr(llm_client, "_post", _fast_success)
    result = llm_client._chat_completion([{"role": "user", "content": "hi"}])
    assert result == "ok"
    assert calls["n"] == 1


# Live-confirmed real bug (against MiniMax): hedging fires its second
# attempt from its own private 2-worker pool, independent of
# run_concurrent's shared GEMINI_MAX_CONCURRENT_CALLS-sized pool -
# without a shared gate on the actual network call, several logical
# calls hedging at once could push real concurrent calls to 2x the tuned
# cap, straight back into the contention zone the cap exists to avoid.
# The semaphore must cap TOTAL real calls (primary + hedge, across every
# logical _chat_completion in flight), not just how many logical items
# run at once. Carried over verbatim for Gemini.
def test_concurrency_semaphore_caps_total_real_calls_including_hedges(monkeypatch):
    monkeypatch.setattr(llm_client, "_concurrency_semaphore", threading.BoundedSemaphore(2))
    monkeypatch.setattr(llm_client, "_HEDGE_DELAY_SECONDS", 0.05)
    lock = threading.Lock()
    state = {"current": 0, "max_seen": 0, "completed": 0}

    def _fake_post(url, json, headers, timeout):
        with lock:
            state["current"] += 1
            state["max_seen"] = max(state["max_seen"], state["current"])
        time.sleep(0.1)  # outlives the hedge delay, so every logical call also fires a hedge
        with lock:
            state["current"] -= 1
            state["completed"] += 1
        return _gemini_response("ok")

    monkeypatch.setattr(llm_client, "_post", _fake_post)

    # 4 logical calls at once, each wanting up to 2 real calls (primary +
    # hedge) - 8 total if unbounded, must never exceed the semaphore's 2.
    with ThreadPoolExecutor(max_workers=4) as ex:
        futures = [ex.submit(llm_client._chat_completion, [{"role": "user", "content": "hi"}]) for _ in range(4)]
        for fut in futures:
            assert fut.result() == "ok"

    # _chat_completion intentionally doesn't wait for a "losing" hedge
    # attempt to finish (shutdown(wait=False) - see its own comment) -
    # so a loser can still be mid-mock-call here. Wait it out before
    # returning, or monkeypatch reverts _post/_concurrency_semaphore
    # while that straggler is still using them, and it falls through to
    # a REAL network call once it finally runs.
    deadline = time.monotonic() + 3.0
    while state["completed"] < 8 and time.monotonic() < deadline:
        time.sleep(0.02)

    assert state["max_seen"] <= 2


def test_chat_completion_gives_up_after_the_retry_also_fails(monkeypatch):
    calls = {"count": 0}

    def _always_fail(*a, **kw):
        calls["count"] += 1
        raise httpx.ReadTimeout("The read operation timed out")

    monkeypatch.setattr(llm_client, "_post", _always_fail)
    with pytest.raises(LLMUnavailableError):
        llm_client._chat_completion([{"role": "user", "content": "hi"}])
    assert calls["count"] == 2  # tried twice, not endlessly


# A malformed response (not a network failure) is never retried - the
# identical request would just produce the identical malformed response.
def test_chat_completion_does_not_retry_a_malformed_response(monkeypatch):
    calls = {"count": 0}

    def _malformed(*a, **kw):
        calls["count"] += 1
        class _Resp:
            def raise_for_status(self):
                pass
            def json(self):
                return {"candidates": []}  # no content to read - LLMUnavailableError, not hedged
        return _Resp()

    monkeypatch.setattr(llm_client, "_post", _malformed)
    with pytest.raises(LLMUnavailableError):
        llm_client._chat_completion([{"role": "user", "content": "hi"}])
    assert calls["count"] == 1  # not retried


def test_chat_completion_does_not_retry_a_candidate_with_no_text(monkeypatch):
    calls = {"count": 0}

    def _blocked(*a, **kw):
        calls["count"] += 1
        class _Resp:
            def raise_for_status(self):
                pass
            def json(self):
                return {"candidates": [{"content": {"parts": []}, "finishReason": "SAFETY"}]}
        return _Resp()

    monkeypatch.setattr(llm_client, "_post", _blocked)
    with pytest.raises(LLMUnavailableError):
        llm_client._chat_completion([{"role": "user", "content": "hi"}])
    assert calls["count"] == 1  # not retried, same as any other malformed/empty response


# Some Gemini responses wrap answer text in a markdown code fence even
# when asked for plain JSON - the same failure shape MiniMax had.
def test_strip_markdown_fence_removes_a_json_fence():
    content = '\n\n```json\n{"domain": "Pest Management", "question_type": "Broad"}\n```\n'
    assert llm_client._strip_markdown_fence(content) == '{"domain": "Pest Management", "question_type": "Broad"}'


def test_strip_markdown_fence_removes_a_bare_fence():
    content = "```\nplain text answer\n```"
    assert llm_client._strip_markdown_fence(content) == "plain text answer"


def test_strip_markdown_fence_leaves_unfenced_content_unchanged():
    content = '{"domain": "Pest Management"}'
    assert llm_client._strip_markdown_fence(content) == content


def test_strip_markdown_fence_leaves_a_partial_fence_unchanged():
    # Only a real backtick-containing answer, not this service's own
    # confirmed failure shape - don't risk mangling it.
    content = 'The answer mentions a ```code``` style convention.'
    assert llm_client._strip_markdown_fence(content) == content


def test_chat_completion_strips_a_json_fence_so_the_caller_can_parse_it(monkeypatch):
    def _fenced_response(*a, **kw):
        return _gemini_response('\n\n```json\n{"domain": "Pest Management", "question_type": "Broad"}\n```\n')

    monkeypatch.setattr(llm_client, "_post", _fenced_response)
    content = llm_client._chat_completion([{"role": "user", "content": "hi"}])
    assert content == '{"domain": "Pest Management", "question_type": "Broad"}'
    import json
    json.loads(content)  # must not raise - this is the real bug being fixed


def test_chat_completion_defaults_to_the_shared_timeout_budget(monkeypatch):
    seen = {}

    def _fake_post(url, json, headers, timeout):
        seen["timeout"] = timeout
        return _gemini_response("ok")

    monkeypatch.setattr(llm_client, "_post", _fake_post)
    llm_client._chat_completion([{"role": "user", "content": "hi"}])
    assert seen["timeout"] == config.GEMINI_TIMEOUT_SECONDS


# classify_all_steps_coverage runs up to 3x per request (majority vote,
# at the whole-checklist level - see structural_validator._CHECKLIST_VOTES),
# not 30x like the old per-step design - so it still gets a conservative
# bump over the shared default rather than a large one.
def test_classify_all_steps_coverage_uses_its_own_timeout_budget(monkeypatch):
    seen = {}

    def _fake_post(url, json, headers, timeout):
        seen["timeout"] = timeout
        return _gemini_response('[{"step": "a step", "coverage": "covered", "section_index": 1}]')

    monkeypatch.setattr(llm_client, "_post", _fake_post)
    step = ReferenceStep(sl_no=1, step="a step", example="an example")
    llm_client.classify_all_steps_coverage("draft text", "a question", [step], ["a step"])
    assert seen["timeout"] == config.GEMINI_COVERAGE_TIMEOUT_SECONDS
    assert seen["timeout"] != config.GEMINI_TIMEOUT_SECONDS


def test_coverage_timeout_for_is_flat_below_the_scaling_start():
    assert llm_client._coverage_timeout_for(0) == config.GEMINI_COVERAGE_TIMEOUT_SECONDS
    assert (
        llm_client._coverage_timeout_for(llm_client._COVERAGE_SCALE_START_CHARS)
        == config.GEMINI_COVERAGE_TIMEOUT_SECONDS
    )


def test_coverage_timeout_for_is_flat_at_and_above_the_scaling_end():
    assert (
        llm_client._coverage_timeout_for(llm_client._COVERAGE_SCALE_END_CHARS)
        == config.GEMINI_COVERAGE_MAX_TIMEOUT_SECONDS
    )
    assert (
        llm_client._coverage_timeout_for(llm_client._COVERAGE_SCALE_END_CHARS * 10)
        == config.GEMINI_COVERAGE_MAX_TIMEOUT_SECONDS
    )


def test_coverage_timeout_for_scales_linearly_between_the_thresholds():
    midpoint = (llm_client._COVERAGE_SCALE_START_CHARS + llm_client._COVERAGE_SCALE_END_CHARS) / 2
    expected = (config.GEMINI_COVERAGE_TIMEOUT_SECONDS + config.GEMINI_COVERAGE_MAX_TIMEOUT_SECONDS) / 2
    assert llm_client._coverage_timeout_for(midpoint) == pytest.approx(expected)


# A long draft is exactly the case that used to be a guaranteed timeout
# (every vote sends the same oversized input and hits the same fixed
# budget) - confirms the real call site actually gets the scaled-up
# budget, not just the helper function in isolation.
def test_classify_all_steps_coverage_scales_timeout_up_for_a_long_draft(monkeypatch):
    seen = {}

    def _fake_post(url, json, headers, timeout):
        seen["timeout"] = timeout
        return _gemini_response('[{"step": "a step", "coverage": "covered", "section_index": 1}]')

    monkeypatch.setattr(llm_client, "_post", _fake_post)
    step = ReferenceStep(sl_no=1, step="a step", example="an example")
    long_draft = "A fairly long sentence about crop management. " * 200
    llm_client.classify_all_steps_coverage(long_draft, "a question", [step], ["a step"])
    assert seen["timeout"] > config.GEMINI_COVERAGE_TIMEOUT_SECONDS
    assert seen["timeout"] <= config.GEMINI_COVERAGE_MAX_TIMEOUT_SECONDS


# A short draft must stay exactly as fast as it is today - scaling must
# never show up for the common case, only for a genuinely long draft.
def test_classify_all_steps_coverage_does_not_scale_timeout_for_a_short_draft(monkeypatch):
    seen = {}

    def _fake_post(url, json, headers, timeout):
        seen["timeout"] = timeout
        return _gemini_response('[{"step": "a step", "coverage": "covered", "section_index": 1}]')

    monkeypatch.setattr(llm_client, "_post", _fake_post)
    step = ReferenceStep(sl_no=1, step="a step", example="an example")
    llm_client.classify_all_steps_coverage("A short draft.", "a question", [step], ["a step"])
    assert seen["timeout"] == config.GEMINI_COVERAGE_TIMEOUT_SECONDS


# The hedge must defer proportionally with a scaled-up budget, not fire
# at the flat default early on a call already expected to run long -
# verified by making the primary attempt hang past the flat default
# (18s) but resolve well within the scaled hedge delay, with only one
# attempt ever reaching _post.
def test_classify_all_steps_coverage_hedge_defers_for_a_long_draft(monkeypatch):
    calls = {"count": 0}
    release = threading.Event()

    def _slow_then_done(url, json, headers, timeout):
        calls["count"] += 1
        release.wait(timeout=5)
        return _gemini_response('[{"step": "a step", "coverage": "covered", "section_index": 1}]')

    monkeypatch.setattr(llm_client, "_post", _slow_then_done)
    monkeypatch.setattr(llm_client, "_HEDGE_DELAY_SECONDS", 0.2)
    step = ReferenceStep(sl_no=1, step="a step", example="an example")
    long_draft = "A fairly long sentence about crop management. " * 200

    def _release_after(seconds):
        time.sleep(seconds)
        release.set()

    releaser = threading.Thread(target=_release_after, args=(0.4,))
    releaser.start()
    result = llm_client.classify_all_steps_coverage(long_draft, "a question", [step], ["a step"])
    releaser.join()
    assert result["a step"][0] == StepCoverage.COVERED
    # The flat 0.2s default would have hedged well before the 0.4s
    # release and fired a second attempt; the scaled delay (60% of the
    # long draft's bigger budget) must not have.
    assert calls["count"] == 1


# Results are matched back by step name, so the response schema pins
# "step" to the exact names being scored - a mis-echoed name (en-dash
# for hyphen, different casing) can't silently cost a step its vote.
def test_classify_all_steps_coverage_constrains_step_to_the_requested_names(monkeypatch):
    seen = {}

    def _fake_post(url, json, headers, timeout):
        seen["payload"] = json
        return _gemini_response('[{"step": "Severity - impact", "coverage": "covered", "section_index": 1}]')

    monkeypatch.setattr(llm_client, "_post", _fake_post)
    steps = [
        ReferenceStep(sl_no=1, step="Introduction", example="ex"),
        ReferenceStep(sl_no=4, step="Severity - impact", example="ex"),
    ]
    llm_client.classify_all_steps_coverage("draft", "q", steps, [s.step for s in steps])
    schema = seen["payload"]["generationConfig"]["responseSchema"]
    assert schema["items"]["properties"]["step"]["enum"] == ["Introduction", "Severity - impact"]


# generate_polish and check_meaning_preserved_batch each run once per
# request (not 3x like step coverage), so they share a dedicated budget,
# same reasoning as classify_all_steps_coverage's.
def test_generate_polish_uses_the_polish_timeout_budget(monkeypatch):
    seen = {}

    def _fake_post(url, json, headers, timeout):
        seen["timeout"] = timeout
        return _gemini_response("polished text")

    monkeypatch.setattr(llm_client, "_post", _fake_post)
    llm_client.generate_polish("draft text")
    assert seen["timeout"] == config.GEMINI_POLISH_TIMEOUT_SECONDS
    assert seen["timeout"] != config.GEMINI_TIMEOUT_SECONDS


def test_check_meaning_preserved_batch_uses_the_polish_timeout_budget(monkeypatch):
    seen = {}

    def _fake_post(url, json, headers, timeout):
        seen["timeout"] = timeout
        return _gemini_response('[{"index": 0, "changed": false, "explanation": ""}]')

    monkeypatch.setattr(llm_client, "_post", _fake_post)
    llm_client.check_meaning_preserved_batch([("original", "rewrite")])
    assert seen["timeout"] == config.GEMINI_POLISH_TIMEOUT_SECONDS
    assert seen["timeout"] != config.GEMINI_TIMEOUT_SECONDS


def test_check_meaning_preserved_batch_returns_empty_for_no_pairs():
    assert llm_client.check_meaning_preserved_batch([]) == []


def test_check_meaning_preserved_batch_reorders_by_index(monkeypatch):
    # The model's own JSON array order isn't trusted - results are
    # re-indexed from each item's own "index" field.
    def _fake_post(url, json, headers, timeout):
        return _gemini_response(
            '[{"index": 1, "changed": true, "explanation": "b"}, '
            '{"index": 0, "changed": false, "explanation": "a"}]'
        )

    monkeypatch.setattr(llm_client, "_post", _fake_post)
    result = llm_client.check_meaning_preserved_batch([("o1", "r1"), ("o2", "r2")])
    assert result == [(False, "a"), (True, "b")]


def test_check_meaning_preserved_batch_raises_when_an_index_is_missing(monkeypatch):
    def _fake_post(url, json, headers, timeout):
        return _gemini_response('[{"index": 0, "changed": false, "explanation": ""}]')

    monkeypatch.setattr(llm_client, "_post", _fake_post)
    with pytest.raises(LLMUnavailableError):
        llm_client.check_meaning_preserved_batch([("o1", "r1"), ("o2", "r2")])


# The system message is translated into Gemini's own systemInstruction
# field; the user message is the only entry in "contents".
def test_chat_completion_translates_system_and_user_messages_to_gemini_shape(monkeypatch):
    seen = {}

    def _fake_post(url, json, headers, timeout):
        seen["payload"] = json
        seen["headers"] = headers
        return _gemini_response("ok")

    monkeypatch.setattr(llm_client, "_post", _fake_post)
    llm_client._chat_completion([{"role": "system", "content": "be nice"}, {"role": "user", "content": "hi"}])
    assert seen["payload"]["systemInstruction"]["parts"][0]["text"] == "be nice"
    assert seen["payload"]["contents"] == [{"role": "user", "parts": [{"text": "hi"}]}]
    # The key travels in a header, never in the URL/query string.
    assert seen["headers"]["x-goog-api-key"] == config.GEMINI_API_KEY


# generate_polish now tries ONE whole-document call first - Gemini's
# larger context and better instruction-following make this reliable
# (live-confirmed: exact heading/fact preservation across a 10-section
# draft in one call), unlike the self-hosted MiniMax model this service
# used before, where the whole-document version reliably stalled/timed
# out and per-section calls were required. The per-section path
# (_generate_polish_per_section) still exists as a fallback - see the
# tests further below.
def test_generate_polish_whole_document_makes_one_call(monkeypatch):
    calls = {"n": 0}

    def _fake_post(url, json, headers, timeout):
        calls["n"] += 1
        content = json["contents"][0]["parts"][0]["text"]
        assert content == "First section.\n\nSecond section."
        return _gemini_response("FIRST SECTION.\n\nSECOND SECTION.")

    monkeypatch.setattr(llm_client, "_post", _fake_post)
    result, failed_sections = llm_client.generate_polish("First section.\n\nSecond section.")
    assert calls["n"] == 1
    assert result == "FIRST SECTION.\n\nSECOND SECTION."
    assert failed_sections == []


def test_generate_polish_single_section_draft_makes_one_call(monkeypatch):
    calls = {"n": 0}
    lock = threading.Lock()

    def _fake_post(url, json, headers, timeout):
        with lock:
            calls["n"] += 1
        return _gemini_response("polished")

    monkeypatch.setattr(llm_client, "_post", _fake_post)
    result, failed_sections = llm_client.generate_polish("Just one paragraph, no blank lines.")
    assert calls["n"] == 1
    assert result == "polished"
    assert failed_sections == []


# A section count mismatch (the whole-document call dropped/merged a
# section) is not safe to reassemble - treated as a failed attempt, which
# falls back to the per-section path, rather than returned as-is.
def test_generate_polish_falls_back_when_section_count_mismatches(monkeypatch):
    def _fake_post(url, json, headers, timeout):
        content = json["contents"][0]["parts"][0]["text"]
        if content == "Good section.\n\nAnother good one.":
            # The whole-document attempt merges the two sections into one.
            return _gemini_response("GOOD SECTION. ANOTHER GOOD ONE.")
        return _gemini_response(content.upper())

    monkeypatch.setattr(llm_client, "_post", _fake_post)
    result, failed_sections = llm_client.generate_polish("Good section.\n\nAnother good one.")
    # Recovered via the per-section fallback - two sections in, two out.
    assert result == "GOOD SECTION.\n\nANOTHER GOOD ONE."
    assert failed_sections == []


def test_generate_polish_falls_back_to_per_section_when_whole_document_call_fails(monkeypatch):
    def _fake_post(url, json, headers, timeout):
        content = json["contents"][0]["parts"][0]["text"]
        if content in ("Good section.\n\nBad section.\n\nAnother good one.", "Bad section."):
            raise httpx.ReadTimeout("The read operation timed out")
        return _gemini_response(content.upper())

    monkeypatch.setattr(llm_client, "_post", _fake_post)
    result, failed_sections = llm_client.generate_polish("Good section.\n\nBad section.\n\nAnother good one.")
    # The whole-document attempt failed outright, so this fell back to
    # the per-section path - section 2 ("Bad section.") is the one whose
    # own call failed there too, same as the per-section path's own
    # tests below.
    assert result == "GOOD SECTION.\n\nBad section.\n\nANOTHER GOOD ONE."
    assert failed_sections == [2]


# The per-section fallback's own behavior, tested directly rather than
# via generate_polish's whole-document attempt (which would need to be
# made to fail first, on every test, just to reach this code path).
def test_per_section_fallback_makes_one_call_per_section_and_reassembles(monkeypatch):
    seen_inputs = []
    lock = threading.Lock()

    def _fake_post(url, json, headers, timeout):
        content = json["contents"][0]["parts"][0]["text"]
        with lock:
            seen_inputs.append(content)
        return _gemini_response(content.upper())

    monkeypatch.setattr(llm_client, "_post", _fake_post)
    result, failed_sections = llm_client._generate_polish_per_section("First section.\n\nSecond section.")
    # Sections are dispatched concurrently (run_concurrent) - call order
    # isn't guaranteed, only that each section was sent exactly once.
    assert sorted(seen_inputs) == ["First section.", "Second section."]
    # Reassembly is still positional, regardless of completion order.
    assert result == "FIRST SECTION.\n\nSECOND SECTION."
    assert failed_sections == []


def test_per_section_fallback_one_failed_section_falls_back_to_original_text(monkeypatch):
    def _fake_post(url, json, headers, timeout):
        content = json["contents"][0]["parts"][0]["text"]
        if content == "Bad section.":
            raise httpx.ReadTimeout("The read operation timed out")
        return _gemini_response(content.upper())

    monkeypatch.setattr(llm_client, "_post", _fake_post)
    result, failed_sections = llm_client._generate_polish_per_section(
        "Good section.\n\nBad section.\n\nAnother good one."
    )
    assert result == "GOOD SECTION.\n\nBad section.\n\nANOTHER GOOD ONE."
    # Section 2 ("Bad section.") is the one whose own call failed - callers
    # (operations.polish_draft) need this to tell a full success apart
    # from a silent partial one.
    assert failed_sections == [2]


def test_per_section_fallback_raises_only_when_every_section_fails(monkeypatch):
    def _raise(*a, **kw):
        raise httpx.ReadTimeout("The read operation timed out")

    monkeypatch.setattr(llm_client, "_post", _raise)
    with pytest.raises(LLMUnavailableError):
        llm_client._generate_polish_per_section("One section.\n\nAnother section.")


# A section that fails while running concurrently with its siblings (and
# their load on the model) gets one more try strictly on its own, after
# everything else has already finished - recovers the old fully-
# sequential implementation's reliability for exactly the section that
# needs it, without slowing down the sections that didn't fail.
def test_per_section_fallback_recovers_a_failed_section_via_sequential_retry(monkeypatch):
    lock = threading.Lock()
    attempts = {"n": 0}

    def _fake_post(url, json, headers, timeout):
        content = json["contents"][0]["parts"][0]["text"]
        if content == "Bad section.":
            with lock:
                attempts["n"] += 1
                n = attempts["n"]
            if n <= 2:
                # Fails both attempts of the concurrent pass (no hedge
                # fires here - the mock fails instantly, so
                # _chat_completion's fast-failure path retries
                # immediately rather than waiting out the hedge delay).
                raise httpx.ReadTimeout("The read operation timed out")
            # Succeeds once it's retried on its own, sequentially.
        return _gemini_response(content.upper())

    monkeypatch.setattr(llm_client, "_post", _fake_post)
    result, failed_sections = llm_client._generate_polish_per_section(
        "Good section.\n\nBad section.\n\nAnother good one."
    )

    assert result == "GOOD SECTION.\n\nBAD SECTION.\n\nANOTHER GOOD ONE."
    assert failed_sections == []
