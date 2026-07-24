import { test, expect } from "@playwright/test";
import { setupAuth, mockUsers } from "../fixtures/auth";

const FIREBASE_TIMEOUT = 15000;

async function mockFirebase(page: import("@playwright/test").Page) {
  // Prevent initAuthListener from overwriting the seeded Zustand user
  await page.route("**/src/routes/index.tsx*", async (route) => {
    const resp = await route.fetch();
    const body = await resp.text();
    await route.fulfill({
      body: body.replace(
        /initAuthListener\s*\(\s*\)/,
        "/* initAuthListener disabled in test */"
      ),
      contentType: "application/javascript",
    });
  });

  for (const domain of [
    "identitytoolkit.googleapis.com",
    "securetoken.googleapis.com",
    "firebase.googleapis.com",
    "firebaseinstallations.googleapis.com",
  ]) {
    await page.route(`**/${domain}/**`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
    );
  }
}

test.describe("Auth Guard", () => {
  test("unauthenticated user is redirected to /auth", async ({ page }) => {
    await mockFirebase(page);
    await page.route("**/api/users/me", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "null" })
    );

    await page.goto("/home");
    await expect(page).toHaveURL(/\/auth/, { timeout: FIREBASE_TIMEOUT });
  });

  test("pae_expert is redirected to /pae-expert", async ({ page }) => {
    await setupAuth(page, mockUsers.paeExpert);

    await page.goto("/home");
    await expect(page).toHaveURL(/\/pae-expert/, { timeout: FIREBASE_TIMEOUT });
  });

  test("coordinator is redirected to /user/:id", async ({ page }) => {
    test.setTimeout(120000);
    await setupAuth(page, mockUsers.coordinator);

    await page.goto("/home");
    await expect(page).toHaveURL(/\/user\/[a-f0-9]+/, { timeout: FIREBASE_TIMEOUT });
  });

  test("logout clears auth and redirects to /auth", async ({ page }) => {
    await setupAuth(page, mockUsers.admin);

    await page.goto("/home");
    const avatarBtn = page.getByRole("button").filter({ has: page.locator(".bg-green-100") }).first();
    await expect(avatarBtn).toBeVisible({ timeout: FIREBASE_TIMEOUT });

    await avatarBtn.click();
    await page.getByRole("menuitem", { name: /Logout/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /Logout/i }).click();

    await expect(page).toHaveURL(/\/auth/, { timeout: 15000 });
  });
});
