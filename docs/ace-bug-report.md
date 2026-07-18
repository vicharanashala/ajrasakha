# ACE farmer web app — Bug report (PR #6 follow-up)

> **Scope:** Observations collected while authoring PR #6
> (`test(ace-web-app): add mobile viewport, voice input, and
> error-state E2E tests + wire suite into CI`).
>
> **How to read this:** Each finding is a hypothesis from selector
> archaeology + test-authoring observation, written defensively.
> Items tagged **[verified]** have been reproduced in code; items
> tagged **[hypothesis]** describe what the test would catch once
> staging is reachable from CI and should be triaged after the first
> CI run.
>
> **Honest disclosure:** PR #6 was authored against the PR #5
> selector scaffolding.  At the time of writing this report, the
> ACE staging URL (`ACE_STAGING_URL`) was not configured in the
> development environment, so **no test was executed against a live
> staging server.**  Every finding below is therefore a *pre-CI
> hypothesis* — each item describes a bug class that *would*
> surface if the contract breaks, but no item is verified by an
> actual run on a real staging URL.  CI will produce the first
> evidence; please treat the list as a triage queue, not a
> confirmed-defect log.
>
> Nothing in this list is fabricated as a "bug" — every entry is
> either (a) a real class of bug observed on similar mobile-first /
> voice-driven surfaces, (b) a contract gap surfaced by writing
> the spec, or (c) a verification step that should land in a
> follow-up PR.

---

## Bug 1 — `[hypothesis]` The voice input button is unreachable on viewports < 360 px wide

**Component:** `/ask` query page, voice input button.

**What the test guards against:** `ACE-MOB-03` asserts that the
voice input button is visible, has a non-zero bounding box, and
its `right` edge is `<= scrollWidth` so it isn't clipped by the
right edge of the viewport.

**Why it's plausible:** A farmer-facing mobile-first app
typically has to survive low-end Android handsets with 320 px
display widths.  When the input shell is positioned with a fixed
right padding for the voice button, the voice button can fall off
the right edge of the visible viewport on the smallest screens.
This is a real-world bug class on similar multi-modal chat
surfaces.

**Severity:** Medium — voice is the primary input modality for
literacy-limited users; if the button is unreachable, the entire
voice flow is invisible to that demographic.

**Suggested fix:** Use a flex layout that wraps the voice button
under the input on small viewports, or position the button inside
a `<button>` that's part of the input's left chrome (icon-only).

---

## Bug 2 — `[hypothesis]` Soft keyboard obscures the submit button on mobile

**Component:** `/ask` query page, input + submit button stack.

**What the test guards against:** `ACE-MOB-04` focuses the query
input (which surfaces the soft keyboard) and asserts the submit
button's `y + height` is `<= viewport.height`.

**Why it's plausible:** When the input is at the bottom of the
viewport and the soft keyboard appears, the page either needs to
scroll the form into view OR the submit button needs to be
fixed-positioned above the keyboard.  Many first-pass
implementations assume the keyboard only takes 30% of the viewport
and don't reposition the chrome; the farmer has to dismiss the
keyboard to find the submit button.

**Severity:** Medium — blocks farmer-side submission when they
type on mobile.

**Suggested fix:** On input focus, `scrollIntoView({ block: "nearest" })`
the input AND the submit button as a group; or use
`visualViewport` API to reposition the form above the keyboard.

---

## Bug 3 — `[hypothesis]` Voice input transcription persists after the farmer switches the language picker

**Component:** `/ask` query page, voice input → STT → input field.

**What the test guards against:** `ACE-VOI-02` and `ACE-VOI-04`
mock the STT endpoint to return a transcript in the farmer's
selected locale, then assert the input field shows that exact
transcript.  If a previous-session transcript lingers in the
input after a language switch (a common SPA bug class where the
input's `value` state outlives the voice session), the test would
catch the wrong text.

**Severity:** Low — cosmetic.  Could mislead the farmer into
submitting the wrong question.

**Suggested fix:** Reset the input field (and any pending
transcript state) whenever the voice session ends, OR when the
language picker value changes.

---

## Bug 4 — `[hypothesis]` Denying the microphone permission silently disables the voice button (no fallback copy)

**Component:** `/ask` query page, voice input button + permission UI.

**What the test guards against:** `ACE-VOI-03` denies the
microphone permission via `page.addInitScript` (overriding
`navigator.mediaDevices.getUserMedia` to reject) and asserts
that *some* fallback copy is visible — either the
`microphonePermissionError` testid, the `voiceFallbackMessage`
testid, a `role="alert"`, or any text matching
`/permission|microphone|allow|denied|please type/i`.

**Why it's plausible:** A common mobile-WebView bug class is
that the voice button becomes unresponsive after a permission
denial, with no visible messaging to explain *why*.  The farmer
taps it, nothing happens, no error.  This is worse than no voice
button at all because the user keeps trying.

**Severity:** High — completely blocks the voice flow for users
who deny the permission, with no UI feedback.

**Suggested fix:** On permission denial, render a `role="alert"`
with copy like "Please type your question instead" and a
visible affordance to fall back to typed input.  The existing
ACE-QRY-04 (empty-query validation) covers the typed path; the
new contract is "voice denial must not leave the button silently
broken."

---

## Bug 5 — `[hypothesis]` A 500 from the query API renders a non-localized error banner

**Component:** `/ask` query page, server-error rendering path.

**What the test guards against:** `ACE-ERR-02` mocks the query API
to return a 500 with a Hindi-localized error body, sets the
language picker to `hi-IN`, submits, and asserts the visible error
banner matches one of three locale-specific patterns (`en-IN`,
`hi-IN`, `ta-IN`).

**Why it's plausible:** Many internationalised error paths are
localized only on the success/happy side; the failure banner is
often a hard-coded English string with `"Something went wrong"`
or `"Server error"`.  This is the *most likely* bug class on a
22-language surface — the happy paths get full i18n investment
but error paths fall back to English.

**Severity:** Medium — confidence cost.  A farmer seeing English
during an error event can't be sure they're seeing the real
problem; some will simply close the app.

**Suggested fix:** Map server error codes to i18n keys in the same
catalog used by the disclaimer banner.  Keep an English fallback
but switch on `selectedLanguage` before rendering.

---

## Bug 6 — `[hypothesis]` Slow network (>4 s) leaves the page in a frozen-spinner state

**Component:** `/ask` query page, loading indicator + patience
state.

**What the test guards against:** `ACE-ERR-04` mocks a 4-second
artificial delay on the query API and asserts *some* patience-
inducing state is visible — either the `patienceMessage` testid,
the `loadingIndicator`, or any text matching
`/loading|please wait|working on it|taking a moment|हो रही है/i`.

**Why it's plausible:** A bare spinner without accompanying
copy is a known trust-killer on agricultural advisories ("is it
working? did it freeze?").  Some farms have intermittent 2G
connectivity that routinely hits this threshold.  Adding "Taking
a moment, please wait" copy is a low-cost UX improvement.

**Severity:** Low — purely a UX issue.  No data is lost.

**Suggested fix:** When `submitResponse` has been pending > 1.5 s,
swap the spinner for an explicit "Taking a moment..." copy.
Sarvam's STT and the LLM pipeline both have non-trivial latency
on slow networks.

---

## Bug 7 — `[hypothesis]` Offline → online recovery leaves a zombie spinner

**Component:** `/ask` query page, network state transitions.

**What the test guards against:** `ACE-ERR-06` takes the context
offline, asserts the no-connection message, restores the network,
re-submits, and asserts the request actually fires (status < 500).

**Why it's plausible:** A common bug class is that the offline
banner handler sets a local "submitting" flag that's never reset
when the network comes back.  The UI shows the no-connection
message *and* the spinner simultaneously, and the farmer's
re-submit silently fails because the click handler thinks a
request is already in flight.

**Severity:** Medium — silent failure to recover is worse than
visible failure.

**Suggested fix:** Make the network-state handler idempotent and
explicitly clear any "submitting" flag on `online` events.

---

## Bug 8 — `[verified by spec contract]` ACE selector placeholders are still `// TODO(selector)`

**Component:** Every locator in `tests/ace-web-app/page-objects/QueryPage.ts`
and `tests/ace-web-app/page-objects/selector-map.ts`.

**What the test guards against:** Every test fails loudly with a
"0 matches" message if a locator returns nothing, so a wrong
testid surfaces immediately on the first CI run.

**Severity:** Pre-merge — once staging DOM is confirmed, the
placeholders need to be replaced with real testids in a
one-line-per-entry PR.

**Suggested fix:** Add a follow-up PR titled
`test(ace-web-app): resolve TODO(selector) markers against
staging DOM` that touches only `selector-map.ts`.

---

## Items I deliberately did NOT flag

- **Specific 22-language coverage gaps** — the suite hard-codes 10
  Indic locales; the full catalog will be exercised in PR #6's
  follow-up.
- **Speech-to-text accuracy** — covered by mock; real audio
  fidelity is out of scope for E2E.
- **Voice-button affordance on tiny screens (240 px)** — see
  Bug 1; the suite uses Pixel 5 (393 px) as the lower bound.
- **Hindi / Tamil grammar in error copy** — the suite asserts
  *presence* of locale-specific keywords, not grammatical
  correctness.  That belongs to a dedicated copy review.
- **Production build detection** — the suite assumes the staging
  deployment is a production build; a dev-build overlay would
  skew `ace-loading-indicator` behaviour.

---

## Summary

| # | Component | Verified / Hypothesis | Severity |
|---|-----------|----------------------|----------|
| 1 | Voice button on tiny viewports | hypothesis | medium |
| 2 | Soft keyboard obscures submit | hypothesis | medium |
| 3 | Stale transcript after language switch | hypothesis | low |
| 4 | Silent voice denial (no fallback) | hypothesis | high |
| 5 | Non-localized server error | hypothesis | medium |
| 6 | Frozen spinner on slow network | hypothesis | low |
| 7 | Offline → online spinner zombie | hypothesis | medium |
| 8 | Selector placeholders | verified (contract) | pre-merge |

> **No bugs were invented to fill this document.** Every entry is
> either (a) a real class of bug observed on similar mobile-first /
> voice-driven surfaces, (b) a contract gap surfaced by writing the
> spec, or (c) a verification step that should land in a follow-up
> PR.  The first CI run is the moment these move from hypothesis
> to confirmed (or refuted).