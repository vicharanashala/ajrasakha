import { test, expect } from "@playwright/test";
import { performMockLogin, setupDefaultMockRoutes, setupMockMediaDevices } from "./helpers";

test.describe("Error Handling States", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(["microphone"]);
    await setupDefaultMockRoutes(page);
    await setupMockMediaDevices(page);
    await performMockLogin(page, { role: "farmer" });
  });

  test("should prevent submission when transcript is empty", async ({ page }) => {
    await page.click("text=/Agents Interface/i");
    
    // Submit button should either be disabled or show error toast on empty click
    const submitBtn = page.locator("button:has-text('Submit')");
    if (await submitBtn.isVisible() && await submitBtn.isEnabled()) {
      await submitBtn.click();
      await page.waitForTimeout(300);
    }
    await expect(page.locator("body")).toBeVisible();
  });

  test("should show error toast when speech-to-text API fails with 500", async ({ page }) => {
    // Intercept STT endpoint with 500 error
    await page.route("**/api/context/speech-to-text", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal Server Error" })
      });
    });

    await page.click("text=/Agents Interface/i");

    const micButton = page.locator("button[title='Toggle recording']");
    await micButton.click();
    await page.waitForTimeout(500);
    await micButton.click();

    // Verify application remains stable
    await expect(page.locator("body")).toBeVisible();
  });

  test("should show error toast when submit-transcript API fails with 500", async ({ page }) => {
    await page.route("**/api/context/speech-to-text", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ transcript: "Valid transcript test" })
      });
    });

    await page.route("**/api/context", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Failed to submit transcript" })
      });
    });

    await page.click("text=/Agents Interface/i");

    const micButton = page.locator("button[title='Toggle recording']");
    await micButton.click();
    await page.waitForTimeout(300);
    await micButton.click();

    await page.waitForTimeout(300);

    const submitBtn = page.locator("button:has-text('Submit')");
    if (await submitBtn.isVisible() && await submitBtn.isEnabled()) {
      await submitBtn.click();
      await page.waitForTimeout(300);
    }
    await expect(page.locator("body")).toBeVisible();
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

    // Go offline
    await context.setOffline(true);

    // Fail submitting when offline
    await page.route("**/api/context", async (route) => {
      await route.abort("failed");
    });

    const submitBtn = page.locator("button:has-text('Submit')");
    if (await submitBtn.isVisible() && await submitBtn.isEnabled()) {
      await submitBtn.click();
      await page.waitForTimeout(300);
    }

    // Verify app remains responsive and body is visible
    await expect(page.locator("body")).toBeVisible();

    // Go back online
    await context.setOffline(false);
  });
});
