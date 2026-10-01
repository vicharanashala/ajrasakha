import { type Locator, type Page, expect } from '@playwright/test';

export class AuthPage {
  readonly page: Page;
  readonly email: Locator;
  readonly password: Locator;
  readonly signIn: Locator;
  readonly forgotPassword: Locator;
  readonly switchToSignup: Locator;
  readonly switchToLogin: Locator;
  readonly logo: Locator;
  readonly welcomeHeading: Locator;
  readonly joinHeading: Locator;
  readonly fullName: Locator;
  readonly confirmPassword: Locator;
  readonly createAccount: Locator;
  readonly resetHeading: Locator;
  readonly sendResetLink: Locator;
  readonly backToLogin: Locator;
  readonly passwordToggle: Locator;

  constructor(page: Page) {
    this.page = page;
    this.email = page.getByRole('textbox', { name: 'Email Address' });
    this.password = page.locator('#password');
    this.signIn = page.getByRole('button', { name: 'Sign In' });
    this.forgotPassword = page.getByRole('button', { name: 'Forgot password?' });
    this.switchToSignup = page.getByRole('button', { name: 'Switch to signup' });
    this.switchToLogin = page.getByRole('button', { name: 'Switch to login' });
    this.logo = page.getByAltText('Annam Logo');
    this.welcomeHeading = page.getByText('Welcome Back');
    this.joinHeading = page.getByText('Join Annam');
    this.fullName = page.getByRole('textbox', { name: 'Full Name' });
    this.confirmPassword = page.getByRole('textbox', { name: 'Confirm Password' });
    this.createAccount = page.getByRole('button', { name: 'Create Account' });
    this.resetHeading = page.getByText('Reset Password');
    this.sendResetLink = page.getByRole('button', { name: 'Send Reset Link' });
    this.backToLogin = page.getByRole('button', { name: 'Back to Login' });
    this.passwordToggle = page.locator('#password').locator('..').getByRole('button');
  }

  async goto() {
    await this.page.goto('/auth');
    await expect(this.email).toBeVisible();
  }

  async login(email: string, password: string) {
    await this.goto();
    await this.email.fill(email);
    await this.password.fill(password);
    await this.signIn.click();
  }

  async expectLoggedIn() {
    await expect(this.page).not.toHaveURL(/\/auth\/?$/, { timeout: 20_000 });
  }
}
