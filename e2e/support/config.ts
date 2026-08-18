import dotenv from "dotenv";

dotenv.config();

/**
 * Typed, lazily-validated env loader.
 *
 * Credentials are read from e2e/.env (gitignored). Accessing a role's
 * `email`/`password` throws with an actionable message when the corresponding
 * env var is missing — the suite must FAIL loudly, never silently skip, when
 * staging credentials are not configured (see TEST_PLAN.md §3).
 */

export function missingEnvVar(name: string): never {
  throw new Error(
    `Missing required env var ${name}. Copy e2e/.env.example to e2e/.env and fill in the staging ` +
      `credentials documented in TEST_PLAN.md §3 (Environment & accounts).`,
  );
}

function get(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

function roleCredentials(prefix: "E2E_ADMIN" | "E2E_MODERATOR" | "E2E_EXPERT") {
  const email = get(`${prefix}_EMAIL`);
  const password = get(`${prefix}_PASSWORD`);
  return {
    get email(): string {
      if (!email) missingEnvVar(`${prefix}_EMAIL`);
      return email as string;
    },
    get password(): string {
      if (!password) missingEnvVar(`${prefix}_PASSWORD`);
      return password as string;
    },
    configured(): boolean {
      return Boolean(email && password);
    },
  };
}

export const env = {
  /** Base URL of the Reviewer System under test (staging by default). */
  baseURL: get("E2E_BASE_URL") ?? "https://desk.vicharanashala.ai",
  /** API base the backend serves (used by seed/verify/cleanup helpers). */
  apiBaseURL: get("E2E_API_BASE_URL") ?? "https://desk.vicharanashala.ai/api",

  /**
   * True when running against the isolated local E2E environment
   * (Auth Emulator + local MongoDB + dev backend/frontend). Set via
   * E2E_LOCAL_MODE=true in e2e/.env. Token minting and seeding switch to the
   * emulator/local DB in this mode; staging is never touched.
   */
  localMode: get("E2E_LOCAL_MODE") === "true",
  /** Auth Emulator host (used only when localMode). */
  authEmulatorHost: get("E2E_AUTH_EMULATOR_HOST") ?? "127.0.0.1:9099",
  /** Local MongoDB connection (used only by the seed script; localMode). */
  dbURL: get("E2E_DB_URL") ?? "mongodb://127.0.0.1:27017",
  dbName: get("E2E_DB_NAME") ?? "agriai",

  admin: roleCredentials("E2E_ADMIN"),
  moderator: roleCredentials("E2E_MODERATOR"),
  expert: roleCredentials("E2E_EXPERT"),

  /** Optional fresh account for signup/reset flows (provisioned manually). */
  testUser: {
    email: get("E2E_TEST_USER_EMAIL"),
    password: get("E2E_TEST_USER_PASSWORD"),
    configured(): boolean {
      return Boolean(this.email && this.password);
    },
  },

  /** storageState paths for each role's saved session (gitignored). */
  storageState: {
    admin: get("E2E_ADMIN_STORAGE_STATE") ?? ".auth/admin.json",
    moderator: get("E2E_MODERATOR_STORAGE_STATE") ?? ".auth/moderator.json",
    expert: get("E2E_EXPERT_STORAGE_STATE") ?? ".auth/expert.json",
  },
} as const;

const ALL_ROLES = ["admin", "moderator", "expert"] as const;

/** Env-var names that are still missing for the full suite. */
export function missingEnvVars(): string[] {
  const missing: string[] = [];
  for (const role of ALL_ROLES) {
    if (!env[role].configured()) {
      missing.push(
        `E2E_${role.toUpperCase()}_EMAIL / E2E_${role.toUpperCase()}_PASSWORD`,
      );
    }
  }
  return missing;
}

/**
 * Assert that every role the suite needs is configured. Called by the auth
 * setup (and the [setup]-tagged tests) so a missing credential fails the run
 * loudly instead of being skipped.
 */
export function requireAllRolesConfigured(scope: string): void {
  const missing = missingEnvVars();
  if (missing.length > 0) {
    throw new Error(
      `${scope} requires staging credentials that are not configured. ` +
        `Missing: ${missing.join(", ")}. Copy e2e/.env.example to e2e/.env and fill them in.`,
    );
  }
}
