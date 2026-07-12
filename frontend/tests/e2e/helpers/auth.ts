/**
 * Authentication helpers — placeholder for when credentials land.
 *
 * Currently the suite operates in unauthenticated mode (status-code
 * contract only). When test accounts become available, add a `getToken()`
 * implementation here and uncomment the bearer header injection in
 * `http.ts`.
 */

import type { APIRequestContext } from '@playwright/test';
import { apiUrl } from './http';
import { Logger } from './logger';

const log = new Logger('auth');

export type AuthCredentials = {
  email: string;
  password: string;
};

export type AuthToken = {
  token: string;
  refreshToken?: string;
  expiresAt?: number;
};

/**
 * Stub — returns null until credentials are configured.
 *
 * To enable:
 *   1. Set E2E_MODERATOR_EMAIL and E2E_MODERATOR_PASSWORD in CI secrets
 *   2. Implement this function to call POST /auth/login and cache the result
 *   3. Uncomment the Authorization injection in http.ts:statusFor()
 */
export async function getToken(
  _request: APIRequestContext,
  _credentials: AuthCredentials,
): Promise<string | null> {
  log.warn(
    'getToken() is not implemented. Suite runs in unauthenticated mode (status-code contract only).',
  );
  return null;
}

/**
 * Cache of tokens keyed by email. Prevents re-login on every test.
 */
const tokenCache = new Map<string, AuthToken>();

/**
 * Read an env-configured credential pair.
 * Returns null if either variable is missing.
 */
export function readCredentialFromEnv(prefix: string): AuthCredentials | null {
  const email = process.env[`E2E_${prefix}_EMAIL`];
  const password = process.env[`E2E_${prefix}_PASSWORD`];
  if (!email || !password) return null;
  return { email, password };
}

/**
 * Utility: forget all cached tokens. Useful between test files.
 */
export function clearTokenCache(): void {
  tokenCache.clear();
}

/**
 * Helper to demonstrate where the bearer header WOULD be attached.
 * Not currently used by any spec.
 */
export function bearerHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Re-export apiUrl for convenience in future auth-aware specs.
export { apiUrl };