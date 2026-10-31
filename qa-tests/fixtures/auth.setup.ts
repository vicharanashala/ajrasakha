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
  let page: Page | undefined;
  const consoleErrors: string[] = [];
  const failedResponses: string[] = [];
  try {
    page = await context.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(redactCredentials(message.text(), email, password));
      }
    });
    page.on('response', (response) => {
      const url = new URL(response.url());
      const isFirebaseAuth =
        url.hostname === 'identitytoolkit.googleapis.com' ||
        url.hostname === 'securetoken.googleapis.com';
      const isLocalApi = url.origin === 'http://localhost:8080';
      if (response.status() >= 400 && (isFirebaseAuth || isLocalApi)) {
        failedResponses.push(`${response.request().method()} ${url.pathname} ${response.status()}`);
      }
    });
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.signIn(email, password);
    await waitForLogin(page, name, email, password, consoleErrors, failedResponses);
    await context.storageState({
      path: resolve(__dirname, '..', 'playwright', '.auth', `${name}.json`),
      indexedDB: true,
    });
  } catch (error) {
    operationFailed = true;
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith(`Could not authenticate ${name}:`)) {
      throw error;
    }

    const toastTexts = page ? await getVisibleToastTexts(page) : [];
    throw createLoginError(
      name,
      message,
      toastTexts,
      consoleErrors,
      failedResponses,
      email,
      password,
    );
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

function redactCredentials(text: string, email: string, password: string) {
  const credentials = [email, password].flatMap((credential) => [
    credential,
    encodeURIComponent(credential),
    new URLSearchParams({ credential }).toString().slice('credential='.length),
    JSON.stringify(credential).slice(1, -1),
  ]);
  return credentials.reduce(
    (redacted, credential) => redacted.split(credential).join('[redacted]'),
    text,
  );
}

async function getVisibleToastTexts(page: Page) {
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

  return toastTexts;
}

function createLoginError(
  name: 'moderator' | 'expert',
  reason: string,
  toastTexts: string[],
  consoleErrors: string[],
  failedResponses: string[],
  email: string,
  password: string,
) {
  const redact = (text: string) => redactCredentials(text, email, password);
  return new Error(
    `Could not authenticate ${name}: ${redact(reason)}\n` +
      `Visible toast: ${toastTexts.length ? toastTexts.map(redact).join(' | ') : 'none'}\n` +
      `Console errors: ${consoleErrors.length ? consoleErrors.map(redact).join(' | ') : 'none'}\n` +
      `Failed responses: ${failedResponses.length ? failedResponses.join(' | ') : 'none'}`,
  );
}

async function waitForLogin(
  page: Page,
  name: 'moderator' | 'expert',
  email: string,
  password: string,
  consoleErrors: string[],
  failedResponses: string[],
) {
  let toastTexts: string[] = [];

  try {
    try {
      await page.waitForFunction(
        () =>
          Array.from(document.querySelectorAll('[data-sonner-toast], [role="status"], [role="alert"]'))
            .some((element) => {
              const style = window.getComputedStyle(element);
              return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
            }),
        undefined,
        { timeout: 3_000 },
      );
    } catch (error) {
      if (!(error instanceof Error && error.name === 'TimeoutError')) {
        throw error;
      }
    }
    toastTexts = await getVisibleToastTexts(page);

    if (toastTexts.length && page.url().includes('/auth')) {
      throw createLoginError(
        name,
        'Sign-in did not leave /auth within 3 seconds.',
        toastTexts,
        consoleErrors,
        failedResponses,
        email,
        password,
      );
    }

    await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 60_000 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(`Could not authenticate ${name}:`)) {
      throw error;
    }
    if (!(error instanceof Error && error.name === 'TimeoutError')) {
      throw error;
    }

    toastTexts = await getVisibleToastTexts(page);
    throw createLoginError(
      name,
      'URL did not leave /auth within 60 seconds.',
      toastTexts,
      consoleErrors,
      failedResponses,
      email,
      password,
    );
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
