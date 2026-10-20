import { test, type Browser, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { LoginPage } from '../pages/LoginPage';

async function authenticateAccount(
  browser: Browser,
  name: 'moderator' | 'expert',
  email: string | undefined,
  password: string | undefined,
) {
  if (!email || !password) {
    throw new Error(`Missing credentials for the ${name} account in qa-tests/.env`);
  }

  const context = await browser.newContext({
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
  });
  let operationFailed = false;
  try {
    const page = await context.newPage();
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.signIn(email, password);
    await waitForLogin(page, name);
    await context.storageState({
      path: resolve(__dirname, '..', 'playwright', '.auth', `${name}.json`),
      indexedDB: true,
    });
  } catch (error) {
    operationFailed = true;
    throw error;
  } finally {
    try {
      await context.close();
    } catch (cleanupError) {
      if (!operationFailed) {
        throw cleanupError;
      }
    }
  }
}

async function waitForLogin(page: Page, name: 'moderator' | 'expert') {
  try {
    await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 60_000 });
  } catch {
    const toastLocators = page.locator('[data-sonner-toast], [role="status"], [role="alert"]');
    const toastTexts: string[] = [];

    for (let index = 0; index < await toastLocators.count(); index++) {
      const toast = toastLocators.nth(index);
      if (await toast.isVisible()) {
        const text = (await toast.innerText()).trim();
        if (text) {
          toastTexts.push(text);
        }
      }
    }

    const reason = toastTexts.length
      ? ` Visible toast: ${toastTexts.join(' | ')}`
      : ' No visible toast was found.';
    throw new Error(`Could not authenticate ${name}: URL did not leave /auth.${reason}`);
  }
}

test('authenticate moderator', async ({ browser }) => {
  test.setTimeout(90_000);
  await authenticateAccount(browser, 'moderator', process.env.MODERATOR_EMAIL, process.env.MODERATOR_PASSWORD);
});

test('authenticate expert', async ({ browser }) => {
  test.setTimeout(90_000);
  await authenticateAccount(browser, 'expert', process.env.EXPERT_EMAIL, process.env.EXPERT_PASSWORD);
});
