import { test, expect } from "../fixtures/reviewer.fixture.js";

test.describe("Reviewer loading, failure, and partial-data behavior", () => {
  // Catalogue source: 10-loading-error-empty.md, ERR-001.
  // Implementation: src/routes/home/index.tsx returns null while useGetCurrentUser is loading.
  test("ERR-001 protected home does not render the shell while current-user resolution is pending", async ({
    authenticatedPage,
    dashboardPage,
  }) => {
    let releaseUserResponse!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseUserResponse = resolve;
    });

    await authenticatedPage.route("**/users/me", async (route) => {
      await gate;
      await route.continue();
    });

    const reload = authenticatedPage.reload({ waitUntil: "domcontentloaded" });
    await expect(dashboardPage.allQuestionsTab).toBeHidden();
    releaseUserResponse();
    await reload;
    await dashboardPage.waitForShell();
  });

  // Catalogue source: 10-loading-error-empty.md, ERR-002.
  // Implementation: QuestionsPage and QuestionsTable pending/empty branches.
  test("ERR-002 detailed-question loading resolves to the implemented empty state", async ({
    authenticatedPage,
    dashboardPage,
  }) => {
    let releaseList!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseList = resolve;
    });

    await authenticatedPage.route("**/questions/detailed?**", async (route) => {
      await gate;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ questions: [], totalCount: 0, totalPages: 0 }),
      });
    });

    await dashboardPage.allQuestionsTab.click();
    await expect(authenticatedPage.locator(".animate-spin").first()).toBeVisible();
    releaseList();
    await expect(dashboardPage.emptyState.first()).toBeVisible();
  });

  // Catalogue source: 10-loading-error-empty.md, ERR-003.
  // Implementation: QuestionsPage selected query has a spinner but no explicit error panel.
  test("ERR-003 failed full-detail request never renders stale question details", async ({
    authenticatedPage,
    dashboardPage,
    questionDetailsPage,
  }) => {
    await dashboardPage.openAllQuestions();
    await authenticatedPage.route("**/questions/*/full", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "controlled failure" }) }),
    );

    const response = await dashboardPage.clickFirstQuestionAndWaitFor((candidate) =>
      /\/questions\/[^/]+\/full(?:\?|$)/.test(new URL(candidate.url()).pathname),
    );
    expect(response.status()).toBe(500);
    await expect(authenticatedPage.locator(".animate-spin").first()).toBeHidden();
    await expect(questionDetailsPage.exitButton).toBeHidden();
    await expect(questionDetailsPage.title).toBeHidden();
  });

  // Catalogue source: 10-loading-error-empty.md, ERR-010.
  // Implementation: QuestionDetailsCard and AllocationTimeline optional-field fallbacks.
  test("ERR-010 partial full-detail response preserves a stable detail screen", async ({
    authenticatedPage,
    dashboardPage,
    questionDetailsPage,
  }) => {
    await dashboardPage.openAllQuestions();
    await authenticatedPage.route("**/questions/*/full", async (route) => {
      const upstream = await route.fetch();
      const body = (await upstream.json()) as { data?: Record<string, unknown> };
      if (body.data) {
        delete body.data.context;
        delete body.data.metrics;
        delete body.data.closedAt;
        delete body.data.approved_moderator;
        const details = body.data.details as Record<string, unknown> | undefined;
        if (details) {
          delete details.district;
          delete details.normalised_crop;
          delete details.season;
          delete details.domain;
        }
      }
      await route.fulfill({ response: upstream, json: body });
    });

    const selected = await dashboardPage.openFirstQuestion();
    await questionDetailsPage.expectQuestionText(selected.question);
    expect(await questionDetailsPage.metadataValue("District")).toBe("-");
    expect(await questionDetailsPage.metadataValue("Normalized Crop")).toBe("-");
    expect(await questionDetailsPage.metadataValue("Season")).toBe("-");
    expect(await questionDetailsPage.metadataValue("Domain")).toBe("-");
  });
});
