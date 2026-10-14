import { test, expect } from "../../fixtures";
import { env, missingEnvVars } from "../../support/config";
import { getRuntimeConfig } from "../../support/api";

/**
 * CFG-* — harness/config contract checks (unauthenticated project).
 *
 * These validate the e2e harness itself and the environment it targets, so they
 * run FIRST and without any credentials. They are safe on any environment and
 * must stay dependency-free.
 */
test.describe("CFG harness config", () => {
  test("CFG-01 env loader fails loudly (never silently skips) when credentials are missing", () => {
    const missing = missingEnvVars();
    for (const role of ["admin", "moderator", "expert"] as const) {
      if (env[role].configured()) {
        expect(env[role].email.trim().length).toBeGreaterThan(0);
        expect(env[role].password.trim().length).toBeGreaterThan(0);
      } else {
        // Accessing a role credential when unconfigured must throw with an
        // actionable message naming the env vars — this is the "fail loudly"
        // contract the whole suite relies on.
        expect(() => env[role].email).toThrow(/Missing required env var E2E_/i);
      }
    }
    // Report the full gap list when credentials are missing (informational).
    if (missing.length > 0) {
      console.warn(
        `[CFG-01] Staging credentials not configured yet: ${missing.join(", ")}`,
      );
    }
  });

  test("CFG-02 staging base URL serves the app", async ({ request }) => {
    const res = await request.get(env.baseURL + "/");
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain("<div id="); // SPA mount point
  });

  test("CFG-03 API is auth-gated (unauthenticated /users/me is rejected)", async ({
    request,
  }) => {
    const res = await request.get(`${env.apiBaseURL}/users/me`);
    expect([401, 403]).toContain(res.status());
  });

  test("CFG-04 runtime config exposes the public Firebase API key for token minting", async ({
    page,
  }) => {
    await page.goto("/auth");
    const cfg = await getRuntimeConfig(page);
    expect(cfg.VITE_FIREBASE_API_KEY).toBeTruthy();
  });
});
