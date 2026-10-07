import { test, expect } from "../../fixtures";
import { gotoDefaultTab } from "../../support/helpers";

/**
 * GATE-* — role gating & shared navigation. Runs once per role project
 * (admin, moderator, expert) so every assertion below must be role-agnostic:
 * it adapts to whichever role's saved session is driving the project.
 */
test.describe("GATE role gating", () => {
  test("GATE-01 role lands on its documented default tab", async ({ page, header }) => {
    await gotoDefaultTab(page);
    // Expert defaults to My Queue; admin/moderator default to Dashboard.
    // Detect which applies to this project's role without hardcoding it.
    const myQueue = header.tab("My Queue");
    if ((await myQueue.count()) > 0) {
      await expect(myQueue).toHaveAttribute("data-state", "active");
    } else {
      await expect(header.tab("Dashboard")).toHaveAttribute("data-state", "active");
    }
  });

  test("GATE-02 All Questions tab is visible", async ({ page, header }) => {
    await page.goto("/home");
    await expect(page.locator("header")).toBeVisible();
    await header.expectTabVisible("All Questions");
  });

  test("GATE-03 call-agent tabs are absent", async ({ page, header }) => {
    await page.goto("/home");
    await expect(page.locator("header")).toBeVisible();
    await header.expectTabHidden("Call Interface");
    await header.expectTabHidden("Call History");
  });
});

test.describe("GATE mobile sidebar", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("GATE-04 mobile sidebar mirrors the shared header tabs", async ({ page }) => {
    await page.goto("/home");
    const trigger = page.locator("header button:has(svg.lucide-menu)");
    await expect(trigger).toBeVisible();
    await trigger.click();

    const sheet = page.getByRole("dialog").last();
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(
      sheet.getByRole("button", { name: "All Questions", exact: true }),
    ).toBeVisible();
    // Call-agent entries must not leak into admin/moderator/expert sidebars.
    await expect(
      sheet.getByRole("button", { name: "Call Interface", exact: true }),
    ).toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(sheet).not.toBeVisible();
  });
});
