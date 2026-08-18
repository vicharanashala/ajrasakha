import { type Page, expect } from "@playwright/test";
import { env } from "./config";

/** Login through the real UI (Firebase email/password). */
export async function login(
  page: Page,
  credentials: { email: string; password: string },
): Promise<void> {
  await page.goto("/auth");
  await page.getByLabel(/email address/i).fill(credentials.email);
  await page.getByLabel(/password/i).fill(credentials.password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expectLoggedIn(page);
}

/** Wait until the SPA has a session: URL leaves /auth and the header appears. */
export async function expectLoggedIn(page: Page): Promise<void> {
  await expect
    .poll(() => page.url(), { timeout: 30_000 })
    .not.toContain("/auth");
  // The dashboard chunk is compiled on-demand by Vite in dev; on a cold
  // transform the header can take several seconds to render after the URL
  // has already left /auth. Give it the same budget as the URL poll.
  await expect(page.locator("header")).toBeVisible({ timeout: 30_000 });
}

/** Switch the role-aware tab in the playground header. */
export async function openTab(page: Page, label: string): Promise<void> {
  const tab = page.getByRole("tab", { name: label, exact: true }).first();
  await tab.click();
  await expect(tab).toHaveAttribute("data-state", "active");
}

/** Wait for the questions table (or grid) to render its first row. */
export async function waitForQuestionRows(page: Page): Promise<void> {
  const row = page.locator("tbody tr").first();
  await expect(row).toBeVisible({ timeout: 30_000 });
}

/** A toast is the app's primary success/failure signal (sonner). */
export async function expectToast(page: Page, text: string): Promise<void> {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }))
    .toBeVisible()
    .catch(() => {
      // fallback: text visible anywhere in the DOM
      expect(page.getByText(text).first()).toBeVisible();
    });
}

/** Read a value from the app's persisted auth/user storage keys. */
export async function readLocalStorage(
  page: Page,
  key: string,
): Promise<string | null> {
  return page.evaluate((k) => localStorage.getItem(k), key);
}

/** Clear a localStorage key (drafts/tab-preference isolation between tests). */
export async function clearLocalStorageKey(page: Page, key: string): Promise<void> {
  await page.evaluate((k) => localStorage.removeItem(k), key);
}

/**
 * Navigate to an authed route and wait for the app header. On a cold Vite
 * dev-server transform the header can take several seconds to render after
 * the URL has already left /auth, so retry once inside the budget.
 */
export async function gotoHomeExpectHeader(
  page: Page,
  path = "/home",
): Promise<void> {
  await page.goto(path);
  try {
    await expect(page.locator("header")).toBeVisible({ timeout: 12_000 });
  } catch {
    await page.goto(path);
    await expect(page.locator("header")).toBeVisible({ timeout: 15_000 });
  }
}

/**
 * Reset the role's persisted default-tab preference and reload, so the app
 * falls back to the role's documented default tab. The preference key is
 * `playground_active_tab_<email>` (play-ground.tsx). Navigate first so the
 * page is on an app origin before touching localStorage (a fresh context is
 * still on about:blank, where localStorage access throws SecurityError).
 */
export async function gotoDefaultTab(page: Page): Promise<void> {
  await gotoHomeExpectHeader(page);
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("playground_active_tab_")) localStorage.removeItem(key);
    }
  });
  await page.reload();
  await expect(page.locator("header")).toBeVisible({ timeout: 30_000 });
}

/** Log the current user out through the UI profile menu. */
export async function logout(page: Page): Promise<void> {
  await page.locator("header button:has([data-slot='avatar'])").click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.getByRole("menuitem", { name: "Logout", exact: true }).click();
  const confirm = page.getByRole("alertdialog", {
    name: "Are you sure you want to log out?",
  });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Logout", exact: true }).click();
  await expect(page).toHaveURL(/\/auth/, { timeout: 30_000 });
}

/**
 * Verify a reviewer push through Reviewer-System state only (never GDB reads):
 * the success toast, then the question/answer state via the backend API.
 */
export async function expectPushToGdbToast(page: Page): Promise<void> {
  await expectToast(page, "Answer pushed to GDB successfully");
}

export { env };
