import { expect, type Page } from "@playwright/test";

export class LoginPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto("/auth");
    await expect(this.page.locator('[data-slot="card-title"]')).toHaveText(
      "Welcome Back",
    );
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.page.getByLabel("Email Address").fill(email);
    await this.page.getByLabel("Password").fill(password);
    await this.page.getByRole("button", { name: "Sign In" }).click();
  }

  async signInAndWaitForLanding(
    email: string,
    password: string,
  ): Promise<void> {
    await this.open();
    await this.signIn(email, password);
    await expect(this.page).toHaveURL(
      /\/(home|pae-expert|user\/[^/?#]+)(?:[/?#]|$)/,
      {
        timeout: 30_000,
      },
    );
  }
}
