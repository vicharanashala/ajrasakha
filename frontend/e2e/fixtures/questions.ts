import type { Page } from "@playwright/test";

export const mockQuestions = [
  {
    _id: "q001",
    question: "What is the best fertilizer for rice?",
    userId: "admin-1",
    context: "",
    aiInitialAnswer: "",
    source: "AJRASAKHA",
    status: "answered",
    priority: "high",
    totalAnswersCount: 2,
    details: {
      state: "Andhra Pradesh",
      district: "Guntur",
      crop: "Rice",
      normalised_crop: "Rice",
      season: "Kharif",
      domain: ["Soil Health"],
    },
    metrics: { mean_similarity: 0, std_similarity: 0, recent_similarity: 0, collusion_score: 0 },
    createdAt: "2025-01-15T10:00:00.000Z",
    updatedAt: "2025-01-15T12:00:00.000Z",
  },
  {
    _id: "q002",
    question: "How to control pest in wheat?",
    userId: "admin-1",
    context: "",
    aiInitialAnswer: "",
    source: "AJRASAKHA",
    status: "in_review",
    priority: "medium",
    totalAnswersCount: 1,
    details: {
      state: "Punjab",
      district: "Ludhiana",
      crop: "Wheat",
      normalised_crop: "Wheat",
      season: "Rabi",
      domain: ["Pest Management"],
    },
    metrics: { mean_similarity: 0, std_similarity: 0, recent_similarity: 0, collusion_score: 0 },
    createdAt: "2025-01-16T08:00:00.000Z",
    updatedAt: "2025-01-16T09:00:00.000Z",
  },
  {
    _id: "q003",
    question: "Best practices for organic farming",
    userId: "admin-1",
    context: "",
    aiInitialAnswer: "",
    source: "MANUAL",
    status: "draft",
    priority: "low",
    totalAnswersCount: 0,
    details: {
      state: "Karnataka",
      district: "Belgaum",
      crop: "Cotton",
      normalised_crop: "Cotton",
      season: "Kharif",
      domain: ["Organic Farming"],
    },
    metrics: { mean_similarity: 0, std_similarity: 0, recent_similarity: 0, collusion_score: 0 },
    createdAt: "2025-01-17T14:00:00.000Z",
    updatedAt: "2025-01-17T14:30:00.000Z",
  },
];

export async function mockQuestionsApi(page: Page) {
  await page.route("**/api/questions/detailed*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        questions: mockQuestions,
        totalCount: mockQuestions.length,
        totalPages: 1,
      }),
    });
  });

  // Mock location/crops endpoints that the advanced filter sidebar calls
  await page.route("**/api/location/states*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(["Andhra Pradesh", "Punjab", "Karnataka"]),
    });
  });

  await page.route("**/api/crops*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { name: "Rice", type: "Kharif" },
        { name: "Wheat", type: "Rabi" },
        { name: "Cotton", type: "Kharif" },
      ]),
    });
  });
}
