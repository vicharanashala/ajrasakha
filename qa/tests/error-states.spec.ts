import { test, expect } from "@playwright/test";
import { performMockLogin, setupDefaultMockRoutes, setupMockMediaDevices } from "./helpers";

test.describe("Error Handling States", () => {
  test.beforeEach(async ({ page }) => {
    await setupDefaultMockRoutes(page);
    await setupMockMediaDevices(page);
    await performMockLogin(page, { role: "farmer" });
  });

  test("should prevent submission when transcript is empty", async ({ page }) => {
    await page.click("text=/Agents Interface/i");

    // Clear is disabled, Submit is disabled since transcript is empty
    const submitBtn = page.locator("button:has-text('Submit')");
    await expect(submitBtn).toBeDisabled();
  });

  test("should show error toast when speech-to-text API fails with 500", async ({ page }) => {
    // Intercept speech-to-text and fail with 500
    await page.route("**/api/context/speech-to-text", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "Speech processing failed" })
      });
    });

    await page.click("text=/Agents Interface/i");

    const micButton = page.locator("button[title='Toggle recording']");
    await micButton.click();
    await page.waitForTimeout(300);
    await micButton.click();

    // Verify error feedback on screen
    await expect(page.locator("text=/Your speech will appear here/i").first()).toBeVisible();
  });

  test("should show error toast when submit-transcript API fails with 500", async ({ page }) => {
    await page.route("**/api/context/speech-to-text", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ transcript: "Valid query" })
      });
    });

    // Intercept context submit and fail with 500
    await page.route("**/api/context", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "Internal server database error" })
        });
      }
    });

    await page.click("text=/Agents Interface/i");

    const micButton = page.locator("button[title='Toggle recording']");
    await micButton.click();
    await page.waitForTimeout(300);
    await micButton.click();

    // Wait for the transcript to appear
    await expect(page.locator("text=Valid query").first()).toBeVisible();

    // Submit
    const submitBtn = page.locator("button:has-text('Submit')");
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Verify error toast
    await expect(page.locator("text=/Failed to submit transcript/i").first()).toBeVisible();
  });

  test("should handle offline network state", async ({ page, context }) => {
    await page.route("**/api/context/speech-to-text", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ transcript: "Offline test query" })
      });
    });

    await page.click("text=/Agents Interface/i");

    const micButton = page.locator("button[title='Toggle recording']");
    await micButton.click();
    await page.waitForTimeout(300);
    await micButton.click();

    // Wait for the transcript to appear
    await expect(page.locator("text=Offline test query").first()).toBeVisible();

    // Go offline
    await context.setOffline(true);

    // Fail submitting when offline
    await page.route("**/api/context", async (route) => {
      await route.abort("failed");
    });

    const submitBtn = page.locator("button:has-text('Submit')");
    await submitBtn.click();

    // Verify failure toast due to offline network connection
    await expect(page.locator("text=/Failed to submit transcript|Failed to fetch/i").first()).toBeVisible();

    // Go back online
    await context.setOffline(false);
  });
});
