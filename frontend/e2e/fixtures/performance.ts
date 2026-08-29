import type { Page } from "@playwright/test";

export const mockOverviewData = {
  userRoleOverview: [
    { role: "admin", count: 1, active: 1 },
    { role: "moderator", count: 5, active: 3 },
    { role: "expert", count: 20, active: 15 },
  ],
  stfExpertCount: 2,
  stfModeratorCount: 1,
  approvalRate: 85,
  moderatorApprovalRate: { approved: 10, pending: 5, approvalRate: 66.67 },
};

export const mockStatusOverview = {
  questions: [
    { status: "Open", value: 45 },
    { status: "Assigned", value: 20 },
    { status: "Under Review", value: 12 },
    { status: "Resolved", value: 85 },
    { status: "Closed", value: 30 },
  ],
  answers: [
    { status: "Pending", value: 20 },
    { status: "Approved", value: 50 },
    { status: "Rejected", value: 10 },
    { status: "Needs Improvement", value: 5 },
  ],
};

export const mockExpertPerformance = [
  {
    expert: "Expert One",
    reputation: 90,
    incentive: 50,
    penalty: 10,
  },
  {
    expert: "Expert Two",
    reputation: 75,
    incentive: 30,
    penalty: 20,
  },
];

export const mockGoldenDataset = {
  type: "year" as const,
  totalEntriesByType: 220,
  totalVerifiedByType: 170,
  verifiedEntries: 170,
  yearData: [
    { month: "Jan", entries: 100, verified: 80 },
    { month: "Feb", entries: 120, verified: 90 },
  ],
  weeksData: [
    { week: "Week 1", entries: 25, verified: 20 },
    { week: "Week 2", entries: 30, verified: 25 },
  ],
  dailyData: [
    { day: "Mon", entries: 10, verified: 8 },
    { day: "Tue", entries: 12, verified: 10 },
  ],
  dayHourlyData: {
    Mon: [
      { hour: "9AM", entries: 3, verified: 2 },
      { hour: "10AM", entries: 5, verified: 4 },
    ],
  },
  moderatorBreakdown: [],
  todayApproved: 42,
};

export const mockQuestionsAnalytics = {
  cropData: [
    { name: "Rice", count: 40, percentage: 40 },
    { name: "Wheat", count: 30, percentage: 30 },
    { name: "Cotton", count: 30, percentage: 30 },
  ],
  stateData: [
    { name: "Andhra Pradesh", count: 50 },
    { name: "Punjab", count: 50 },
  ],
  domainData: [
    { name: "Pest Management", count: 60 },
    { name: "Soil Health", count: 40 },
  ],
  tableData: [],
};

export async function mockDashboardApi(page: Page) {
  await page.route("**/api/performance/overview*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockOverviewData),
    });
  });

  await page.route("**/api/performance/status-overview*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockStatusOverview),
    });
  });

  await page.route("**/api/performance/expert-performance*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockExpertPerformance),
    });
  });

  await page.route("**/api/performance/golden-dataset*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockGoldenDataset),
    });
  });

  await page.route("**/api/performance/questions-analytics*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockQuestionsAnalytics),
    });
  });

  // Optional: contribution-trend, heatMap — return empty
  await page.route("**/api/performance/contribution-trend*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route("**/api/performance/heatMap*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [], total: 0 }),
    });
  });

  // Notifications — required by layout header
  await page.route("**/api/notifications*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ notifications: [], page: 1, totalCount: 0, totalPages: 0 }),
    });
  });

  // Location states
  await page.route("**/api/location/states", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  // All users
  await page.route("**/api/users/all", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  // Crops (GET /api/crops?sort=...&type=crop|chemical|other)
  await page.route("**/api/crops*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [], totalCount: 0, page: 1, totalPages: 0 }),
    });
  });

  // Chemicals
  await page.route("**/api/chemicals*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  // Questions detailed (POST /api/questions/detailed?...)
  await page.route("**/api/questions/detailed*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ questions: [], totalCount: 0, page: 1, totalPages: 0 }),
    });
  });

  // Users review-level
  await page.route("**/api/users/review-level*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
}
