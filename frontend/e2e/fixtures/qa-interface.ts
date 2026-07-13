import type { Page } from "@playwright/test";
import type { IQuestion } from "../../src/types";

export const mockAllocatedQuestionNoHistory: IQuestion = {
  id: "q101",
  text: "What is the best fertilizer for paddy in sandy soil?",
  createdAt: "2025-01-20T10:00:00.000Z",
  updatedAt: "2025-01-20T10:00:00.000Z",
  assignedAt: "2025-01-20T10:05:00.000Z",
  totalAnswersCount: 0,
  priority: "high",
  status: "open",
  source: "AJRASAKHA",
  pae_review: false,
  history: [],
  details: {
    state: "Andhra Pradesh",
    district: "Guntur",
    crop: "Paddy",
    normalised_crop: "Rice",
    season: "Kharif",
    domain: "Soil Health",
  },
  isAutoAllocate: true,
  aiInitialAnswer: "For paddy in sandy soil, use NPK 20:10:10 at 100 kg/ha...",
  currentAnswers: [],
};

export const mockAllocatedQuestionWithHistory: IQuestion = {
  id: "q102",
  text: "How to control stem borer in rice?",
  createdAt: "2025-01-19T08:00:00.000Z",
  updatedAt: "2025-01-20T09:00:00.000Z",
  assignedAt: "2025-01-19T08:05:00.000Z",
  totalAnswersCount: 1,
  priority: "critical",
  status: "in-review",
  source: "AJRASAKHA",
  pae_review: false,
  history: [
    {
      updatedBy: { _id: "exp1", userName: "Expert One" },
      answer: {
        _id: "ans101",
        answer: "Use Carbofuran 3G at 10 kg/ha or Fipronil 0.3G at 12 kg/ha...",
        approvalCount: "0",
        sources: [],
        remarks: "Applied at early stage",
      },
      status: "in-review",
      createdAt: "2025-01-19T10:00:00.000Z",
      updatedAt: "2025-01-19T10:00:00.000Z",
    },
  ],
  details: {
    state: "Punjab",
    district: "Ludhiana",
    crop: "Rice",
    normalised_crop: "Rice",
    season: "Kharif",
    domain: "Pest Management",
  },
  isAutoAllocate: false,
  currentAnswers: [
    {
      answer: "Use Carbofuran 3G at 10 kg/ha or Fipronil 0.3G at 12 kg/ha...",
      id: "ans101",
      isFinalAnswer: false,
      createdAt: "2025-01-19T10:00:00.000Z",
    },
  ],
};

export async function mockQAApi(page: Page) {
  const questionList = [
    mockAllocatedQuestionNoHistory,
    mockAllocatedQuestionWithHistory,
  ];

  // allocated endpoint (actionType = "allocated") — GET/POST /api/questions/allocated?*
  await page.route("**/api/questions/allocated?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(questionList),
    });
  });

  // reroute endpoint (actionType = "reroute", which is the default) — POST /api/reroute/allocated?*
  await page.route("**/api/reroute/allocated*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(questionList),
    });
  });

  await page.route("**/api/questions/*/mark-opened", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.route("**/api/questions/q101", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockAllocatedQuestionNoHistory),
    });
  });

  await page.route("**/api/questions/q102", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockAllocatedQuestionWithHistory),
    });
  });

  // Single-question fetch when actionType = "reroute"
  await page.route("**/api/reroute/q101", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockAllocatedQuestionNoHistory),
    });
  });

  await page.route("**/api/reroute/q102", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockAllocatedQuestionWithHistory),
    });
  });

  await page.route("**/api/questions/allocated/page?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(1),
    });
  });

  await page.route("**/api/reroute/allocated/page?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(1),
    });
  });
}
