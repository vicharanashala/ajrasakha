import { test, expect } from "@playwright/test";
import { setupAuth, mockUsers } from "../fixtures/auth";
import { mockQAApi } from "../fixtures/qa-interface";
import { PlaygroundPage } from "../pages/PlaygroundPage";
import { QAInterfacePage } from "../pages/QAInterfacePage";

const FIREBASE_TIMEOUT = 15000;

test.describe("Queue & Review Flow", () => {
  test("expert queue page loads with sidebar", async ({ page }) => {
    await setupAuth(page, mockUsers.expert);
    await mockQAApi(page);

    const playground = new PlaygroundPage(page);
    await playground.goto();
    await playground.clickMyQueue();

    const qa = new QAInterfacePage(page);
    await expect(qa.sidebarTitle).toBeVisible({ timeout: FIREBASE_TIMEOUT });
    await expect(qa.questionRadioGroup).toBeVisible();
  });

  test("sidebar shows question items that can be selected", async ({ page }) => {
    await setupAuth(page, mockUsers.expert);
    await mockQAApi(page);

    const playground = new PlaygroundPage(page);
    await playground.goto();
    await playground.clickMyQueue();

    const qa = new QAInterfacePage(page);
    await expect(qa.questionRadioGroup).toBeVisible({ timeout: FIREBASE_TIMEOUT });

    const radioCount = await qa.questionRadioGroup.getByRole("radio").count();
    expect(radioCount).toBeGreaterThanOrEqual(1);
  });

  test("selecting a question without history shows first response form", async ({ page }) => {
    await setupAuth(page, mockUsers.expert);
    await mockQAApi(page);

    const playground = new PlaygroundPage(page);
    await playground.goto();
    await playground.clickMyQueue();

    const qa = new QAInterfacePage(page);
    const firstRadio = qa.questionRadioGroup.getByRole("radio").first();
    await firstRadio.click({ timeout: FIREBASE_TIMEOUT });

    await expect(qa.responsePanelTitle).toBeVisible({ timeout: FIREBASE_TIMEOUT });
    await expect(qa.currentQueryLabel).toBeVisible();
  });

  test("preferences dialog opens and closes", async ({ page }) => {
    await setupAuth(page, mockUsers.expert);
    await mockQAApi(page);

    const playground = new PlaygroundPage(page);
    await playground.goto();
    await playground.clickMyQueue();

    const qa = new QAInterfacePage(page);
    await expect(qa.preferencesButton).toBeVisible({ timeout: FIREBASE_TIMEOUT });

    await qa.preferencesButton.click();
    await expect(qa.preferencesDialogTitle).toBeVisible({ timeout: FIREBASE_TIMEOUT });

    await qa.preferencesApplyButton.click();
    await expect(qa.preferencesDialogTitle).not.toBeVisible();
  });

  test("view metadata dialog opens from response panel", async ({ page }) => {
    await setupAuth(page, mockUsers.expert);
    await mockQAApi(page);

    const playground = new PlaygroundPage(page);
    await playground.goto();
    await playground.clickMyQueue();

    const qa = new QAInterfacePage(page);
    const firstRadio = qa.questionRadioGroup.getByRole("radio").first();
    await firstRadio.click({ timeout: FIREBASE_TIMEOUT });

    await expect(qa.viewMetadataButton).toBeVisible({ timeout: FIREBASE_TIMEOUT });
    await qa.viewMetadataButton.click();
    await expect(qa.questionDetailsTitle).toBeVisible({ timeout: FIREBASE_TIMEOUT });
  });
});
