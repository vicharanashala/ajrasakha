import { Page, Locator, expect } from '@playwright/test';
import { Selectors } from '../helpers/selectors';

/**
 * LoginPage – encapsulates all interactions with /auth route.
 */
export class LoginPage {
  readonly page: Page;

  // Locators
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly forgotPasswordLink: Locator;
  readonly nameInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly forgotEmailInput: Locator;
  readonly sendResetLinkButton: Locator;
  readonly backToLoginButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator(Selectors.auth.emailInput);
    this.passwordInput = page.locator(Selectors.auth.passwordInput);
    this.submitButton = page.locator(Selectors.auth.submitButton);
    this.forgotPasswordLink = page.locator(Selectors.auth.forgotPasswordLink);
    this.nameInput = page.locator(Selectors.auth.nameInput);
    this.confirmPasswordInput = page.locator(Selectors.auth.confirmPasswordInput);
    this.forgotEmailInput = page.locator(Selectors.auth.forgotEmailInput);
    this.sendResetLinkButton = page.locator(Selectors.auth.resetLinkButton);
    this.backToLoginButton = page.locator(Selectors.auth.backToLoginButton);
  }

  async goto(): Promise<void> {
    await this.page.goto('/auth');
    await this.emailInput.waitFor({ state: 'visible', timeout: 15_000 });
  }

  async fillEmail(email: string): Promise<void> {
    await this.emailInput.fill(email);
  }

  async fillPassword(password: string): Promise<void> {
    await this.passwordInput.fill(password);
  }

  async clickSubmit(): Promise<void> {
    await this.submitButton.click();
  }

  async login(email: string, password: string): Promise<void> {
    await this.fillEmail(email);
    await this.fillPassword(password);
    await this.clickSubmit();
  }

  async loginAndWaitForHome(email: string, password: string): Promise<void> {
    await this.login(email, password);
    await this.page.waitForURL('**/home**', { timeout: 20_000 });
  }

  async clickForgotPassword(): Promise<void> {
    await this.forgotPasswordLink.click();
    // Wait for the forgot password form to appear
    await this.forgotEmailInput.waitFor({ state: 'visible', timeout: 5_000 });
  }

  async clickSignupToggle(): Promise<void> {
    // Find the signup/create account toggle link (not the submit button)
    const signupLink = this.page.getByText("Don't have an account").first()
      .or(this.page.getByRole('button', { name: /sign up/i }));
    await signupLink.click();
  }

  /** Assert that the login form is visible */
  async expectLoginFormVisible(): Promise<void> {
    await expect(this.emailInput).toBeVisible();
    await expect(this.passwordInput).toBeVisible();
    await expect(this.submitButton).toBeVisible();
  }

  /** Assert an error-like text appears anywhere on the page */
  async expectErrorVisible(text: string | RegExp): Promise<void> {
    await expect(this.page.getByText(text)).toBeVisible({ timeout: 10_000 });
  }
}
