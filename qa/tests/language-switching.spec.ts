import { test, expect } from "@playwright/test";
import { performMockLogin, setupDefaultMockRoutes, setupMockMediaDevices } from "./helpers";

test.describe("Language Switching Mid-Session", () => {
  test.beforeEach(async ({ page }) => {
    await setupDefaultMockRoutes(page);
    await setupMockMediaDevices(page);
    await performMockLogin(page, { role: "farmer" });
  });

  test("should switch languages correctly mid-session", async ({ page }) => {
    await page.click("text=/Agents Interface/i");

    // Locate the select dropdown trigger by finding the Voice Recorder card container first
    const card = page.locator("div.border:has-text('Voice Recorder')").first();
    const languageSelect = card.locator("role=combobox");
    await expect(languageSelect).toBeVisible();
    await expect(languageSelect).toBeEnabled();
    
    // Default text should be Auto Detection
    await expect(languageSelect).toHaveText(/Auto Detection/i);

    // Click language select dropdown trigger
    await languageSelect.click();

    // Select Hindi
    await page.click("text=Hindi");

    // The select trigger text should update to Hindi
    await expect(languageSelect).toHaveText(/Hindi/i);
  });

  test("should pass the selected language to speech-to-text API", async ({ page }) => {
    let requestedLanguage = "";

    await page.route("**/api/context/speech-to-text", async (route) => {
      const request = route.request();
      if (request.method() === "POST") {
        const postData = request.postData();
        if (postData) {
          const match = postData.match(/name="language"[\r\n]+[\r\n]+([^\r\n]+)/);
          if (match && match[1]) {
            requestedLanguage = match[1];
          }
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ transcript: "धान की पैदावार कैसे बढ़ाएं?" })
        });
      }
    });

    await page.click("text=/Agents Interface/i");

    // Change language to Hindi (hi-IN)
    const card = page.locator("div.border:has-text('Voice Recorder')").first();
    const languageSelect = card.locator("role=combobox");
    await languageSelect.click();
    await page.click("text=Hindi");

    // Start/stop recording
    const micButton = page.locator("button[title='Toggle recording']");
    await micButton.click();
    await page.waitForTimeout(300);
    await micButton.click();

    // Verify STT was invoked with the correct language code
    expect(requestedLanguage).toContain("hi-IN");
    await expect(page.locator("text=/धान की पैदावार कैसे बढ़ाएं/i").first()).toBeVisible();
  });
});
