import { test, expect } from "@playwright/test";
import { setupAuth, mockUsers } from "../fixtures/auth";
import { PlaygroundPage } from "../pages/PlaygroundPage";

const FIREBASE_TIMEOUT = 15000;

test.describe("Role-Based Tabs", () => {
  test("admin sees admin tabs", async ({ page }) => {
    await setupAuth(page, mockUsers.admin);
    const playground = new PlaygroundPage(page);
    await playground.goto();

    await expect(playground.dashboardTab).toBeVisible({ timeout: FIREBASE_TIMEOUT });

    const visible = await playground.getVisibleTabs();
    expect(visible).toContain("Dashboard");
    expect(visible).toContain("All Questions");
    expect(visible).toContain("User Management");
    expect(visible).toContain("Agents Interface");
    expect(visible).toContain("Manage Agents");
    expect(visible).toContain("ChatBot Analytics");
    expect(visible).toContain("Data Processing");
    expect(visible).not.toContain("My Queue");
    expect(visible).not.toContain("Call Interface");
    expect(visible).not.toContain("Call History");
  });

  test("moderator sees moderator tabs", async ({ page }) => {
    await setupAuth(page, mockUsers.moderator);
    const playground = new PlaygroundPage(page);
    await playground.goto();

    await expect(playground.dashboardTab).toBeVisible({ timeout: FIREBASE_TIMEOUT });

    const visible = await playground.getVisibleTabs();
    expect(visible).toContain("Dashboard");
    expect(visible).toContain("All Questions");
    expect(visible).toContain("Expert Management");
    expect(visible).toContain("Agents Interface");
    expect(visible).toContain("ChatBot Analytics");
    expect(visible).not.toContain("My Queue");
    expect(visible).not.toContain("User Management");
    expect(visible).not.toContain("Manage Agents");
    expect(visible).not.toContain("Data Processing");
    expect(visible).not.toContain("Call Interface");
    expect(visible).not.toContain("Call History");
  });

  test("expert sees expert tabs", async ({ page }) => {
    await setupAuth(page, mockUsers.expert);
    const playground = new PlaygroundPage(page);
    await playground.goto();

    await expect(playground.myQueueTab).toBeVisible({ timeout: FIREBASE_TIMEOUT });

    const visible = await playground.getVisibleTabs();
    expect(visible).toContain("Dashboard");
    expect(visible).toContain("My Queue");
    expect(visible).toContain("All Questions");
    expect(visible).toContain("Agents Interface");
    expect(visible).not.toContain("User Management");
    expect(visible).not.toContain("Expert Management");
    expect(visible).not.toContain("Manage Agents");
    expect(visible).not.toContain("ChatBot Analytics");
    expect(visible).not.toContain("Data Processing");
    expect(visible).not.toContain("Call Interface");
    expect(visible).not.toContain("Call History");
  });

  test("call_agent sees call agent tabs", async ({ page }) => {
    await setupAuth(page, mockUsers.callAgent);
    const playground = new PlaygroundPage(page);
    await playground.goto();

    await expect(page.getByRole("tab", { name: "Call Interface" })).toBeVisible({ timeout: FIREBASE_TIMEOUT });

    const visible = await playground.getVisibleTabs();
    expect(visible).toContain("Call Interface");
    expect(visible).toContain("Call History");
    expect(visible).not.toContain("Dashboard");
    expect(visible).not.toContain("My Queue");
    expect(visible).not.toContain("All Questions");
    expect(visible).not.toContain("User Management");
    expect(visible).not.toContain("Agents Interface");
    expect(visible).not.toContain("Manage Agents");
    expect(visible).not.toContain("ChatBot Analytics");
    expect(visible).not.toContain("Data Processing");
  });
});
