import type { Page, Locator } from "@playwright/test";

export class AuthPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;
  readonly googleButton: Locator;
  readonly errorMessage: Locator;
  readonly forgotPasswordLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('input[name="email"]');
    this.passwordInput = page.locator('input[name="password"]');
    this.signInButton = page.locator('button[type="submit"]');
    this.googleButton = page.getByRole("button", { name: /google/i });
    this.errorMessage = page.locator(".text-red-500, [role='alert']");
    this.forgotPasswordLink = page.getByRole("button", {
      name: /forgot password/i,
    });
  }

  async goto() {
    await this.page.goto("/auth");
    await this.emailInput.waitFor({ timeout: 15_000 });
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.signInButton.click();
  }

  async waitForRedirect(timeout = 30_000) {
    await this.page.waitForURL("**/home", { timeout });
  }
}
