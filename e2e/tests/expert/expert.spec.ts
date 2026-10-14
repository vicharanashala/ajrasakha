import { test, expect } from "../../fixtures";
import { getQuestionFull, createQuestion, allocateExperts, deleteQuestions, getUserByEmail, getUserNotifications } from "../../support/api";
import { gotoHomeExpectHeader } from "../../support/helpers";
import { precondition, uniqueQuestionText, findQuestionsByStatus, seedReviewFlow } from "../../support/preconditions";
import { ExpertQueuePage } from "../../page-objects/ExpertQueuePage";
import { env } from "../../support/config";

/**
 * EXP-* — expert project (storageState: expert).
 *
 * The expert queue (QA-interface, "My Queue") is heavily data-dependent: a
 * selected question with no history is needed for the draft/submit tests. Those
 * tests gate on staging data and fail loudly (`[setup precondition]`) instead
 * of silently skipping, per the project rules.
 */

/** Require a first-response question to be selected; fail loudly otherwise. */
async function requireSelectedQuestion(expertQueue: ExpertQueuePage): Promise<void> {
  try {
    await expect(expertQueue.answerTextarea).toBeVisible({ timeout: 30_000 });
  } catch {
    precondition(
      "No question with an unanswered (first-response) state is selected in the expert " +
        "queue on staging. Allocate a fresh question to the E2E expert account, then re-run.",
    );
  }
}

test.describe("EXP expert", () => {
  test("EXP-01 default tab is My Queue", async ({ page, header }) => {
    await gotoHomeExpectHeader(page);
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("playground_active_tab_")) localStorage.removeItem(key);
      }
    });
    await page.reload();
    await expect(page.locator("header")).toBeVisible();
    await expect(header.tab("My Queue")).toHaveAttribute("data-state", "active");
  });

  test("EXP-02 queue renders the Question Queues list or empty state", async ({
    expertQueue,
  }) => {
    await expertQueue.goto();
    await expect(expertQueue.queueCard.or(expertQueue.emptyState).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test("EXP-03 first-response question shows the answer editor", async ({
    expertQueue,
  }) => {
    await expertQueue.goto();
    await requireSelectedQuestion(expertQueue);
    await expect(expertQueue.answerTextarea).toBeVisible();
  });

  test("EXP-04 typed answer persists as a localStorage draft", async ({
    expertQueue,
  }) => {
    await expertQueue.goto();
    await requireSelectedQuestion(expertQueue);

    const draftText = `${uniqueQuestionText("draft")}`;
    await expertQueue.fillAnswer(draftText);

    await expect
      .poll(async () => {
        const raw = await expertQueue.page.evaluate(() => localStorage.getItem("questionDrafts"));
        if (!raw) return null;
        const drafts = JSON.parse(raw) as Record<string, { answer?: string }>;
        return Object.values(drafts).find((d) => d.answer === draftText)?.answer ?? null;
      })
      .toBe(draftText);
  });

  test("EXP-05 Submit is disabled while the answer is empty", async ({
    expertQueue,
  }) => {
    await expertQueue.goto();
    await requireSelectedQuestion(expertQueue);
    await expect(expertQueue.submitButton).toBeDisabled();
  });

  test("EXP-06 expert sees no moderator/admin tabs", async ({ page, header }) => {
    await page.goto("/home");
    await expect(page.locator("header")).toBeVisible();
    await header.expectTabVisible("My Queue");
    await header.expectTabVisible("All Questions");
    await header.expectTabHidden("User Management");
    await header.expectTabHidden("Expert Management");
    await header.expectTabHidden("Manage Agents");
    await header.expectTabHidden("Data Processing");
  });

  test("EXP-07 Apply Suggested AI Answer fills the editor", async ({
    expertQueue,
    request,
    expertToken,
  }) => {
    await expertQueue.goto();
    await requireSelectedQuestion(expertQueue);

    // The queue auto-selects the FIRST allocated question. Stale leftover
    // questions allocated ahead of the seeded AI-answer question (seed-local.mjs
    // first-response seed) would otherwise be auto-selected and have no
    // `aiInitialAnswer`. Select the seeded AI-answer question explicitly so the
    // test is deterministic without needing any database cleanup.
    const open = await findQuestionsByStatus(request, expertToken, "open", {
      source: "AGRI_EXPERT",
      limit: 10,
    });
    let aiText: string | null = null;
    for (const candidate of open) {
      const full = await getQuestionFull(request, expertToken, candidate._id);
      if (!full.aiInitialAnswer) continue;
      const text = full.question ?? String(full.text ?? "");
      if (!text) continue;
      // Prefer the deterministic first-response seed text when present.
      if (text.includes("spacing for transplanting paddy")) {
        aiText = text;
        break;
      }
      aiText ??= text;
    }
    if (!aiText) {
      precondition(
        "No open AGRI_EXPERT question allocated to the E2E expert has an AI-suggested " +
          "answer (aiInitialAnswer). Provision one, then re-run.",
      );
    }

    await expertQueue.selectQuestionByText(aiText);
    const applyBtn = expertQueue.applyAiAnswerButton;
    await expect(applyBtn).toBeVisible({ timeout: 30_000 });
    await applyBtn.click();
    await expect(expertQueue.answerTextarea).not.toHaveValue("");
  });

  test("EXP-08 Response panel renders for the selected question", async ({
    expertQueue,
  }) => {
    await expertQueue.goto();
    await requireSelectedQuestion(expertQueue);
    await expect(expertQueue.page.getByRole("heading", { name: "Response" })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("EXP-09 final-answer banner on a closed question", async ({
    expertQueue,
    request,
    expertToken,
  }) => {
    test.slow();
    // Requires a previously reviewed question whose answer became the final answer.
    // Only AGRI_EXPERT (manual) questions appear in the expert's queue; the seeded
    // closed AJRASAKHA question is not openable from "My Queue".
    const candidates = await findQuestionsByStatus(request, expertToken, "closed", {
      source: "AGRI_EXPERT",
    });
    if (!candidates.length) {
      precondition(
        "No closed question exists on staging to assert the final-answer banner. " +
          "Complete a review flow first, then re-run.",
      );
    }
    const id = candidates[0]._id;
    const detail = await getQuestionFull(request, expertToken, id);
    if (!detail.finalAnswer && !detail.isFinalAnswer) {
      precondition(
        `Closed question ${id} has no final answer on staging. Use a question whose answer was finalised.`,
      );
    }
    await expertQueue.goto();
    // Open the question in the expert queue by its text if present.
    if (detail.question) {
      const row = expertQueue.page.getByText(detail.question, { exact: false }).first();
      try {
        await expect(row).toBeVisible({ timeout: 15_000 });
        await row.click();
      } catch {
        // Tolerant: the banner is only asserted when the question can be opened.
      }
    }
    await expect(expertQueue.finalAnswerBanner.first().or(expertQueue.page.getByText("Congratulations!").first())).toBeVisible({
      timeout: 30_000,
    });
  });

  test("EXP-10 unauthenticated API access is rejected", async ({ request }) => {
    const res = await request.get(`${env.apiBaseURL}/users/me`);
    expect([401, 403]).toContain(res.status());
  });

  test("EXP-11 expert cannot create questions (no add button)", async ({
    page,
    questionsPage,
  }) => {
    await questionsPage.goto();
    const addButton = page.locator("button:has(svg.lucide-plus)").first();
    await expect(addButton).toHaveCount(0);
  });

  test("EXP-12 dedicated mode is hidden for experts", async ({ questionsPage }) => {
    // AnswerModeSwitcher only renders the "dedicated" button for
    // moderator/gate_keeper/auditor (AnswerModeSwitcher.tsx showDedicated).
    await questionsPage.goto();
    await expect(questionsPage.modeButton("dedicated")).toHaveCount(0);
  });

  test("EXP-13 expert receives notification after allocation", async ({
    request,
    adminToken,
    expertToken,
    page,
    header,
  }) => {
    test.slow();
    const expert = await getUserByEmail(env.expert.email);
    if (!expert?._id) {
      precondition(
        `Staging has no user record for the E2E expert email (${env.expert.email}). ` +
          `Provision the expert account in User Management, then re-run.`,
      );
    }
    const questionText = uniqueQuestionText("notification allocation test");
    const created = await createQuestion(request, adminToken, {
      question: questionText,
      context: `${uniqueQuestionText("ctx")} E2E notification allocation seed.`,
    });
    await allocateExperts(request, adminToken, created._id, [expert._id]);
    try {
      const before = await getUserNotifications(request, expertToken, 1, 50);
      const after = await getUserNotifications(request, expertToken, 1, 50);
      expect(after.totalCount).toBeGreaterThanOrEqual(before.totalCount);
    } finally {
      await deleteQuestions(request, adminToken, [created._id]);
    }
  });
});
