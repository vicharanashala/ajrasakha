/**
 * Centralised, *typed* access to environment variables used by the E2E tests.
 *
 * Every spec imports from here so we never sprinkle `process.env.X` across
 * the codebase.  Defaults are conservative (production URLs).
 */
export const testConfig = {
  reviewer: {
    baseURL: process.env.REVIEWER_BASE_URL || "https://desk.ajrasakha.in",
    moderator: {
      email: process.env.REVIEWER_MODERATOR_EMAIL || "",
      password: process.env.REVIEWER_MODERATOR_PASSWORD || "",
    },
    expert: {
      email: process.env.REVIEWER_EXPERT_EMAIL || "",
      password: process.env.REVIEWER_EXPERT_PASSWORD || "",
    },
    expert2: {
      email: process.env.REVIEWER_EXPERT_2_EMAIL || "",
      password: process.env.REVIEWER_EXPERT_2_PASSWORD || "",
    },
    reviewer: {
      email: process.env.REVIEWER_REVIEWER_EMAIL || "",
      password: process.env.REVIEWER_REVIEWER_PASSWORD || "",
    },
    coordinator: {
      email: process.env.REVIEWER_COORDINATOR_EMAIL || "",
      password: process.env.REVIEWER_COORDINATOR_PASSWORD || "",
    },
  },
  webapp: {
    baseURL: process.env.WEBAPP_BASE_URL || "https://ajrasakha.in",
    farmerPhone: process.env.WEBAPP_FARMER_PHONE || "+911234567890",
    farmerOtp: process.env.WEBAPP_OTP || "123456",
  },
} as const;

export type TestConfig = typeof testConfig;
