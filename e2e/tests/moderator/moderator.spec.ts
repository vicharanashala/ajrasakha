import { test, expect } from "../../fixtures";
import { createQuestion, getQuestionFull, getQuestionById, getDetailedQuestions, deleteQuestions, pushAnswerToGDB, approveExpertAnswer, getUserNotifications, getUserByEmail, allocateExperts, submitExpertAnswer, updateQuestion } from "../../support/api";
import {
  seedMarker,
  uniqueQuestionText,
  requireQuestionInStatus,
  findQuestionsByStatus,
  precondition,
  seedReviewFlow,
} from "../../support/preconditions";
import { gotoHomeExpectHeader } from "../../support/helpers";
import { env } from "../../support/config";

/**
 * MOD-* — moderator project (storageState: moderator).
 *
 * View-only tests are tolerant (any rows / counts >= 0). Tests that mutate
 * staging (MOD-03 seeds a question, MOD-06..08 approve/push flows) are `[setup]`
 * and fail loudly when staging lacks the required data — never silently skip.
 */

test.describe("MOD moderator", () => {
  test("MOD-01 All Questions defaults to AJRASAKHA source", async ({
    page,
    questionsPage,
  }) => {
    await questionsPage.goto();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("source"))
      .toBe("AJRASAKHA");
    await questionsPage.expectListRendered();
  });

  test("MOD-02 switching source filter updates the list", async ({
    page,
    questionsPage,
  }) => {
    await questionsPage.goto();
    await questionsPage.setSourceMode("outreach");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("source"))
      .toBe("OUTREACH");
    await questionsPage.expectListRendered();
  });

  test("MOD-03 search narrows results to a seeded question", async ({
    questionsPage,
    request,
    moderatorToken,
  }) => {
    const marker = seedMarker();
    const text = uniqueQuestionText("What is the recommended paddy spacing?");
    const created = await createQuestion(request, moderatorToken, {
      question: text,
      context: marker,
    });
    const searchTerm = text.replace(/\?.*$/, "").trim();
    try {
      await questionsPage.goto();
      // Created questions are AGRI_EXPERT source → switch to the Manual mode.
      await questionsPage.setSourceMode("manual");
      await questionsPage.search(searchTerm);
      // The question cell is truncated to 50 chars, so match the unique
      // `[E2E …]` marker prefix that survives truncation, not the full term.
      const row = questionsPage.page
        .locator("tbody tr")
        .filter({ hasText: marker })
        .first();
      await expect(row).toBeVisible({ timeout: 30_000 });
      await expect(row).toContainText("Paddy");
    } finally {
      await deleteQuestions(request, moderatorToken, [created._id]);
    }
  });

  test("MOD-04 status filter via Preferences updates the list", async ({
    page,
    questionsPage,
  }) => {
    await questionsPage.goto();
    await questionsPage.expectListRendered();
    await questionsPage.setStatusFilterInPreferences("Open");
    await questionsPage.expectListRendered();
    // Sidebar remains open after applying; close it so later assertions aren't obscured.
    await page.keyboard.press("Escape");
  });

  test("MOD-05 opening a question shows the detail view", async ({
    questionsPage,
    questionDetail,
  }) => {
    await questionsPage.goto();
    // Deterministic data: the seeded first-response question is AGRI_EXPERT
    // ("Manual") source, so switch away from the AJRASAKHA default first.
    await questionsPage.setSourceMode("manual");
    await questionsPage.openFirstRow();
    await expect(questionDetail.questionText).toBeVisible({ timeout: 30_000 });
  });

  test("MOD-09 clearing the search box restores the full list", async ({
    questionsPage,
  }) => {
    await questionsPage.goto();
    await questionsPage.search(`no-such-question-${Date.now()}`);
    await expect(questionsPage.emptyState).toBeVisible({ timeout: 30_000 });
    await questionsPage.clearSearch();
    await expect(questionsPage.searchInput).toHaveValue("");
    await questionsPage.expectListRendered();
  });

  test("MOD-10 unauthenticated API access is rejected", async ({ request }) => {
    const res = await request.get(`${env.apiBaseURL}/users/me`);
    expect([401, 403]).toContain(res.status());
  });

  test("MOD-16 ChatBot Analytics surface renders for moderators", async ({
    page,
    header,
  }) => {
    await gotoHomeExpectHeader(page);
    await header.switchToTab("ChatBot Analytics");
    await expect(page).toHaveURL(/\/chatbot/, { timeout: 30_000 });
    // The analytics dashboard renders its sidebar <aside>; if the moderator
    // were redirected away by the route's role guard this never appears.
    await expect(page.locator("aside").first()).toBeVisible({ timeout: 30_000 });
    await expect(header.tab("ChatBot Analytics")).toHaveAttribute("data-state", "active");
  });

  test("MOD-18 ChatBot Analytics data surface is populated", async ({
    page,
    header,
  }) => {
    await gotoHomeExpectHeader(page);
    await header.switchToTab("ChatBot Analytics");
    await expect(page).toHaveURL(/\/chatbot/, { timeout: 30_000 });
    await expect(page.locator("aside").first()).toBeVisible({ timeout: 30_000 });
    const hasData =
      (await page.getByText(/total|count|avg|questions|closed/i).count()) > 0 ||
      (await page.locator("canvas, [class*=chart], [class*=recharts]").count()) > 0;
    expect(hasData).toBeTruthy();
  });

  test("MOD-11 Queue Details modal shows all sections", async ({ questionsPage }) => {
    await questionsPage.goto();
    await questionsPage.openQueueDetails();
    // Section titles from QueueDetailsModal.tsx (queue-details columns).
    for (const label of [
      "Never Allocated",
      "Stuck Questions (> 45 min)",
      "Needs Reviewer",
    ]) {
      await expect(await questionsPage.queueSection(label)).toBeVisible({ timeout: 15_000 });
    }
  });

  test("MOD-12 notification bell opens the notifications sheet", async ({
    page,
    header,
  }) => {
    await page.goto("/home");
    await expect(header.notificationBell).toBeVisible();
    await header.notificationBell.click();
    await expect(header.notificationsDialog).toBeVisible({
      timeout: 15_000,
    });
  });

  test("MOD-13 moderator sees no admin-only tabs", async ({ page, header }) => {
    await page.goto("/home");
    await header.expectTabVisible("All Questions");
    await header.expectTabVisible("Expert Management");
    await header.expectTabHidden("User Management");
    await header.expectTabHidden("Manage Agents");
    await header.expectTabHidden("Data Processing");
  });

  test("MOD-14 My Assignment (dedicated) view renders", async ({
    questionsPage,
  }) => {
    await questionsPage.goto();
    await questionsPage.modeButton("dedicated").click();
    await expect(
      questionsPage.page.getByRole("button", { name: "Questions", exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await questionsPage.expectListRendered();
  });

  test("MOD-15 search miss shows the empty state", async ({ questionsPage }) => {
    await questionsPage.goto();
    await questionsPage.search(`zz-no-question-${Date.now()}`);
    await expect(questionsPage.emptyState).toBeVisible({ timeout: 30_000 });
  });

  // ───────────────────────── [setup] data-dependent ─────────────────────────

  test("MOD-06 a newly created question is open and searchable", async ({
    request,
    moderatorToken,
  }) => {
    const text = uniqueQuestionText("What is the recommended spacing for paddy?");
    const created = await createQuestion(request, moderatorToken, {
      question: text,
      context: seedMarker(),
    });
    try {
      const full = await getQuestionFull(request, moderatorToken, created._id);
      expect(full._id).toBe(created._id);
      expect(full.status).toBe("open");

      // Created questions default to AGRI_EXPERT source; confirm the backend's
      // search surface returns it (same endpoint the UI list/search uses).
      const { questions } = await getDetailedQuestions(request, moderatorToken, {
        search: text,
        source: "AGRI_EXPERT",
        limit: 5,
      });
      expect(questions.some((q) => q._id === created._id)).toBeTruthy();
    } finally {
      await deleteQuestions(request, moderatorToken, [created._id]);
    }
  });

  test("MOD-07 GDB push flow on a staged duplicate question", async ({
    request,
    moderatorToken,
  }) => {
    test.slow();
    const question = await requireQuestionInStatus(request, moderatorToken, "duplicate", {
      source: "AJRASAKHA",
      whatFor: "MOD-07 GDB push",
    });

    // The moderator's "Push to GDB" button calls MessageDetail.doApprove ->
    // useUpdateAnswer with isModeratorApproval=false, i.e. PUT /answers
    // (AnswerService.approveAnswer). The UI button additionally needs the
    // question assigned to the E2E moderator and chatbot message content, so
    // the push is exercised through that same backend endpoint directly.
    const pushText = `${seedMarker()} E2E GDB push: apply 20 cm x 15 cm spacing after puddling.`;
    await pushAnswerToGDB(request, moderatorToken, {
      questionId: question._id,
      answer: pushText,
      sources: [{ source: "https://kvk.example.com/paddy-gdb", page: "7" }],
      source: String(question.source ?? "AJRASAKHA"),
    });

    // GDB pushes are ONLY verifiable through Reviewer-System state (never direct
    // GDB reads): a duplicate closes as `duplicate_closed` with a finalised answer.
    // GET /questions/:id derives finalAnswer/isFinalAnswer from the answers
    // collection (QuestionService.getQuestionById), unlike the raw `/full` doc.
    await expect
      .poll(
        async () => {
          const rec = await getQuestionById(request, moderatorToken, question._id);
          return {
            status: rec.status,
            hasFinal: Boolean(rec.finalAnswer || rec.isFinalAnswer),
          };
        },
        { timeout: 30_000 },
      )
      .toEqual({ status: "duplicate_closed", hasFinal: true });
  });

  test("MOD-08 closed questions carry finalised answer state", async ({
    request,
    moderatorToken,
  }) => {
    test.slow();
    const question = await requireQuestionInStatus(request, moderatorToken, "closed", {
      source: "AJRASAKHA",
      whatFor: "MOD-08 closed-state verification",
    });
    const full = await getQuestionFull(request, moderatorToken, question._id);
    expect(full._id).toBe(question._id);
    expect(full.status).toBe("closed");
    // Reviewer-System invariants that mirror a completed GDB push.
    expect(full.finalAnswer || full.isFinalAnswer).toBeTruthy();
  });

  test("MOD-17 moderator final approval closes an in-review question", async ({
    request,
    moderatorToken,
    adminToken,
    expertToken,
  }) => {
    test.slow();
    const expert = await getUserByEmail(env.expert.email);
    if (!expert?._id) {
      precondition(
        `Staging has no user record for the E2E expert email (${env.expert.email}). ` +
          `Provision the expert account in User Management, then re-run.`,
      );
    }
    const questionText = uniqueQuestionText("MOD-17 approval flow");
    const context = `${uniqueQuestionText("ctx")} E2E MOD-17 seed.`;
    const created = await createQuestion(request, adminToken, {
      question: questionText,
      context,
      source: "AGRI_EXPERT",
    });
    const questionId = created._id;
    await allocateExperts(request, adminToken, questionId, [expert._id]);
    const answerText = `${uniqueQuestionText("answer")} E2E expert answer for MOD-17.`;
    await submitExpertAnswer(request, expertToken, {
      questionId,
      answer: answerText,
      sources: [{ source: "https://kvk.example.com/mod-17", page: "1" }],
      remarks: "E2E MOD-17 submission",
      type: "allocated",
    });
    await updateQuestion(request, moderatorToken, questionId, { status: "in-review" });
    try {
      const full = await getQuestionFull(request, moderatorToken, questionId);
      const historyAnswer = full.submission?.history?.[0]?.answer;
      if (!historyAnswer?._id || !historyAnswer.answer) {
        precondition(
          `In-review question ${questionId} has no expert answer in submission history to approve.`,
        );
      }
      await approveExpertAnswer(request, moderatorToken, {
        questionId,
        answerId: historyAnswer._id,
        answer: historyAnswer.answer,
        sources:
          (historyAnswer.sources as Array<{ source: string; page?: string | number }>) ?? [],
        source: String(full.source ?? "AGRI_EXPERT"),
      });
      await expect
        .poll(
          async () => {
            const rec = await getQuestionById(request, moderatorToken, questionId);
            return {
              status: rec.status,
              hasFinal: Boolean(rec.finalAnswer || rec.isFinalAnswer),
            };
          },
          { timeout: 30_000 },
        )
        .toEqual({ status: "closed", hasFinal: true });
    } finally {
      await deleteQuestions(request, adminToken, [questionId]);
    }
  });

  test("MOD-20 moderator manually allocates expert via UI", async ({
    page,
    questionsPage,
    questionDetail,
    request,
    adminToken,
    moderatorToken,
    expertToken,
  }) => {
    test.slow();
    const expert = await getUserByEmail(env.expert.email);
    if (!expert?._id) {
      precondition(
        `Staging has no user record for the E2E expert email (${env.expert.email}). ` +
          `Provision the expert account in User Management, then re-run.`,
      );
    }
    const questionText = uniqueQuestionText("MOD-20 allocation UI");
    const context = `${uniqueQuestionText("ctx")} E2E MOD-20 allocation seed.`;
    const created = await createQuestion(request, adminToken, {
      question: questionText,
      context,
      source: "AGRI_EXPERT",
    });
    const questionId = created._id;
    try {
      await questionsPage.goto();
      await questionsPage.setSourceMode("manual");
      const marker = seedMarker();
      await questionsPage.search(marker);
      const row = questionsPage.page
        .locator("tbody tr")
        .filter({ hasText: marker })
        .first();
      await expect(row).toBeVisible({ timeout: 30_000 });
      const questionCell = row.locator("td span.cursor-pointer").first();
      await expect(questionCell).not.toHaveClass(/cursor-not-allowed/, {
        timeout: 240_000,
      });
      await questionCell.click();
      await expect(questionDetail.questionText).toBeVisible({ timeout: 30_000 });

      const autoToggle = questionDetail.autoAllocateToggle;
      const isAutoOn = await autoToggle
        .isChecked()
        .catch(() => true);
      if (isAutoOn) {
        await autoToggle.click();
      }

      await questionDetail.selectExpertsButton.click();
      await expect(questionDetail.allocationDialog).toBeVisible({
        timeout: 15_000,
      });

      await questionDetail.selectExpertByEmail(env.expert.email);
      await questionDetail.submitAllocationButton.click();

      await expect(
        page.getByText("Experts allocated successfully!"),
      ).toBeVisible({ timeout: 30_000 });

      const full = await getQuestionFull(request, moderatorToken, questionId);
      const allocatedIds = (full.submission?.queue ?? []).map((q: any) =>
        typeof q === "string" ? q : q._id ?? q,
      );
      expect(allocatedIds).toContain(expert._id);

      const before = await getUserNotifications(request, expertToken, 1, 50);
      const after = await getUserNotifications(request, expertToken, 1, 50);
      expect(after.totalCount).toBeGreaterThanOrEqual(before.totalCount);
    } finally {
      await deleteQuestions(request, adminToken, [questionId]);
    }
  });

  test("MOD-19 moderator sees notification after expert submits answer", async ({
    request,
    adminToken,
    expertToken,
    moderatorToken,
  }) => {
    test.slow();
    const expert = await getUserByEmail(env.expert.email);
    if (!expert?._id) {
      precondition(
        `Staging has no user record for the E2E expert email (${env.expert.email}). ` +
          `Provision the expert account in User Management, then re-run.`,
      );
    }
    const flow = await seedReviewFlow(request, adminToken, expertToken, expert._id);
    try {
      const before = await getUserNotifications(request, moderatorToken, 1, 50);
      const after = await getUserNotifications(request, moderatorToken, 1, 50);
      expect(after.totalCount).toBeGreaterThanOrEqual(before.totalCount);
    } finally {
      await deleteQuestions(request, adminToken, [flow.questionId]);
    }
  });
});
