import { test, expect } from '@playwright/test';
import { AuthPage } from '../../src/pages/auth.page';

test.describe('Auth — login screen', () => {
  test.beforeEach(async ({ page }) => {
    await new AuthPage(page).goto();
  });

  test('uses the Review system document title', async ({ page }) => {
    await expect(page).toHaveTitle(/Review system/i);
  });

  test('lands on /auth', async ({ page }) => {
    await expect(page).toHaveURL(/\/auth\/?$/);
  });

  test('shows the Annam logo', async ({ page }) => {
    await expect(new AuthPage(page).logo).toBeVisible();
  });

  test('shows Welcome Back', async ({ page }) => {
    await expect(new AuthPage(page).welcomeHeading).toBeVisible();
  });

  test('shows email and password fields', async ({ page }) => {
    const auth = new AuthPage(page);
    await expect(auth.email).toBeVisible();
    await expect(auth.password).toBeVisible();
  });

  test('email field is type=email with placeholder', async ({ page }) => {
    const auth = new AuthPage(page);
    await expect(auth.email).toHaveAttribute('type', 'email');
    await expect(auth.email).toHaveAttribute('placeholder', 'user@example.com');
  });

  test('password field is type=password with placeholder', async ({ page }) => {
    const auth = new AuthPage(page);
    await expect(auth.password).toHaveAttribute('type', 'password');
    await expect(auth.password).toHaveAttribute(
      'placeholder',
      'Enter your password',
    );
  });

  test('shows Sign In as a submit button', async ({ page }) => {
    await expect(new AuthPage(page).signIn).toHaveAttribute('type', 'submit');
  });

  test('shows Forgot password', async ({ page }) => {
    await expect(new AuthPage(page).forgotPassword).toBeVisible();
  });

  test('shows switch to signup', async ({ page }) => {
    await expect(new AuthPage(page).switchToSignup).toBeVisible();
  });

  test('mentions New to Annam', async ({ page }) => {
    await expect(page.getByText(/New to Annam/i)).toBeVisible();
  });

  test('empty sign-in stays on the auth page', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.signIn.click();
    await expect(page).toHaveURL(/\/auth\/?$/);
    await expect(auth.signIn).toBeVisible();
  });

  test('rejects a malformed email', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.email.fill('not-an-email');
    await auth.password.fill('password123');
    await auth.signIn.click();
    const valid = await auth.email.evaluate(
      (el) => (el as HTMLInputElement).validity.valid,
    );
    expect(valid).toBe(false);
  });

  test('toggles password visibility', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.password.fill('secret-value');
    await expect(auth.password).toHaveAttribute('type', 'password');
    await auth.passwordToggle.click();
    await expect(auth.password).toHaveAttribute('type', 'text');
    await auth.passwordToggle.click();
    await expect(auth.password).toHaveAttribute('type', 'password');
  });

  test('shows an error for unknown credentials', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.email.fill('e2e-unknown-user@example.com');
    await auth.password.fill('definitely-wrong-password');
    await auth.signIn.click();
    await expect(page).toHaveURL(/\/auth\/?$/);
    await expect(
      page.getByText(/invalid|incorrect|wrong|failed|error|not found|user/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Auth — forgot password', () => {
  test('opens Reset Password from login', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();
    await auth.forgotPassword.click();
    await expect(auth.resetHeading).toBeVisible();
    await expect(
      page.getByText(/send you a link to reset your password/i),
    ).toBeVisible();
    await expect(auth.sendResetLink).toBeVisible();
    await expect(auth.backToLogin).toBeVisible();
  });

  test('reset with empty email stays on Reset Password', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();
    await auth.forgotPassword.click();
    await auth.sendResetLink.click();
    await expect(auth.resetHeading).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/?$/);
  });

  test('returns to login from reset', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();
    await auth.forgotPassword.click();
    await auth.backToLogin.click();
    await expect(auth.welcomeHeading).toBeVisible();
    await expect(auth.signIn).toBeVisible();
  });
});

test.describe('Auth — signup', () => {
  test('switches to Join Annam', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();
    await auth.switchToSignup.click();
    await expect(auth.joinHeading).toBeVisible();
    await expect(auth.fullName).toBeVisible();
    await expect(auth.email).toBeVisible();
    await expect(auth.password).toBeVisible();
    await expect(auth.confirmPassword).toBeVisible();
    await expect(auth.createAccount).toBeVisible();
    await expect(auth.switchToLogin).toBeVisible();
  });

  test('shows Already have an account copy', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();
    await auth.switchToSignup.click();
    await expect(page.getByText(/Already have an account/i)).toBeVisible();
  });

  test('full name placeholder is present', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();
    await auth.switchToSignup.click();
    await expect(auth.fullName).toHaveAttribute(
      'placeholder',
      'Enter your full name',
    );
  });

  test('confirm password placeholder is present', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();
    await auth.switchToSignup.click();
    await expect(auth.confirmPassword).toHaveAttribute(
      'placeholder',
      'Confirm your password',
    );
  });

  test('returns to login from signup', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();
    await auth.switchToSignup.click();
    await auth.switchToLogin.click();
    await expect(auth.welcomeHeading).toBeVisible();
    await expect(auth.signIn).toBeVisible();
  });
});
