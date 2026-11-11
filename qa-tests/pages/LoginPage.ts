import type { Page } from '@playwright/test';

export class LoginPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/auth');
  }

  welcomeBackText() {
    return this.page.getByText('Welcome Back');
  }

  async signIn(email: string, password: string) {
    await this.page.getByLabel('Email Address').fill(email);
    await this.page.getByLabel('Password').fill(password);
    await this.page.getByRole('button', { name: 'Sign In' }).click();
  }
}
