import { test, expect } from "@playwright/test";
import { setupAuth, mockUsers } from "../fixtures/auth";
import { mockQuestionsApi } from "../fixtures/questions";
import { PlaygroundPage } from "../pages/PlaygroundPage";
import { QuestionsPage } from "../pages/QuestionsPage";

const FIREBASE_TIMEOUT = 15000;

const mockReviewLevelData = {
  page: 1,
  limit: 12,
  totalDocs: 2,
  totalPages: 1,
  hasNextPage: false,
  hasPrevPage: false,
  data: [
    {
      _id: "rl001",
      question: "Review pest control methods for wheat",
      status: "open",
      createdAt: "2025-02-01T10:00:00.000Z",
      updatedAt: "2025-02-01T12:00:00.000Z",
      reviewLevels: [
        { column: "L1", value: { time: "2025-02-01T12:00:00.000Z", yet_to_complete: false } },
        { column: "L2", value: { time: null, yet_to_complete: true } },
      ],
    },
    {
      _id: "rl002",
      question: "Best irrigation methods for dry regions",
      status: "answered",
      createdAt: "2025-02-02T08:00:00.000Z",
      reviewLevels: [
        { column: "L1", value: { time: "2025-02-02T10:00:00.000Z", yet_to_complete: false } },
        { column: "L2", value: { time: "NA", yet_to_complete: false } },
      ],
    },
  ],
};

const mockFullQuestionResponse = {
  success: true,
  data: {
    _id: "q001",
    question: "What is the best fertilizer for rice?",
    status: "answered",
    details: {
      state: "Andhra Pradesh",
      district: "Guntur",
      crop: "Rice",
      normalised_crop: "Rice",
      season: "Kharif",
      domain: ["Soil Health"],
    },
    isAutoAllocate: false,
    priority: "high",
    context: "",
    metrics: { mean_similarity: 0, std_similarity: 0, recent_similarity: 0, collusion_score: 0 },
    source: "AJRASAKHA",
    totalAnswersCount: 1,
    createdAt: "2025-01-15T10:00:00.000Z",
    updatedAt: "2025-01-15T12:00:00.000Z",
    submission: {
      _id: "sub001",
      questionId: "q001",
      lastRespondedBy: null,
      queue: [],
      history: [],
      createdAt: "2025-01-15T10:00:00.000Z",
      updatedAt: "2025-01-15T12:00:00.000Z",
    },
    isAlreadySubmitted: false,
  },
  currentUserId: "admin-1",
};

const mockReallocationPreview = {
  questions: [
    {
      submissionId: "sub001",
      questionId: "q001",
      questionText: "What is the best fertilizer for rice?",
      currentExpertId: "exp001",
      currentExpertName: "Expert One",
      currentExpertStatus: "in-active",
      isCurrentExpertBlocked: false,
      queue: ["exp002", "exp003"],
    },
  ],
  activeExperts: [
    { id: "exp002", name: "Expert Two", reputation_score: 4.5 },
    { id: "exp003", name: "Expert Three", reputation_score: 3.8 },
  ],
  inactiveExpertIds: ["exp001"],
};

const mockReallocateResponse = {
  success: true,
  message: "Questions reallocated successfully",
};

async function mockReviewLevelApi(page) {
  await page.route(
    (url) => url.pathname === "/api/questions" && url.searchParams.has("page") && url.searchParams.has("limit"),
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockReviewLevelData),
      });
    },
  );
}

async function mockQuestionFullData(page) {
  await page.route("**/api/questions/*/full", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockFullQuestionResponse),
    });
  });
}

async function mockReallocationApi(page) {
  await page.route("**/api/questions/reallocation-preview*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockReallocationPreview),
    });
  });

  await page.route("**/api/questions/reallocate-manual", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockReallocateResponse),
    });
  });
}

async function mockUsersApi(page) {
  await page.route("**/api/users/all", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        users: [
          { _id: "admin-1", userName: "Admin User", email: "admin@test.com", role: "admin" },
        ],
        totalUsers: 1,
        totalPages: 1,
      }),
    });
  });
}

test.describe("All Questions", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page, mockUsers.admin);
  });

  test("Questions table renders with data rows", async ({ page }) => {
    await mockQuestionsApi(page);

    const playground = new PlaygroundPage(page);
    await playground.goto();
    await playground.clickAllQuestions();

    const questions = new QuestionsPage(page);
    await expect(questions.table).toBeVisible({ timeout: FIREBASE_TIMEOUT });
    await expect(questions.tableRows).not.toHaveCount(0);
  });

  test("Advanced Filters dialog opens from Preferences", async ({ page }) => {
    await mockQuestionsApi(page);
    await mockUsersApi(page);

    const playground = new PlaygroundPage(page);
    await playground.goto();
    await playground.clickAllQuestions();

    const questions = new QuestionsPage(page);
    await questions.openSidebar();
    await expect(questions.managementToolsHeading).toBeVisible({ timeout: FIREBASE_TIMEOUT });

    await questions.clickSidebarPreferences();
    await expect(questions.advancedFiltersDialogTitle).toBeVisible();
  });

  test("View mode switches between Normal and Turn Around", async ({ page }) => {
    await mockQuestionsApi(page);
    await mockReviewLevelApi(page);

    const playground = new PlaygroundPage(page);
    await playground.goto();
    await playground.clickAllQuestions();

    const questions = new QuestionsPage(page);
    await expect(questions.table).toBeVisible({ timeout: FIREBASE_TIMEOUT });

    await questions.openSidebar();
    await questions.clickSidebarTurnAround();

    await expect(questions.reviewLevelTable).toBeVisible({ timeout: FIREBASE_TIMEOUT });

    await questions.openSidebar();
    await questions.clickSidebarNormal();
    await expect(questions.table).toBeVisible({ timeout: FIREBASE_TIMEOUT });
  });

  test("Question details panel opens when a row is clicked", async ({ page }) => {
    await mockQuestionsApi(page);
    await mockQuestionFullData(page);

    const playground = new PlaygroundPage(page);
    await playground.goto();
    await playground.clickAllQuestions();

    const questions = new QuestionsPage(page);
    await expect(questions.table).toBeVisible({ timeout: FIREBASE_TIMEOUT });

    await questions.openFirstQuestion();
    await expect(questions.questionDetailsTitle).toBeVisible({ timeout: FIREBASE_TIMEOUT });
    await expect(questions.submissionHistoryHeading).toBeVisible();
  });

  test("Review Level table renders in Turn Around view", async ({ page }) => {
    await mockQuestionsApi(page);
    await mockReviewLevelApi(page);

    const playground = new PlaygroundPage(page);
    await playground.goto();
    await playground.clickAllQuestions();

    const questions = new QuestionsPage(page);
    await expect(questions.table).toBeVisible({ timeout: FIREBASE_TIMEOUT });

    await questions.openSidebar();
    await questions.clickSidebarTurnAround();

    await expect(questions.reviewLevelTable).toBeVisible({ timeout: FIREBASE_TIMEOUT });
    await expect(questions.reviewLevelTable.locator("tbody tr")).not.toHaveCount(0);
  });

  test("Reallocation confirmation dialog opens from sidebar", async ({ page }) => {
    await mockQuestionsApi(page);
    await mockReallocationApi(page);

    const playground = new PlaygroundPage(page);
    await playground.goto();
    await playground.clickAllQuestions();

    const questions = new QuestionsPage(page);
    await expect(questions.table).toBeVisible({ timeout: FIREBASE_TIMEOUT });

    await questions.openReallocationModal();
    await expect(questions.reallocationConfirmationTitle).toBeVisible({ timeout: FIREBASE_TIMEOUT });
    await expect(questions.defaultEscalationButton).toBeVisible();
    await expect(questions.inactiveToActiveButton).toBeVisible();
  });
});
