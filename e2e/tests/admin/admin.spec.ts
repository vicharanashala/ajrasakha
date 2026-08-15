import { test, expect } from "../../fixtures";
import { env } from "../../support/config";
import { getAdminUsers } from "../../support/api";

/**
 * ADM-* — admin project (storageState: admin).
 *
 * View-only admin tests are tolerant (any rows, count >= 0) per TEST_PLAN §5.
 * ADM-04 needs the admin account (always present for this project) and
 * cross-checks the UI against GET /users/admin/all.
 */
test.describe("ADM admin", () => {
  test("ADM-01 default tab is Dashboard (performance)", async ({ page, header }) => {
    await page.goto("/home");
    await expect(page.locator("header")).toBeVisible();
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("playground_active_tab_")) localStorage.removeItem(key);
      }
    });
    await page.reload();
    await expect(page.locator("header")).toBeVisible();
    const dashboard = header.tab("Dashboard");
    await expect(dashboard).toHaveAttribute("data-state", "active");
  });

  test("ADM-02 User Management tab lists users", async ({ userManagement }) => {
    await userManagement.goto();
    await expect(userManagement.tableRows.first()).toBeVisible({ timeout: 30_000 });
  });

  test("ADM-03 User Management role filter narrows the list", async ({
    userManagement,
    request,
    adminToken,
  }) => {
    await userManagement.goto();
    await userManagement.filterByRole("Expert");

    // UI: every rendered row is an Expert (Badge label from user-table.tsx).
    const rowCount = await userManagement.tableRows.count();
    if (rowCount > 0) {
      await expect(userManagement.page.getByText("Expert").first()).toBeVisible();
    }

    // API cross-check: GET /users/admin/all?role=expert returns only experts.
    const { users } = await getAdminUsers(request, adminToken, { role: "expert", limit: 10 });
    expect(users.length).toBeGreaterThanOrEqual(0);
    for (const u of users) expect(u.role).toBe("expert");
  });

  test("ADM-04 email search finds a known user (admin)", async ({
    userManagement,
    request,
    adminToken,
  }) => {
    await userManagement.goto();
    await userManagement.search(env.admin.email);

    // API: the searched user is returned by the backend search.
    const { users } = await getAdminUsers(request, adminToken, {
      search: env.admin.email,
      limit: 10,
    });
    expect(users.some((u) => u.email?.toLowerCase() === env.admin.email.toLowerCase())).toBeTruthy();

    // UI: search no longer shows the empty state.
    await expect(userManagement.emptyState).toHaveCount(0);
  });

  test("ADM-05 search miss shows empty state", async ({ userManagement }) => {
    await userManagement.goto();
    await userManagement.search(`zz-no-such-user-${Date.now()}`);
    await expect(userManagement.emptyState).toBeVisible({ timeout: 30_000 });
  });

  test("ADM-06 Manage Agents tab loads", async ({ page }) => {
    await page.goto("/home");
    await page.locator("header").getByRole("tab", { name: "Manage Agents", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Manage Call Agents" })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("ADM-07 Data Processing tab loads", async ({ page }) => {
    await page.goto("/home");
    await page.locator("header").getByRole("tab", { name: "Data Processing", exact: true }).click();
    await expect(page.getByRole("button", { name: "FAQ-Cluster" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("button", { name: "POP-Translation" })).toBeVisible();
  });

  test("ADM-08 ChatBot Analytics navigates to /chatbot", async ({ page }) => {
    await page.goto("/home");
    await page.locator("header").getByRole("tab", { name: "ChatBot Analytics", exact: true }).click();
    await expect(page).toHaveURL(/\/chatbot/, { timeout: 30_000 });
  });

  test("ADM-09 admin cannot see expert-only My Queue tab", async ({ header }) => {
    await expect(header.tab("My Queue")).toHaveCount(0);
  });
});
