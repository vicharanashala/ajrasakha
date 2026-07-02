/**
 * Auth setup — runs once before all tests that depend on the 'setup' project.
 * Logs in with the test credentials and saves the browser storage state.
 * All subsequent tests re-use this state instead of logging in each time.
 *
 * Uses REAL credentials against the STAGING app.
 * For CI: set E2E_EMAIL and E2E_PASSWORD as GitHub secrets.
 */
import { test as setup, expect } from '@playwright/test';
import * as path from 'path';

const AUTH_FILE = path.join(__dirname, '../.auth/user.json');

setup('authenticate', async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'E2E_EMAIL and E2E_PASSWORD must be set in e2e/.env (or as CI secrets). ' +
      'Copy e2e/.env.example to e2e/.env and fill in credentials.'
    );
  }

  await page.goto('/auth');

  // Wait for the auth form to be ready
  await page.locator('input#email').waitFor({ state: 'visible', timeout: 15_000 });

  // Fill in credentials
  await page.locator('input#email').fill(email);
  await page.locator('input#password').fill(password);
  await page.locator('[data-testid="auth-submit-button"]').click();

  // Wait for successful redirect to /home
  await page.waitForURL('**/home**', { timeout: 30_000 });

  // Confirm we're authenticated by checking a stable element
  await expect(page.locator('img[alt="Annam Logo"]')).toBeVisible({ timeout: 10_000 });

  // Save auth state (cookies + localStorage including Firebase auth token)
  await page.context().storageState({ path: AUTH_FILE });
});
