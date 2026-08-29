import { test, expect } from '../fixtures/auth.fixture';
import { LoginPage } from '../pages/login.page';

/**
 * Auth Guards & Role-Based Access Control
 *
 * 4 tests covering authentication redirects and role-based route access.
 */
test.describe('Auth Guards & Role-Based Access', () => {

  // ─────────────────────────────────────────────────────────────
  // Test 40: Unauthenticated user is redirected to /auth
  // ─────────────────────────────────────────────────────────────
  test('AG.1 — Unauthenticated user is redirected to /auth', async ({ unauthenticatedPage }) => {
    // Try to access /home without auth
    await unauthenticatedPage.goto('/home', { waitUntil: 'domcontentloaded' });

    // Wait for the redirect to /auth
    await unauthenticatedPage.waitForURL((url) => url.pathname.startsWith('/auth'), {
      timeout: 15_000,
    });

    const path = new URL(unauthenticatedPage.url()).pathname;
    expect(path).toMatch(/^\/auth/);
  });

  // ─────────────────────────────────────────────────────────────
  // Test 41: Moderator can access moderator routes
  // ─────────────────────────────────────────────────────────────
  test('AG.2 — Moderator can access moderator routes', async ({ moderatorPage }) => {
    // Navigate to home
    await moderatorPage.goto('/home', { waitUntil: 'domcontentloaded' });
    await moderatorPage.waitForLoadState('domcontentloaded');

    const path = new URL(moderatorPage.url()).pathname;
    // Moderator should NOT be redirected to /auth
    expect(path).not.toMatch(/^\/auth/);

    // Moderator should be able to see dashboard content
    const mainContent = moderatorPage.locator('main, [class*="dashboard"], [class*="Dashboard"], [class*="playground"]').first();
    const hasContent = await mainContent.isVisible().catch(() => false);
    expect(hasContent || path.startsWith('/user/')).toBeTruthy();
  });

  // ─────────────────────────────────────────────────────────────
  // Test 42: Expert cannot access moderator-only routes
  // ─────────────────────────────────────────────────────────────
  test('AG.3 — Expert cannot access moderator-only routes', async ({ expertPage }) => {
    // Try to access coordinator page as expert
    await expertPage.goto('/coordinator', { waitUntil: 'domcontentloaded' });

    // Wait for any redirect to settle
    await expertPage.waitForLoadState('domcontentloaded');
    await expertPage.waitForTimeout(3000);

    const path = new URL(expertPage.url()).pathname;
    // Expert should be redirected away from /coordinator
    // (either to /home, /pae-expert, or /auth)
    expect(path.startsWith('/coordinator')).toBeFalsy();
  });

  // ─────────────────────────────────────────────────────────────
  // Test 43: Invalid login credentials show an error message
  // ─────────────────────────────────────────────────────────────
  test('AG.4 — Invalid login credentials show an error message', async ({ unauthenticatedPage }) => {
    const loginPage = new LoginPage(unauthenticatedPage);
    await loginPage.goto();

    // Try to login with invalid credentials
    await loginPage.login('invalid@test.com', 'wrongpassword123');

    // Should show an error message (sonner toast renders as [data-sonner-toast])
    // The app calls toast.error("Invalid Credentials") on auth failure
    const errorElement = unauthenticatedPage.locator(
      '[data-sonner-toast]'
    ).first();

    // Wait for the toast to become visible
    await expect(errorElement).toBeVisible({ timeout: 15_000 });

    // Should still be on auth page
    const path = new URL(unauthenticatedPage.url()).pathname;
    expect(path).toMatch(/^\/auth/);
  });
});
