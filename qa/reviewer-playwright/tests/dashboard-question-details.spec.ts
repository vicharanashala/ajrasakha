import { test, expect } from "../fixtures/reviewer.fixture.js";
import { LoginPage } from "../pages/login.page.js";

type FullQuestion = {
  _id: string;
  question: string;
  status: string;
  details?: {
    state?: string;
    district?: string;
    crop?: string;
    normalised_crop?: string;
    season?: string;
    domain?: string | string[];
  };
  submission?: {
    queue?: Array<{ _id?: string; name?: string; email?: string }>;
    history?: unknown[];
  };
};

test.describe("Reviewer dashboard to question-detail vertical slice", () => {
  // Catalogue source: 09-user-permissions.md, PERM-001.
  // Implementation: src/routes/auth/index.tsx, src/features/auth/**, src/lib/firebase.ts.
  test("PERM-001 expert login resolves the reviewer role and reaches /home", async ({ page }) => {
    const email = process.env.REVIEWER_USER_EMAIL;
    const password = process.env.REVIEWER_USER_PASSWORD;
    test.skip(
      !email || !password,
      "Skipped: REVIEWER_USER_EMAIL and REVIEWER_USER_PASSWORD are not configured.",
    );

    const login = new LoginPage(page);
    await login.open();

    const syncResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /\/auth\/sync(?:\?|$)/.test(new URL(response.url()).pathname),
      { timeout: 30_000 },
    );
    const currentUserResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        /\/users\/me(?:\?|$)/.test(new URL(response.url()).pathname),
      { timeout: 30_000 },
    );

    await login.signIn(email!, password!);

    const syncResponse = await syncResponsePromise;
    expect(syncResponse.ok(), `POST /auth/sync failed with ${syncResponse.status()}`).toBeTruthy();
    const syncBody = (await syncResponse.json()) as { user?: { role?: string } };
    expect(syncBody.user?.role).toBe("expert");

    await expect(page).toHaveURL(/\/home(?:[/?#]|$)/, { timeout: 30_000 });
    const currentUserResponse = await currentUserResponsePromise;
    expect(
      currentUserResponse.ok(),
      `GET /users/me failed with ${currentUserResponse.status()}`,
    ).toBeTruthy();
    const currentUser = (await currentUserResponse.json()) as { role?: string };
    expect(currentUser.role).toBe("expert");
  });

  // Catalogue source: 01-dashboard.md, DASH-001.
  // Implementation: src/routes/home/index.tsx, src/components/play-ground.tsx.
  test("DASH-001 authenticated shell exposes the role-supported question navigation", async ({
    authenticatedPage,
    dashboardPage,
  }) => {
    await dashboardPage.waitForShell();
    await expect(authenticatedPage.getByRole("tab", { name: "All Questions" })).toBeVisible();
    await dashboardPage.openAllQuestions();
  });

  // Catalogue source: 02-question-details.md, QDET-001.
  // Implementation: QuestionsPage, QuestionsTable, QuestionRow, QuestionDetails, full-data hook/service.
  test("QDET-001 selecting a list question opens the matching full question", async ({
    dashboardPage,
    questionDetailsPage,
  }) => {
    await dashboardPage.openAllQuestions();
    const selected = await dashboardPage.openFirstQuestion();
    const data = selected.responseBody.data as FullQuestion;

    expect(data._id).toBe(selected.id);
    await questionDetailsPage.expectQuestionText(selected.question);
    await expect(questionDetailsPage.exitButton).toBeVisible();
  });

  // Catalogue source: 02-question-details.md, QDET-002.
  // Implementation: /home search validation, PlaygroundPage/useSelectedQuestion, QuestionsPage auto-open effect.
  test("QDET-002 question deep link opens and survives a browser reload", async ({
    authenticatedPage,
    dashboardPage,
    questionDetailsPage,
  }) => {
    await dashboardPage.openAllQuestions();
    const selected = await dashboardPage.openFirstQuestion();

    await authenticatedPage.goto(`/home?question=${encodeURIComponent(selected.id)}`);
    await questionDetailsPage.expectQuestionText(selected.question);
    await authenticatedPage.reload();
    await questionDetailsPage.expectQuestionText(selected.question);
    await expect(authenticatedPage).toHaveURL(new RegExp(`question=${selected.id}`));
  });

  // Catalogue source: 02-question-details.md, QDET-003.
  // Implementation: QuestionHeader, TimerDisplay, status/priority/timestamp rendering.
  test("QDET-003 detail header displays response-derived status, timestamps, and actions", async ({
    dashboardPage,
    questionDetailsPage,
  }) => {
    await dashboardPage.openAllQuestions();
    const selected = await dashboardPage.openFirstQuestion();
    const data = selected.responseBody.data as FullQuestion;

    await questionDetailsPage.expectQuestionText(data.question);
    await questionDetailsPage.expectStatus(data.status);
    await questionDetailsPage.expectCoreHeader();
  });

  // Catalogue source: 02-question-details.md, QDET-004.
  // Implementation: src/features/question_details/components/QuestionDetailsCard.tsx.
  test("QDET-004 question metadata uses the full-detail response and implemented fallbacks", async ({
    dashboardPage,
    questionDetailsPage,
  }) => {
    await dashboardPage.openAllQuestions();
    const selected = await dashboardPage.openFirstQuestion();
    const data = selected.responseBody.data as FullQuestion;

    expect(await questionDetailsPage.metadataValue("State")).toBe(data.details?.state || "-");
    expect(await questionDetailsPage.metadataValue("District")).toBe(data.details?.district || "-");
    expect(await questionDetailsPage.metadataValue("Crop")).toBe(data.details?.crop || "-");
    expect(await questionDetailsPage.metadataValue("Normalized Crop")).toBe(
      data.details?.normalised_crop || "-",
    );
    expect(await questionDetailsPage.metadataValue("Season")).toBe(data.details?.season || "-");
    const expectedDomain = Array.isArray(data.details?.domain)
      ? data.details?.domain.join(", ")
      : data.details?.domain || "-";
    expect(await questionDetailsPage.metadataValue("Domain")).toBe(expectedDomain);
  });

  // Catalogue source: 02-question-details.md, QDET-006.
  // Implementation: AllocationTimeline, AllocationQueueHeader, allocationStatusStyleConfig.
  test("QDET-006 allocation queue renders every returned reviewer and a derived status", async ({
    dashboardPage,
    questionDetailsPage,
  }) => {
    await dashboardPage.openAllQuestions();
    const selected = await dashboardPage.openFirstQuestion();
    const data = selected.responseBody.data as FullQuestion;
    const queue = data.submission?.queue ?? [];

    await questionDetailsPage.expectAllocationQueue(queue);
    if (queue.length > 0) {
      expect(await questionDetailsPage.availableAllocationStatuses()).not.toHaveLength(0);
    }
  });

  // Catalogue source: 02-question-details.md, QDET-011.
  // Implementation: QuestionsPage.goBack and QuestionHeader Exit control.
  test("QDET-011 in-page Exit returns from question detail to the question list", async ({
    dashboardPage,
    questionDetailsPage,
  }) => {
    await dashboardPage.openAllQuestions();
    await dashboardPage.openFirstQuestion();
    await questionDetailsPage.exit();
    await expect(dashboardPage.questionTable.or(dashboardPage.emptyState.first())).toBeVisible();
  });
});
