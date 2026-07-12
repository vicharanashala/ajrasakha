import { testEnvironment } from '../environment';
import { Logger } from './logger';

const log = new Logger('env-validator');

export type ValidationResult = {
  ok: boolean;
  warnings: string[];
  errors: string[];
};

/**
 * Validates the test environment before any test runs.
 * - Missing required env vars → error
 * - Suspicious placeholder values → warning
 * - Inconsistent config (e.g. CI=true but no URLs) → error
 *
 * Call this from globalSetup. Throws on errors.
 */
export function validateEnvironment(): ValidationResult {
  const result: ValidationResult = { ok: true, warnings: [], errors: [] };

  // ---- base URL ----
  if (!testEnvironment.baseUrl) {
    result.errors.push('E2E_BASE_URL is empty — set it or rely on default');
  } else if (!isValidUrl(testEnvironment.baseUrl)) {
    result.errors.push(`E2E_BASE_URL is not a valid URL: ${testEnvironment.baseUrl}`);
  }

  // ---- API URL ----
  if (!testEnvironment.apiUrl) {
    result.errors.push('E2E_API_URL is empty');
  } else if (!isValidUrl(testEnvironment.apiUrl)) {
    result.errors.push(`E2E_API_URL is not a valid URL: ${testEnvironment.apiUrl}`);
  }

  // ---- placeholder detection ----
  for (const [name, value] of Object.entries({
    E2E_BASE_URL: testEnvironment.baseUrl,
    E2E_API_URL: testEnvironment.apiUrl,
    E2E_STAGING_URL: testEnvironment.stagingUrl,
  })) {
    if (value && /example\.com|localhost:9999|127\.0\.0\.1:9999/i.test(value)) {
      result.warnings.push(`${name} looks like a placeholder: ${value}`);
    }
  }

  // ---- CI consistency ----
  if (process.env.CI === 'true' && testEnvironment.skipIfDown) {
    result.warnings.push(
      'CI=true but E2E_SKIP_IF_DOWN=true. In CI you usually want skip-if-down=false to fail fast.',
    );
  }

  if (process.env.CI === 'true' && !testEnvironment.baseUrl && !testEnvironment.stagingUrl) {
    result.errors.push('CI=true but no E2E_BASE_URL or E2E_STAGING_URL set');
  }

  result.ok = result.errors.length === 0;

  if (result.errors.length > 0) {
    log.error(`Environment validation failed (${result.errors.length} errors):`);
    for (const e of result.errors) log.error(`  • ${e}`);
  }
  for (const w of result.warnings) log.warn(`  • ${w}`);

  return result;
}

function isValidUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Same as validateEnvironment but throws on any error.
 * Use this from globalSetup.
 */
export function assertValidEnvironment(): void {
  const r = validateEnvironment();
  if (!r.ok) {
    throw new Error(
      `E2E environment is invalid:\n${r.errors.map((e) => `  • ${e}`).join('\n')}`,
    );
  }
}
