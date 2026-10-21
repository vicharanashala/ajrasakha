import { test, expect } from "@playwright/test";
import { performMockLogin, setupDefaultMockRoutes, setupMockMediaDevices } from "./helpers";

test.describe("Farmer Query Flow", () => {
  test.beforeEach(async ({ page }) => {
    await setupDefaultMockRoutes(page);
    await setupMockMediaDevices(page);
    await performMockLogin(page, { role: "farmer" });
  });

  const testCases = [
    { lang: "English", query: "How to cure brown spot in paddy?", crop: "Paddy" },
    { lang: "Hindi", query: "धान में भूरा धब्बा रोग का इलाज क्या है?", crop: "Paddy" },
    { lang: "Bengali", query: "ধানের পাতার বাদামী দাগ রোগের প্রতিকার কি?", crop: "Paddy" },
    { lang: "Telugu", query: "వరి లో గోధుమ రంగు मच्च తెగులు నివారణ ఎలా?", crop: "Paddy" },
    { lang: "Marathi", query: "भातावरील तपकिरी ठिपके रोगाचे नियंत्रण कसे करावे?", crop: "Rice" }
  ];

  for (const tc of testCases) {
    test(`Submit query in ${tc.lang} for ${tc.crop}`, async ({ page }) => {
      // Mock generate questions API (plural)
      await page.route("**/api/questions/generate", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              id: "mock-qn-id-1",
              question: `Matched expert question about ${tc.crop}?`,
              agri_specialist: "Dr. Ashok Kumar",
              answer: `Here is the expert recommendation to treat ${tc.crop} pests.`,
              referenceSource: "golden"
            }
          ])
        });
      });

      // Mock transcript submit API
      let submittedTranscript = "";
      await page.route("**/api/context", async (route) => {
        if (route.request().method() === "POST") {
          const body = JSON.parse(route.request().postData() || "{}");
          submittedTranscript = body.transcript;
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
        }
      });

      // Click "Agents Interface" tab (which is in the header)
      await page.click("text=/Agents Interface/i");
      
      // Check that the Voice Recorder is present
      await expect(page.locator("text=/Voice Recorder/i")).toBeVisible();

      // Mock speech-to-text
      await page.route("**/api/context/speech-to-text", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ transcript: tc.query })
        });
      });

      // Click the Mic button to toggle recording
      const micButton = page.locator("button[title='Toggle recording']");
      await micButton.click();
      
      // Wait a moment and stop recording (it triggers mock speech-to-text)
      await page.waitForTimeout(500);
      await micButton.click();

      // The transcript should be displayed on the page
      await expect(page.locator(`text=${tc.query}`)).toBeVisible();

      // View matched expert answer directly
      const viewAnswerBtn = page.locator("text=/View Expert Answer/i").first();
      await expect(viewAnswerBtn).toBeVisible();
      await viewAnswerBtn.click();

      await expect(page.locator("text=/Dr. Ashok Kumar/i").first()).toBeVisible();
      await expect(page.locator("text=/expert recommendation/i").first()).toBeVisible();

      // Submit the query
      await page.click("button:has-text('Submit')");

      // Verify that success notification/toast appears
      await expect(page.locator("text=/submitted successfully/i").first()).toBeVisible();
      expect(submittedTranscript.trim()).toBe(tc.query);
    });
  }

  test("should load historic questions for expert preview", async ({ page }) => {
    await page.route("**/api/questions/generate", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "qn-1",
            question: "What is eNAM pricing?",
            agri_specialist: "Market Specialist",
            answer: "Check eNAM portal for daily updates.",
            referenceSource: "reviewer"
          }
        ])
      });
    });

    await page.click("text=/Agents Interface/i");
    
    // Trigger mock STT
    await page.route("**/api/context/speech-to-text", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ transcript: "pricing info" }) });
    });
    const mic = page.locator("button[title='Toggle recording']");
    await mic.click();
    await page.waitForTimeout(300);
    await mic.click();

    // Verify matched questions
    await expect(page.locator("text=/What is eNAM pricing/i").first()).toBeVisible();
  });
});
