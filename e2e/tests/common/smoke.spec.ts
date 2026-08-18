import { test, expect } from "../../fixtures";
import { gotoHomeExpectHeader } from "../../support/helpers";

/**
 * Harness smoke checks. Runs once per authed project (admin, moderator,
 * expert) so each role's saved session is proven, plus the unauth checks in
 * tests/auth. These must stay fast and dependency-free.
 */
test.describe("smoke", () => {
  test("session from storageState stays authenticated after reload", async ({
    page,
  }) => {
    await gotoHomeExpectHeader(page);
    await expect(page.url()).not.toContain("/auth");
  });

  test("app shell renders the role-aware tab bar", async ({ page }) => {
    await gotoHomeExpectHeader(page);
    await expect(page.getByRole("tab", { name: "All Questions" })).toBeVisible();
    await expect(page.locator("header button:has([data-slot='avatar'])")).toBeVisible();
  });
});
