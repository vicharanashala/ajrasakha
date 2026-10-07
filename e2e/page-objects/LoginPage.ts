import { type Page, type Locator, expect } from "@playwright/test";

/**
 * Login/signup page object (route /auth).
 * Mechanics: `useAuthForm` posts to `userService.Getuser(email)` then
 * `signInWithEmailAndPassword`; the submit button reads "Sign In" ("Create
 * Account" in signup mode) and flips to "Please wait..." while pending.
 * "Forgot password?" is a <button>, and the mode switch uses the
 * aria-label "Switch to signup" (AuthModeSwitch.tsx).
 */
export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;
  readonly forgotPasswordButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByLabel(/email address/i);
    this.passwordInput = page.getByLabel(/password/i);
    this.signInButton = page.getByRole("button", { name: "Sign In" });
    this.forgotPasswordButton = page.getByRole("button", {
      name: /forgot password/i,
    });
  }

  async goto(): Promise<void> {
    await this.page.goto("/auth");
  }

  async fillCredentials(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
  }

  async submit(): Promise<void> {
    await this.signInButton.click();
  }

  /** Sign in and wait for the app shell. */
  async signIn(email: string, password: string): Promise<void> {
    await this.fillCredentials(email, password);
    await this.submit();
    await expect(this.page.locator("header")).toBeVisible({ timeout: 30_000 });
    await expect(this.page).not.toHaveURL(/\/auth/);
  }

  /** Switch the form into sign-up mode (AuthModeSwitch.tsx aria-label). */
  get signUpToggle(): Locator {
    return this.page.getByRole("button", { name: "Switch to signup" });
  }
}
