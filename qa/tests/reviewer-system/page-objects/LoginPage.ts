/**
 * Page Object: LoginPage
 *
 * Target:  desk.vicharanashala.ai / desk.ajrasakha.in (Reviewer System)
 * Scope:   /login  (and any pre-auth landing the SPA redirects to)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  SELECTOR NOTES
 * ─────────────────────────────────────────────────────────────────────────────
 *  The Reviewer System frontend is hosted at desk.vicharanashala.ai and is
 *  NOT in this monorepo.  Selectors below use best-guess `data-testid`
 *  values that the frontend team can confirm / rename in one place
 *  (see SELECTOR_MAP below).
 *
 *  Any line marked `// TODO(selector)` must be swapped for the real selector
 *  once the staging DOM is confirmed.  Tests fail loudly if the locator
 *  returns 0 matches, so wiring the wrong testid surfaces immediately.
 *
 *  Update SELECTOR_MAP and you only edit ONE file.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { expect, Locator, Page } from "@playwright/test";
import { SELECTOR_MAP, Routes } from "./selector-map";

export class LoginPage {
  readonly page: Page;

  // ── Locators ──────────────────────────────────────────────────────────────
  // TODO(selector): confirm / rename against staging DOM.
  get emailInput(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.login.email}"]`);
  }

  get passwordInput(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.login.password}"]`);
  }

  get submitButton(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.login.submit}"]`);
  }

  /** Region shown for invalid credentials / server error. */
  get errorMessage(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.login.error}"]`);
  }

  /** Optional: "forgot password" link. */
  get forgotPasswordLink(): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.login.forgotPassword}"]`,
    );
  }

  constructor(page: Page) {
    this.page = page;
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  /**
   * Open the login page.  Defaults to "/login" but accepts overrides
   * (e.g. "/") in case the SPA redirects to login from elsewhere.
   */
  async goto(path: string = Routes.login): Promise<void> {
    await this.page.goto(path);
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  /** Fill the email field.  Resilient to autofocus / clearing state. */
  async fillEmail(email: string): Promise<void> {
    await this.emailInput.fill("");
    await this.emailInput.fill(email);
  }

  async fillPassword(password: string): Promise<void> {
    await this.passwordInput.fill("");
    await this.passwordInput.fill(password);
  }

  /**
   * Click the submit button.  We deliberately do NOT wait for `networkidle`
   * — auth pages commonly hold a websocket or polling request open which
   * makes invalid-credential tests time out waiting for "idle".  DOM
   * contentloaded is sufficient for the assertion to follow.
   */
  async submit(): Promise<void> {
    await this.submitButton.click();
    await this.page.waitForLoadState("domcontentloaded");
  }

  /** One-shot helper: navigate, fill, submit.  Returns after navigation. */
  async login(email: string, password: string): Promise<void> {
    await this.goto();
    await this.fillEmail(email);
    await this.fillPassword(password);
    await this.submit();
  }

  // ── Assertions ─────────────────────────────────────────────────────────────
  /**
   * Asserts the visible error message contains `text`.  If no error is
   * shown, the assertion fails with the page URL so the failure is debuggable.
   */
  async assertErrorContains(text: string | RegExp): Promise<void> {
    await expect(this.errorMessage).toBeVisible({ timeout: 5_000 });
    await expect(this.errorMessage).toContainText(text);
  }

  /**
   * Assert the page DID NOT navigate away from /login.
   * Used by the negative login test — keeps the suite honest when staging
   * silently auto-redirects on bad creds.
   */
  async assertStillOnLogin(): Promise<void> {
    const escaped = Routes.login.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    await expect(this.page).toHaveURL(new RegExp(`${escaped}$`));
  }
}