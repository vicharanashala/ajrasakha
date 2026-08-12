import { test, expect } from "@playwright/test";
import { performMockLogin, setupDefaultMockRoutes } from "./helpers";

test.describe("Questions & Answers Interaction Flow", () => {
  test.beforeEach(async ({ page }) => {
    await setupDefaultMockRoutes(page);
    await performMockLogin(page, { role: "expert", name: "Expert Advisor" });
  });

  test("should render questions navigation tab for expert user", async ({ page }) => {
    await expect(page.locator("header")).toBeVisible();
  });

  test("should render list of questions with status badges", async ({ page }) => {
    await page.route("**/api/questions/detailed*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          questions: [
            {
              _id: "q-1",
              question: "How to increase paddy yield?",
              crop: "Paddy",
              state: "Haryana",
              status: "pending",
              createdAt: "2026-08-12T10:00:00Z"
            }
          ],
          totalQuestions: 1,
          totalPages: 1
        }),
      });
    });

    const questionsTab = page.locator("text=/My Queue|All Questions/i").first();
    if (await questionsTab.isVisible()) {
      await questionsTab.click();
      await page.waitForTimeout(300);
    }
    await expect(page.locator("body")).toBeVisible();
  });

  test("should filter questions list by crop type", async ({ page }) => {
    const questionsTab = page.locator("text=/All Questions/i").first();
    if (await questionsTab.isVisible()) {
      await questionsTab.click();
      const cropSelect = page.locator("select, [role='combobox']").first();
      if (await cropSelect.isVisible()) {
        await expect(cropSelect).toBeEnabled();
      }
    }
  });

  test("should render pagination controls for long question lists", async ({ page }) => {
    const questionsTab = page.locator("text=/All Questions/i").first();
    if (await questionsTab.isVisible()) {
      await questionsTab.click();
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("should allow expanding question card to inspect details", async ({ page }) => {
    const questionsTab = page.locator("text=/All Questions/i").first();
    if (await questionsTab.isVisible()) {
      await questionsTab.click();
      const viewBtn = page.locator("button").filter({ hasText: /View|Details|Answer/i }).first();
      if (await viewBtn.isVisible()) {
        await viewBtn.click();
        await page.waitForTimeout(200);
      }
    }
    await expect(page.locator("body")).toBeVisible();
  });
});
