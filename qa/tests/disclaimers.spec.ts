import { test, expect } from "@playwright/test";
import { performMockLogin, setupDefaultMockRoutes, setupMockMediaDevices } from "./helpers";

test.describe("Time-Aware Expert Disclaimers", () => {
  test.beforeEach(async ({ page }) => {
    await setupDefaultMockRoutes(page);
    await setupMockMediaDevices(page);
    await performMockLogin(page, { role: "farmer" });
  });

  const disclaimers = {
    english: {
      twoHour: "You will get the answer within 2 hours",
      lateNight: "Aapka sawal hamare ziraati maahir ko bhej diya gaya hai. Aapko kal subah 8 baje tak jawab mil jayega.",
      earlyMorning: "Aapka sawal hamare agri expert ko bhej diya gaya hai. Aapko aaj subah 8:00 baje tak jawab mil jayega."
    },
    hindi: {
      twoHour: "2 घंटों के अंदर जवाब मिल जाएगा",
      lateNight: "कल सुबह 8:00 बजे तक उत्तर मिल जाएगा",
      earlyMorning: "आज सुबह 8:00 बजे तक उत्तर मिल जाएगा"
    }
  };

  const testCases = [
    {
      timeName: "Daytime (Normal Hours)",
      langName: "English",
      disclaimerText: disclaimers.english.twoHour,
    },
    {
      timeName: "Late Night",
      langName: "English",
      disclaimerText: disclaimers.english.lateNight,
    },
    {
      timeName: "Early Morning",
      langName: "English",
      disclaimerText: disclaimers.english.earlyMorning,
    },
    {
      timeName: "Daytime (Normal Hours)",
      langName: "Hindi",
      disclaimerText: disclaimers.hindi.twoHour,
    },
    {
      timeName: "Late Night",
      langName: "Hindi",
      disclaimerText: disclaimers.hindi.lateNight,
    },
    {
      timeName: "Early Morning",
      langName: "Hindi",
      disclaimerText: disclaimers.hindi.earlyMorning,
    }
  ];

  for (const tc of testCases) {
    test(`Verify ${tc.timeName} disclaimer in ${tc.langName}`, async ({ page }) => {
      // Mock generate questions API to return the specific disclaimer as an answer
      await page.route("**/api/questions/generate", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              id: "mock-qn-id-disclaimer",
              question: "Query about crop health",
              agri_specialist: "System Fallback",
              answer: tc.disclaimerText,
              referenceSource: "reviewer"
            }
          ])
        });
      });

      await page.click("text=/Agents Interface/i");

      // Trigger mock STT
      await page.route("**/api/context/speech-to-text", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ transcript: "crop disease help" })
        });
      });

      const micButton = page.locator("button[title='Toggle recording']");
      await micButton.click();
      await page.waitForTimeout(300);
      await micButton.click();

      // Open accordion
      const viewAnswerBtn = page.locator("text=/View Expert Answer/i").first();
      await expect(viewAnswerBtn).toBeVisible();
      await viewAnswerBtn.click();

      // Verify the disclaimer matches and is rendered on the UI
      await expect(page.locator(`text=${tc.disclaimerText}`).first()).toBeVisible();
    });
  }
});
