import { test, expect } from "@playwright/test";

test.describe("SLA Countdown & HOLD Workflow E2E", () => {
  test.describe.configure({ mode: "serial" });

  let isHeld = false;
  let holdTimestamp: string | undefined = undefined;
  let accumulatedHold = 0;

  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      if (msg.type() === 'error') console.error(`BROWSER ERROR: ${msg.text()}`);
    });
    page.on('pageerror', exception => {
      console.error(`PAGE EXCEPTION: ${exception}`);
    });

    isHeld = false;
    holdTimestamp = undefined;
    accumulatedHold = 0;

    const createdAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const getMockQuestion = () => ({
      id: "q_test_123",
      _id: "q_test_123",
      userId: "user_author_1",
      question: "How do I manage leaf folder in paddy crops?",
      text: "How do I manage leaf folder in paddy crops?",
      status: isHeld ? "hold" : "open",
      source: "AJRASAKHA",
      priority: "medium",
      details: {
        state: "Kerala",
        district: "Ernakulam",
        crop: "Paddy",
        season: "Kharif",
        domain: ["Pest Management"],
      },
      createdAt,
      totalAnswersCount: 1,
      aiInitialAnswer: null,
      aiApprovedAnswer: null,
      aiApprovedSources: [],
      approved_moderator: null,
      closedBy: null,
      closedAt: null,
      passingRemark: null,
      similarityScore: null,
      referenceQuestionId: null,
      referenceQuestion: null,
      referenceSource: null,
      isDuplicateCancelled: false,
      pae_review: false,
      paeValidation: null,
      originalQuestion: null,
      tag: null,
      auditorReviewType: null,
      isAssignedGateKeeper: false,
      assigned_gate_keeper: null,
      assigned_auditor: null,
      gateKeeperAssignedAt: null,
      gateKeeperFinishedAt: null,
      auditorAssignedAt: null,
      auditorFinishedAt: null,
      autoAllocateGateKeeper: false,
      autoAllocateAuditor: false,
      submission: {
        _id: "sub_test_123",
        questionId: "q_test_123",
        createdAt,
        queue: [],
        history: [{ _id: "hist_123", createdAt, updatedBy: { _id: "user_expert_1", userName: "Expert 1" } }],
      },
      isOnHold: isHeld,
      holdAt: isHeld ? holdTimestamp : undefined,
      accumulatedHoldMs: accumulatedHold,
    });

    // â”€â”€ Firebase â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    await page.route("https://identitytoolkit.googleapis.com/**", async (route) => {
      const url = route.request().url();
      if (url.includes("accounts:lookup")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            kind: "identitytoolkit#GetAccountInfoResponse",
            users: [{ localId: "user123", email: "test@example.com", displayName: "SLA Tester", emailVerified: true, providerUserInfo: [{ providerId: "password", email: "test@example.com", rawId: "user123" }] }],
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ kind: "identitytoolkit#VerifyPasswordResponse", localId: "user123", email: "test@example.com", displayName: "SLA Tester", idToken: "dummy-test-token", registered: true, emailVerified: true, refreshToken: "dummy-refresh-token", expiresIn: "3600" }),
        });
      }
    });

    await page.route("https://securetoken.googleapis.com/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ access_token: "dummy-access-token", expires_in: "3600", token_type: "Bearer", refresh_token: "dummy-refresh-token", id_token: "dummy-test-token", user_id: "user123", project_id: "dummy-project-id" }),
      });
    });

    // â”€â”€ Auth / User endpoints â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    await page.route(/\/api\/users\/details\/.*/, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ _id: "user123", role: "moderator", status: "active", isBlocked: false, email: "test@example.com" }) });
    });
    await page.route(/\/api\/auth\/sync/, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, user: { _id: "user123", role: "moderator", email: "test@example.com" } }) });
    });
    await page.route(/\/api\/users\/me/, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ _id: "user123", role: "moderator", email: "test@example.com", firstName: "SLA", lastName: "Tester", username: "sla_tester" }) });
    });
    // Users list used by RoleAssigneeQueue / FeedbackReviewTimeline modals
    await page.route(/\/api\/users\b/, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, users: [], totalCount: 0 }) });
    });

    // â”€â”€ Question list endpoints â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    await page.route(/\/api\/.*allocated.*/, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([getMockQuestion()]) });
    });
    await page.route(/\/api\/.*detailed.*/, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ totalPages: 1, totalCount: 1, questions: [getMockQuestion()] }) });
    });

    // â”€â”€ Single unified handler for ALL /api/questions/q_test_123/* routes â”€â”€â”€â”€
    // Playwright LIFO: this single handler handles branching internally so
    // ordering issues between specific and generic patterns are avoided.
    await page.route(/\/api\/questions\/q_test_123/, async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      // Hold / Release
      if (url.includes("/hold") && method === "PATCH") {
        const body = route.request().postDataJSON();
        if (body?.action === "hold") {
          isHeld = true;
          holdTimestamp = new Date().toISOString();
        } else if (body?.action === "unhold") {
          isHeld = false;
          accumulatedHold += 5000;
        }
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "q_test_123" }) });
      }

      // FeedbackReviewTimeline â€” must return { data: { reviews: [] } }
      if (url.includes("/feedback-timeline")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { autoAllocateFeedback: false, hasOpenFeedback: false, reviews: [] } }) });
      }

      // PAE Validation Timeline
      if (url.includes("/pae-validation-timeline")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: null }) });
      }

      // Open Feedback
      if (url.includes("/open-feedback")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: [] }) });
      }

      // Feedback
      if (url.includes("/feedback")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: null }) });
      }

      // Reroute History
      if (url.includes("/reroute-history")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      }

      // Role assignee toggle / changes
      if (url.includes("/role-assignee") || url.includes("/toggle-role-allocation")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
      }

      // Question full data / default
      const q = getMockQuestion();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, currentUserId: "user123", data: q, ...q }),
      });
    });

    // â”€â”€ Other generic lookup endpoints â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    await page.route(/\/api\/locations\/states/, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });
    await page.route(/\/api\/crops/, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });
    await page.route(/\/api\/notifications/, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: '{"success":true,"data":[]}' });
    });
  });

  // â”€â”€ Helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const loginAndOpenQuestion = async (page: any) => {
    await page.goto("/auth");
    await page.locator('input[name="email"]').fill("test@example.com");
    await page.locator('input[name="password"]').fill("Password123!");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/.*home/, { timeout: 15000 });
    await page.goto("/home?question=q_test_123");
  };

  // â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  test("should display live ticking countdown timer for assigned AJRASAKHA question", async ({ page }) => {
    await loginAndOpenQuestion(page);

    const countdown = page.locator("span.font-mono").first();
    await expect(countdown).toBeVisible({ timeout: 15000 });

    const textBefore = await countdown.innerText();
    await page.waitForTimeout(1500);
    const textAfter = await countdown.innerText();

    expect(textAfter).not.toBe(textBefore);
  });

  test("should open confirmation modal when clicking 'Hold the question'", async ({ page }) => {
    await loginAndOpenQuestion(page);

    const holdButton = page.getByRole("button", { name: "Hold the question" });
    await expect(holdButton).toBeVisible({ timeout: 15000 });
    await holdButton.click();

    await expect(page.getByRole("button", { name: "Yes, Hold" })).toBeVisible();
  });

  test("should transition to HOLD state and freeze countdown", async ({ page }) => {
    await loginAndOpenQuestion(page);

    const countdown = page.locator("span.font-mono").first();
    await expect(countdown).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "Hold the question" }).click();
    await page.getByRole("button", { name: "Yes, Hold" }).click();
    await page.goto("/home?question=q_test_123");

    await expect(page.getByRole("button", { name: "Release Hold" })).toBeVisible({ timeout: 15000 });
    await expect(countdown).toBeVisible({ timeout: 15000 });
    const textAfterHold = await countdown.innerText();
    await page.waitForTimeout(1500);
    const textWhileHeld = await countdown.innerText();

    expect(textAfterHold).toContain("Hold:");
    expect(textWhileHeld).toBe(textAfterHold);
  });

  test("should release hold and resume countdown timer", async ({ page }) => {
    await loginAndOpenQuestion(page);

    const countdown = page.locator("span.font-mono").first();
    await expect(countdown).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "Hold the question" }).click();
    await page.getByRole("button", { name: "Yes, Hold" }).click();
    await page.goto("/home?question=q_test_123");
    await expect(page.getByRole("button", { name: "Release Hold" })).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "Release Hold" }).click();
    await expect(page.getByText("Release this question?")).toBeVisible();
    await page.getByRole("button", { name: "Yes, Release" }).click();
    await page.goto("/home?question=q_test_123");

    await expect(page.getByRole("button", { name: "Hold the question" })).toBeVisible({ timeout: 15000 });
    await expect(countdown).toBeVisible({ timeout: 15000 });
    const textBeforeResume = await countdown.innerText();
    await page.waitForTimeout(1500);
    const textAfterResume = await countdown.innerText();

    expect(textAfterResume).not.toBe(textBeforeResume);
  });

  test("should extend SLA deadline by accumulated hold time after release", async ({ page }) => {
  await loginAndOpenQuestion(page);

  const countdown = page.locator("span.font-mono").first();
  await expect(countdown).toBeVisible({ timeout: 15000 });

  const textBefore = await countdown.innerText();

  // Put the question on hold
  const holdBtn = page.getByRole("button", { name: "Hold the question" });
  await expect(holdBtn).toBeVisible({ timeout: 15000 });
  await holdBtn.click();

  await expect(
    page.getByRole("button", { name: "Yes, Hold" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Yes, Hold" }).click();

  // Re-open the question after the hold action
  await page.goto("/home?question=q_test_123");

  await expect(
    page.getByRole("button", { name: "Release Hold" })
  ).toBeVisible({ timeout: 15000 });

  // Release the hold.
  // The mock adds 5000ms to accumulatedHoldMs.
  await page.getByRole("button", { name: "Release Hold" }).click();

  await expect(
    page.getByText("Release this question?")
  ).toBeVisible();

  await page.getByRole("button", { name: "Yes, Release" }).click();

  // Re-open after release so the updated mock state is rendered
  await page.goto("/home?question=q_test_123");

  await expect(
    page.getByRole("button", { name: "Hold the question" })
  ).toBeVisible({ timeout: 15000 });

  await expect(countdown).toBeVisible({ timeout: 15000 });

  const textAfter = await countdown.innerText();

  const parseSeconds = (text: string) => {
    const hms = text.match(/(\d+)h\s+(\d+)m\s+(\d+)s/);
    if (hms) {
      return (
        Number(hms[1]) * 3600 +
        Number(hms[2]) * 60 +
        Number(hms[3])
      );
    }

    const clock = text.match(/(\d+):(\d+):(\d+)/);
    if (clock) {
      return (
        Number(clock[1]) * 3600 +
        Number(clock[2]) * 60 +
        Number(clock[3])
      );
    }

    throw new Error(`Unable to parse countdown: ${text}`);
  };

  const secBefore = parseSeconds(textBefore);
  const secAfter = parseSeconds(textAfter);

  // The hold time should be returned to the SLA after release.
  // Therefore the countdown should not lose the full hold duration.
  const elapsedSlaTime = secBefore - secAfter;

  expect(elapsedSlaTime).toBeLessThan(15);
  expect(elapsedSlaTime).toBeGreaterThanOrEqual(-1);
});
  test("should persist HOLD state and frozen countdown across page refreshes", async ({ page }) => {
    isHeld = true;
    holdTimestamp = new Date().toISOString();
    accumulatedHold = 10000;

    await loginAndOpenQuestion(page);

    // 1. Initial check that it loads in HOLD state
    let holdTimer = page.getByText(/Hold:/).first();
    await expect(holdTimer).toBeVisible({ timeout: 15000 });
    const timeBeforeRefresh = await holdTimer.innerText();

    // 2. Hard refresh the page
    await page.reload();

    // 3. Verify state correctly initializes back into HOLD state
    holdTimer = page.getByText(/Hold:/).first();
    await expect(holdTimer).toBeVisible({ timeout: 15000 });
    const timeAfterRefresh = await holdTimer.innerText();

    // The frozen time should remain identical
    expect(timeAfterRefresh).toBe(timeBeforeRefresh);
    await expect(page.getByRole("button", { name: "Release Hold" })).toBeVisible();
    });

  test("should cancel Hold confirmation and leave question unchanged", async ({ page }) => {
    await loginAndOpenQuestion(page);

    const countdown = page.locator("span.font-mono").first();
    await expect(countdown).toBeVisible({ timeout: 15000 });
    const textBeforeClick = await countdown.innerText();

    const holdButton = page.getByRole("button", { name: "Hold the question" });
    await expect(holdButton).toBeVisible({ timeout: 15000 });
    await holdButton.click();

    // Verify modal appears
    await expect(page.getByText("Hold this question?")).toBeVisible();

    let holdApiCalled = false;
    const requestHandler = (request) => {
      if (request.url().includes('/hold') && request.method() === 'PATCH') {
        holdApiCalled = true;
      }
    };
    page.on('request', requestHandler);

    // Cancel the hold
    await page.getByRole("button", { name: "Go back" }).click();

    // Modal should close
    await expect(page.getByText("Hold this question?")).toBeHidden();

    // Verify no API call
    expect(holdApiCalled).toBe(false);

    // Verify UI remains in open state
    await expect(page.getByRole("button", { name: "Hold the question" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Release Hold" })).toBeHidden();

    // Verify countdown is still ticking
    await page.waitForTimeout(1500);
    const textAfterCancel = await countdown.innerText();
    expect(textAfterCancel).not.toBe(textBeforeClick);
    expect(textAfterCancel).not.toContain("Hold:");

    page.off('request', requestHandler);
  });

  test("should cancel Release Hold confirmation and leave question in HOLD state", async ({ page }) => {
    // Start with the question already on hold
    isHeld = true;
    holdTimestamp = new Date().toISOString();
    accumulatedHold = 0;

    await loginAndOpenQuestion(page);

    // 1. Verify HOLD state — frozen countdown and Release Hold button visible
    const countdown = page.locator("span.font-mono").first();
    await expect(countdown).toBeVisible({ timeout: 15000 });
    const frozenTextBefore = await countdown.innerText();
    expect(frozenTextBefore).toContain("Hold:");
    await expect(page.getByRole("button", { name: "Release Hold" })).toBeVisible();

    // 2. Click Release Hold
    await page.getByRole("button", { name: "Release Hold" }).click();

    // 3. Verify release confirmation modal appears
    await expect(page.getByText("Release this question?")).toBeVisible();

    // 4. Track whether the unhold PATCH is called
    let unholdApiCalled = false;
    const requestHandler = (request: any) => {
      if (request.url().includes("/hold") && request.method() === "PATCH") {
        unholdApiCalled = true;
      }
    };
    page.on("request", requestHandler);

    // 5. Cancel — click "Go back" in the modal
    await page.getByRole("button", { name: "Go back" }).click();

    // 6. Modal should close
    await expect(page.getByText("Release this question?")).toBeHidden();

    // 7. Verify no API call was made
    expect(unholdApiCalled).toBe(false);

    // 8. Verify UI remains in HOLD state
    await expect(page.getByRole("button", { name: "Release Hold" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Hold the question" })).toBeHidden();

    // 9. Verify countdown remains frozen (still shows "Hold:" and same value)
    await page.waitForTimeout(1500);
    const frozenTextAfter = await countdown.innerText();
    expect(frozenTextAfter).toContain("Hold:");
    expect(frozenTextAfter).toBe(frozenTextBefore);

    page.off("request", requestHandler);
  });

  test("should hide countdown and show no malformed value when SLA has expired", async ({ page }) => {
    // Override createdAt inside beforeEach: set createdAt 3 hours ago so the
    // 2h SLA deadline (per the default durationHours) has already passed.
    // The route handler captures createdAt by closure, so we must intercept
    // the question endpoint one more time (LIFO) to return an expired mock.
    const expiredCreatedAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

    // Register a higher-priority (LIFO) override for the question endpoint
    await page.route(/\/api\/questions\/q_test_123/, async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (url.includes("/feedback-timeline")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { autoAllocateFeedback: false, hasOpenFeedback: false, reviews: [] } }) });
      }
      if (url.includes("/pae-validation-timeline")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: null }) });
      }
      if (url.includes("/open-feedback")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: [] }) });
      }
      if (url.includes("/feedback")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: null }) });
      }
      if (url.includes("/reroute-history")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      }
      if ((url.includes("/role-assignee") || url.includes("/toggle-role-allocation")) && method !== "GET") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
      }

      // Expired question — createdAt is 3h ago, SLA deadline already passed
      const expiredQ = {
        id: "q_test_123",
        _id: "q_test_123",
        userId: "user_author_1",
        question: "How do I manage leaf folder in paddy crops?",
        text: "How do I manage leaf folder in paddy crops?",
        status: "open",
        source: "AJRASAKHA",
        priority: "medium",
        details: { state: "Kerala", district: "Ernakulam", crop: "Paddy", season: "Kharif", domain: ["Pest Management"] },
        createdAt: expiredCreatedAt,
        totalAnswersCount: 1,
        aiInitialAnswer: null, aiApprovedAnswer: null, aiApprovedSources: [],
        approved_moderator: null, closedBy: null, closedAt: null, passingRemark: null,
        similarityScore: null, referenceQuestionId: null, referenceQuestion: null,
        referenceSource: null, isDuplicateCancelled: false, pae_review: false,
        paeValidation: null, originalQuestion: null, tag: null, auditorReviewType: null,
        isAssignedGateKeeper: false, assigned_gate_keeper: null, assigned_auditor: null,
        gateKeeperAssignedAt: null, gateKeeperFinishedAt: null,
        auditorAssignedAt: null, auditorFinishedAt: null,
        autoAllocateGateKeeper: false, autoAllocateAuditor: false,
        submission: {
          _id: "sub_test_123", questionId: "q_test_123", createdAt: expiredCreatedAt,
          queue: [],
          history: [{ _id: "hist_123", createdAt: expiredCreatedAt, updatedBy: { _id: "user_expert_1", userName: "Expert 1" } }],
        },
        isOnHold: false,
        holdAt: undefined,
        accumulatedHoldMs: 0,
      };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, currentUserId: "user123", data: expiredQ, ...expiredQ }),
      });
    });

    await loginAndOpenQuestion(page);

    // When SLA is expired, useCountdown returns "00:00:00" and TimerDisplay
    // returns null — so the span.font-mono countdown element is NOT rendered.
    const countdown = page.locator("span.font-mono").first();

    // Give the page time to render fully
    await page.waitForTimeout(2000);

    // The countdown element should be hidden/gone (TimerDisplay renders null for "00:00:00")
    await expect(countdown).toBeHidden({ timeout: 5000 });

    // Sanity: page should not contain NaN, undefined or negative countdown text
    const pageText = await page.textContent("body");
    expect(pageText).not.toMatch(/\bNaN\b/);
    expect(pageText).not.toMatch(/\bundefined\b/);
    expect(pageText).not.toMatch(/-\d+:\d+:\d+/); // no negative HH:MM:SS

    // The Hold button should still be accessible (question is still open)
    await expect(page.getByRole("button", { name: "Hold the question" })).toBeVisible({ timeout: 10000 });
  });
});
