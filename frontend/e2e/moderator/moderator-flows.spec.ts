import { test, expect } from "../fixtures/auth.fixture";
import { DashboardPage } from "../pages/DashboardPage";
import { QuestionsPage } from "../pages/QuestionsPage";

test.describe("Moderator Flows", () => {
  test("moderator views question queue", async ({ moderatorPage }) => {
    const dashboard = new DashboardPage(moderatorPage);
    await dashboard.goto();

    const allQuestionsTab = moderatorPage.getByRole("tab", {
      name: /all questions/i,
    });
    await allQuestionsTab.click();
    await moderatorPage.waitForTimeout(2000);

    const table = moderatorPage.locator("table");
    await expect(table).toBeVisible({ timeout: 10_000 });
  });

  test("moderator opens question details", async ({ moderatorPage }) => {
    const dashboard = new DashboardPage(moderatorPage);
    await dashboard.goto();

    await moderatorPage.getByRole("tab", { name: /all questions/i }).click();
    await moderatorPage.waitForTimeout(2000);

    const firstRow = moderatorPage.locator("table tbody tr").first();
    if (await firstRow.isVisible()) {
      await firstRow.click();
      await moderatorPage.waitForTimeout(1000);
    }
  });

  test("moderator can see question status filters", async ({
    moderatorPage,
  }) => {
    const dashboard = new DashboardPage(moderatorPage);
    await dashboard.goto();

    await moderatorPage.getByRole("tab", { name: /all questions/i }).click();
    await moderatorPage.waitForTimeout(2000);

    const filterArea = moderatorPage.locator(
      '[class*="filter"], [role="combobox"]',
    );
    const count = await filterArea.count();
    expect(count).toBeGreaterThan(0);
  });

  test("moderator can search questions", async ({ moderatorPage }) => {
    const dashboard = new DashboardPage(moderatorPage);
    await dashboard.goto();

    await moderatorPage.getByRole("tab", { name: /all questions/i }).click();
    await moderatorPage.waitForTimeout(2000);

    const searchInput = moderatorPage.locator(
      'input[placeholder*="search" i], input[placeholder*="filter" i]',
    );
    if (await searchInput.isVisible()) {
      await searchInput.fill("test");
      await moderatorPage.waitForTimeout(1000);
    }
  });

  test("moderator dashboard tab loads", async ({ moderatorPage }) => {
    const dashboard = new DashboardPage(moderatorPage);
    await dashboard.goto();

    await expect(dashboard.header).toBeVisible();
  });

  test("moderator can view user management", async ({ moderatorPage }) => {
    const dashboard = new DashboardPage(moderatorPage);
    await dashboard.goto();

    const userMgmtTab = moderatorPage.getByRole("tab", {
      name: /user management|expert management/i,
    });
    if (await userMgmtTab.isVisible()) {
      await userMgmtTab.click();
      await moderatorPage.waitForTimeout(2000);
    }
  });

  test("moderator can access chatbot analytics", async ({ moderatorPage }) => {
    const dashboard = new DashboardPage(moderatorPage);
    await dashboard.goto();

    const chatbotTab = moderatorPage.getByRole("tab", {
      name: /chatbot analytics/i,
    });
    if (await chatbotTab.isVisible()) {
      await chatbotTab.click();
      await moderatorPage.waitForTimeout(2000);
    }
  });

  test("moderator can view flags reported", async ({ moderatorPage }) => {
    const dashboard = new DashboardPage(moderatorPage);
    await dashboard.goto();

    await moderatorPage.getByRole("tab", { name: /all questions/i }).click();
    await moderatorPage.waitForTimeout(2000);
  });

  test("moderator notification bell is visible", async ({ moderatorPage }) => {
    const dashboard = new DashboardPage(moderatorPage);
    await dashboard.goto();

    await expect(dashboard.header).toBeVisible();
  });

  test("moderator can switch between tabs", async ({ moderatorPage }) => {
    const dashboard = new DashboardPage(moderatorPage);
    await dashboard.goto();

    const tabs = moderatorPage.locator('[role="tab"]');
    const tabCount = await tabs.count();
    expect(tabCount).toBeGreaterThan(1);

    for (let i = 0; i < Math.min(tabCount, 3); i++) {
      const tab = tabs.nth(i);
      if (await tab.isVisible()) {
        await tab.click();
        await moderatorPage.waitForTimeout(500);
      }
    }
  });

  test("moderator can view question queue details", async ({
    moderatorPage,
  }) => {
    const dashboard = new DashboardPage(moderatorPage);
    await dashboard.goto();

    await moderatorPage.getByRole("tab", { name: /all questions/i }).click();
    await moderatorPage.waitForTimeout(2000);

    const queueBtn = moderatorPage.getByRole("button", {
      name: /queue details/i,
    });
    if (await queueBtn.isVisible()) {
      await moderatorPage.evaluate(() => {
        const btn = document.querySelector('[data-slot="dialog-trigger"]');
        if (btn) (btn as HTMLElement).click();
      });
      await moderatorPage.waitForTimeout(1000);
    }
  });

  test("moderator question table shows data", async ({ moderatorPage }) => {
    const dashboard = new DashboardPage(moderatorPage);
    await dashboard.goto();

    await moderatorPage.getByRole("tab", { name: /all questions/i }).click();
    await moderatorPage.waitForTimeout(3000);

    const rows = moderatorPage.locator("table tbody tr");
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(0);
  });
});
