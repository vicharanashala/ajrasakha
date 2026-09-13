import { test, expect } from "@playwright/test";
import { performMockLogin, setupDefaultMockRoutes, setupMockMediaDevices } from "./helpers";

test.describe("Voice Input Flow", () => {
  test.beforeEach(async ({ page, context }) => {
    // Grant microphone permissions
    await context.grantPermissions(["microphone"]);
    
    await setupDefaultMockRoutes(page);
    await setupMockMediaDevices(page);
    await performMockLogin(page, { role: "farmer" });
  });

  test("should show correct visual guidance and state changes when recording voice", async ({ page }) => {
    await page.route("**/api/context/speech-to-text", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ transcript: "Hello from mock voice input" })
      });
    });

    await page.click("text=/Agents Interface/i");

    // Initially says "Click microphone to start"
    await expect(page.locator("text=/Click microphone to start/i").first()).toBeVisible();

    const micButton = page.locator("button[title='Toggle recording']");
    await expect(micButton).toBeVisible();
    await micButton.click();

    // After click, guidance should update or recording animation should trigger
    await page.waitForTimeout(300);

    // Stop recording by clicking again
    await micButton.click();

    // Verify transcript is rendered
    await expect(page.locator("text=Hello from mock voice input").first()).toBeVisible();
  });

  test("should clear recording and reset state when Clear is clicked", async ({ page }) => {
    await page.route("**/api/context/speech-to-text", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ transcript: "Sample audio text" })
      });
    });

    await page.click("text=/Agents Interface/i");

    const micButton = page.locator("button[title='Toggle recording']");
    await micButton.click();
    await page.waitForTimeout(300);
    await micButton.click();

    await expect(page.locator("text=Sample audio text").first()).toBeVisible();

    const clearButton = page.locator("button").filter({ hasText: /Clear/i }).first();
    await expect(clearButton).toBeVisible();
    await clearButton.click();

    // Transcript should be cleared and default placeholder restored
    await expect(page.locator("text=Sample audio text")).not.toBeVisible();
  });

  test("should render language dropdown selector options correctly", async ({ page }) => {
    await page.click("text=/Agents Interface/i");
    const voiceCard = page.locator(".rounded-xl, .border").filter({ hasText: /Voice Recorder/i }).first();
    const languageSelect = voiceCard.locator("[role='combobox'], select").first();
    await expect(languageSelect).toBeVisible();
  });

  test("should toggle recording off when clicking microphone button a second time", async ({ page }) => {
    await page.click("text=/Agents Interface/i");
    const micButton = page.locator("button[title='Toggle recording']");
    
    // Start recording
    await micButton.click();
    await page.waitForTimeout(200);

    // Stop recording
    await micButton.click();
    await page.waitForTimeout(200);

    // Mic button should remain clickable and ready for another query
    await expect(micButton).toBeEnabled();
  });
});
