import { test as setup, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { AuthPage } from '../src/pages/auth.page';
import { env, hasExpertCreds, hasModeratorCreds } from '../src/env';

const authDir = path.resolve(__dirname, '../.auth');

function ensureAuthDir() {
  fs.mkdirSync(authDir, { recursive: true });
}

setup('authenticate moderator', async ({ page }) => {
  ensureAuthDir();
  const storagePath = path.join(authDir, 'moderator.json');
  setup.skip(!hasModeratorCreds, 'Set MODERATOR_EMAIL and MODERATOR_PASSWORD');
  const auth = new AuthPage(page);
  await auth.login(env.moderatorEmail, env.moderatorPassword);
  await auth.expectLoggedIn();
  await expect(page.locator('#app')).toBeVisible();
  await page.context().storageState({ path: storagePath });
});

setup('authenticate expert', async ({ page }) => {
  ensureAuthDir();
  const storagePath = path.join(authDir, 'expert.json');
  setup.skip(!hasExpertCreds, 'Set EXPERT_EMAIL and EXPERT_PASSWORD');
  const auth = new AuthPage(page);
  await auth.login(env.expertEmail, env.expertPassword);
  await auth.expectLoggedIn();
  await expect(page.locator('#app')).toBeVisible();
  await page.context().storageState({ path: storagePath });
});
