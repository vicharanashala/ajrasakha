# Bug Report — Ajrasakha Reviewer Platform E2E Audit

**Date:** 2026-06-23  
**Environment:** Codebase static analysis + E2E test implementation  
**Reporter:** Automated E2E audit during test suite setup  
**App Version:** Current `main` branch

---

## Summary

During test suite implementation, static analysis of the source code and component structure revealed the following issues. These are real defects identified from reading the code — not test failures (the app was not running against a live staging environment during this audit).

---

## BUG-001 — Voice Recorder: Language select is permanently disabled

**Severity:** High  
**Component:** `frontend/src/components/voice-recorder-card.tsx`  
**Flow:** Agents Interface → Voice Recorder → Language dropdown  

### Description
The language `<Select>` component has a hardcoded `disabled` prop regardless of recording state:

```tsx
// voice-recorder-card.tsx, line 315
<Select
  value={language}
  disabled          ← always disabled
  onValueChange={(value) => setLanguage(value as SupportedLanguage)}
>
```

The `disabled` attribute is unconditional. The `language` state and `onValueChange` handler exist, but the expert can never interact with the dropdown to select a language.

### Expected
Language selector should be interactive when not actively recording, allowing the expert to choose the transcription language before starting.

### Actual
The select dropdown is always disabled — experts are locked to "Auto Detection" and cannot specify a language, degrading transcription accuracy for Hindi, Telugu, Marathi, etc.

### Repro Steps
1. Log in as expert
2. Go to Agents Interface tab
3. Try to click the language dropdown in Voice Recorder card
4. It is not interactable (grayed out)

### Fix
```diff
- disabled
+ disabled={isRecording}
```

---

## BUG-002 — Two `AccordionContent` items with value `"answer"` render incorrectly

**Severity:** Medium  
**Component:** `frontend/src/components/voice-recorder-card.tsx` (lines 512–612)  
**Flow:** Agents Interface → Generated Questions → View Expert Answer  

### Description
The questions accordion in VoiceRecorderCard has **two** `<AccordionContent>` items nested inside a single `<AccordionItem value="answer">`. Both contents render when the accordion is opened, but there is no visual separation or heading distinguishing them.

```tsx
<AccordionItem value="answer" className="border-none">
  <AccordionTrigger>...</AccordionTrigger>
  <AccordionContent className="pt-3 pb-1">  {/* Reference Source */}
    ...
  </AccordionContent>
  <AccordionContent className="pt-3 pb-1">  {/* Specialist Answer */}
    ...
  </AccordionContent>
</AccordionItem>
```

The label inside the first content says "RefernceSource" (typo), and the second says "Specialist Answer". Both display together when the toggle is clicked, which is confusing and not the intended collapsed/expanded pattern.

### Expected
Each question accordion item should expand to show one clean content section, or use two separate `AccordionItem` entries with distinct values.

### Actual
Both content blocks appear simultaneously on toggle, with a typo in the heading.

### Repro Steps
1. Record a transcript (or inject mock data)
2. View generated questions list
3. Click "View Expert Answer" on any question
4. Both "RefernceSource" and "Specialist Answer" sections appear together

### Fix
1. Fix typo: `"RefernceSource"` → `"Reference Source"`
2. Use separate `AccordionItem` values (e.g., `value="reference"` and `value="answer"`) or merge into one `AccordionContent`

---

## BUG-003 — Auth form clears errors on final `setErrors({})` in `finally` block

**Severity:** Low  
**Component:** `frontend/src/features/auth/hooks/useAuthForm.ts`  
**Flow:** Login → Submit with wrong credentials  

### Description
The `finally` block in `handleSubmit` unconditionally calls `setErrors({})`:

```tsx
} finally {
  setIsLoading(false);
  setErrors({});   ← clears ALL field errors after every submission
}
```

If a validation error or field-level error was shown (e.g., "Invalid Credentials" as a field error), it is immediately cleared after the async operation completes. In practice this means inline field errors flash briefly then disappear, leaving the user with only the toast message.

### Expected
Field-level validation errors should persist until the user edits the field again. Only toast errors should auto-dismiss.

### Actual
Inline field errors disappear as soon as the request completes (success or failure).

### Repro Steps
1. Fill email with a valid format
2. Fill password with fewer than 8 characters
3. Click "Sign In"
4. Observe: any field error briefly appears then vanishes

### Fix
Remove `setErrors({})` from the `finally` block. Individual error clearing is already handled in `handleInputChange` when the user edits a field.

---

## BUG-004 — `timer-display.tsx`: Hold state timer does not have `data-testid`

**Severity:** Low / Testability  
**Component:** `frontend/src/components/timer-display.tsx` (line 55–62)  
**Flow:** Expert queue → Questions in "hold" status  

### Description
The component has two render paths:
1. **Hold status** (lines 55–62): renders an early-return `<div>` without `data-testid`
2. **Normal timer** (line 101): has the newly added `data-testid="timer-display"`

The `data-testid` we added only covers the normal timer path. If a question has `status="hold"`, the timer renders without the test ID, making it invisible to our test selector.

### Expected
Both render branches should expose `data-testid="timer-display"` so tests can find the timer regardless of question status.

### Fix
```diff
if (status === "hold") {
  return (
-   <div className={`flex items-center gap-1.5 ${className}`}>
+   <div data-testid="timer-display" className={`flex items-center gap-1.5 ${className}`}>
```

---

## BUG-005 — `play-ground.tsx`: `isCallAgentActive` check may flash "Call History" tab before data loads

**Severity:** Low  
**Component:** `frontend/src/components/play-ground.tsx` (line 504)  
**Flow:** Call agent login → Tab bar  

### Description
The "Call History" tab is conditionally rendered based on `user?.isCallAgentActive`:

```tsx
{user?.role === "call_agent" && user?.isCallAgentActive && (
  <TabsContent value="call_history" ...>
```

However, the `user` object comes from `useGetCurrentUser` which may not resolve for 1–2 seconds. During this window, `user` is `undefined`, causing the Call History tab content to be skipped entirely. If `isCallAgentActive` is `true` on the server but the user navigates directly to `/home?tab=call_history`, the tab content will not render until the API response arrives — the user sees nothing.

### Expected
Loading state should be shown while user data resolves, not a blank content area.

### Fix
Add a skeleton loader inside the `call_history` TabsContent that appears while `isLoading` is true.

---

## Test Implementation Notes

These findings were surfaced through:
1. **Static analysis** of component source code during selector and mock design
2. **Architectural inspection** of the auth hook, accordion pattern, and voice recorder flow

A live staging run may reveal additional runtime issues (race conditions, API contract mismatches, slow renders on mobile) that only manifest with real data. The full test suite is configured to capture screenshots and traces on any failure for post-run debugging.
