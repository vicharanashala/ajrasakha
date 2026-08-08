import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers";

test.describe("Authentication and Role Redirection", () => {
  test.skip("unauthenticated user is redirected to /auth", async ({ page }) => {
    // Navigate to root homepage
    await page.goto("/");
    
    // Expect redirection to /auth
    await expect(page).toHaveURL(/\/auth/);
  });

  test.skip("expert user is redirected to /pae-expert", async ({ page }) => {
    const mockExpert = {
      uid: "expert-uid-123",
      email: "expert@test.com",
      name: "Expert User",
      role: "pae_expert",
    };

    // Set up Playwright route interception for API call to /api/users/me
    await page.route("**/api/users/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          _id: mockExpert.uid,
          uid: mockExpert.uid,
          email: mockExpert.email,
          name: mockExpert.name,
          role: mockExpert.role,
        }),
      });
    });

    // Seed mock auth credentials to localStorage
    await loginAs(page, mockExpert);

    // Navigate to homepage
    await page.goto("/");

    // Expect redirection to /pae-expert
    await expect(page).toHaveURL(/\/pae-expert/);
  });

  test.skip("coordinator user is redirected to /user/:id", async ({ page }) => {
    const mockCoordinator = {
      uid: "coord-uid-123",
      email: "coordinator@test.com",
      name: "Coordinator User",
      role: "coordinator",
    };

    await page.route("**/api/users/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          _id: mockCoordinator.uid,
          uid: mockCoordinator.uid,
          email: mockCoordinator.email,
          name: mockCoordinator.name,
          role: mockCoordinator.role,
        }),
      });
    });

    await loginAs(page, mockCoordinator);
    await page.goto("/");

    // Expect redirection to coordinator profile/dashboard (/user/coord-uid-123)
    await expect(page).toHaveURL(new RegExp(`/user/${mockCoordinator.uid}`));
  });
});
