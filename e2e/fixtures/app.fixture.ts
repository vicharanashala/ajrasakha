import { test as base, Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { HomePage } from '../pages/HomePage';
import { VoiceRecorderPage } from '../pages/VoiceRecorderPage';

/**
 * Extended test fixture that provides pre-constructed page objects.
 * Tests import `test` from here instead of @playwright/test.
 */
type AppFixtures = {
  loginPage: LoginPage;
  homePage: HomePage;
  voiceRecorderPage: VoiceRecorderPage;
};

export const test = base.extend<AppFixtures>({
  loginPage: async ({ page }: { page: Page }, use: (page: LoginPage) => Promise<void>) => {
    await use(new LoginPage(page));
  },

  homePage: async ({ page }: { page: Page }, use: (page: HomePage) => Promise<void>) => {
    await use(new HomePage(page));
  },

  voiceRecorderPage: async ({ page }: { page: Page }, use: (page: VoiceRecorderPage) => Promise<void>) => {
    await use(new VoiceRecorderPage(page));
  },
});

export { expect } from '@playwright/test';
