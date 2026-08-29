import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Login Page Object — /auth route.
 *
 * Maps to <AuthForm> which renders email + password inputs via <AuthFields>.
 * Input ids come from `field.name` in signupFields: "email", "password".
 */
export class LoginPage extends BasePage {
  // ── Locators ────────────────────────────────────────────────

  /** Email input field (id="email" from AuthFields) */
  readonly emailInput: Locator;

  /** Password input field (id="password" from AuthFields) */
  readonly passwordInput: Locator;

  /** Submit button — "Sign In" or "Create Account" depending on mode */
  readonly submitButton: Locator;

  /** Error message(s) displayed under fields */
  readonly fieldErrors: Locator;

  /** General auth error (e.g. wrong credentials toast / inline) */
  readonly authError: Locator;

  /** "Forgot password?" link */
  readonly forgotPasswordLink: Locator;

  /** Mode toggle — "Sign up" / "Log in" */
  readonly modeToggle: Locator;

  constructor(page: Page) {
    super(page);
    this.emailInput = page.locator('input#email');
    this.passwordInput = page.locator('input#password');
    this.submitButton = page.locator('button[type="submit"]');
    this.fieldErrors = page.locator('.text-red-500');
    this.authError = page.locator('[data-sonner-toast], .text-red-500, [role="alert"]');
    this.forgotPasswordLink = page.getByText('Forgot password?');
    this.modeToggle = page.locator('button:has-text("Sign up"), button:has-text("Sign Up")').last();
  }

  // ── Actions ─────────────────────────────────────────────────

  async goto(): Promise<void> {
    await this.navigateTo('/auth');
  }

  async login(email: string, password: string): Promise<void> {
    await this.emailInput.waitFor({ state: 'visible', timeout: 15_000 });
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);

    // Wait for submit button to be enabled (not in loading state)
    await this.submitButton.waitFor({ state: 'visible' });
    await this.submitButton.click();

    // Wait briefly for Firebase to start processing
    await this.page.waitForTimeout(500);
  }

  async getErrorMessages(): Promise<string[]> {
    const errors = await this.fieldErrors.allTextContents();
    return errors.map((e) => e.trim()).filter(Boolean);
  }

  /** Check if we are currently on the auth page */
  async isOnAuthPage(): Promise<boolean> {
    const path = await this.currentPath();
    return path.startsWith('/auth');
  }
}
