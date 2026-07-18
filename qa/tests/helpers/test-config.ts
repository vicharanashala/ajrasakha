/**
 * Centralised, *typed* access to environment variables used by the E2E tests.
 *
 * Every spec imports from here so we never sprinkle `process.env.X` across
 * the codebase.  Defaults are conservative (production URLs).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  Naming conventions
 * ─────────────────────────────────────────────────────────────────────────────
 *  • **PR #1 (this PR)** adopted the friendlier names:
 *      `REVIEWER_STAGING_URL`, `MODERATOR_TEST_EMAIL/PASSWORD`,
 *      `EXPERT_TEST_EMAIL/PASSWORD`.
 *
 *  • The pre-existing CI secret names
 *      (`REVIEWER_BASE_URL`, `REVIEWER_MODERATOR_EMAIL/PASSWORD`,
 *       `REVIEWER_EXPERT_EMAIL/PASSWORD`, …) are still accepted as a
 *      fallback so a secrets rotation is a zero-downtime move.  The new
 *      names take precedence when both are set.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const env = (key: string): string | undefined => {
  const value = process.env[key];
  return value && value.length > 0 ? value : undefined;
};

const first = (...keys: string[]): string => {
  for (const key of keys) {
    const v = env(key);
    if (v) return v;
  }
  return "";
};

export const testConfig = {
  reviewer: {
    // Prefer the new staging name; fall back to the legacy CI alias.
    baseURL:
      first("REVIEWER_STAGING_URL", "REVIEWER_BASE_URL") ||
      "https://desk.ajrasakha.in",
    moderator: {
      email: first("MODERATOR_TEST_EMAIL", "REVIEWER_MODERATOR_EMAIL"),
      password: first("MODERATOR_TEST_PASSWORD", "REVIEWER_MODERATOR_PASSWORD"),
    },
    expert: {
      email: first("EXPERT_TEST_EMAIL", "REVIEWER_EXPERT_EMAIL"),
      password: first("EXPERT_TEST_PASSWORD", "REVIEWER_EXPERT_PASSWORD"),
    },
    expert2: {
      email: first("EXPERT_TEST_2_EMAIL", "REVIEWER_EXPERT_2_EMAIL"),
      password: first("EXPERT_TEST_2_PASSWORD", "REVIEWER_EXPERT_2_PASSWORD"),
    },
    reviewer: {
      email: first("REVIEWER_TEST_EMAIL", "REVIEWER_REVIEWER_EMAIL"),
      password: first("REVIEWER_TEST_PASSWORD", "REVIEWER_REVIEWER_PASSWORD"),
    },
    coordinator: {
      email: first(
        "COORDINATOR_TEST_EMAIL",
        "REVIEWER_COORDINATOR_EMAIL",
      ),
      password: first(
        "COORDINATOR_TEST_PASSWORD",
        "REVIEWER_COORDINATOR_PASSWORD",
      ),
    },
  },
  webapp: {
    baseURL: env("WEBAPP_BASE_URL") || "https://ajrasakha.in",
    farmerPhone: env("WEBAPP_FARMER_PHONE") || "+911234567890",
    farmerOtp: env("WEBAPP_OTP") || "123456",
  },
} as const;

export type TestConfig = typeof testConfig;