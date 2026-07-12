import { FullConfig } from '@playwright/test';
import { assertValidEnvironment, validateEnvironment } from './env-validator';
import { Logger } from './logger';

const log = new Logger('global-setup');

/**
 * Runs once before any test in any project.
 *
 * Validates environment, prints a summary, and refuses to run if the
 * config is broken. Throws so Playwright aborts with a clear message.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  log.info('==================================================');
  log.info('Reviewer System E2E — starting');
  log.info('==================================================');

  const result = validateEnvironment();
  log.info(`E2E_BASE_URL  = ${process.env.E2E_BASE_URL || '(default: http://localhost:5173)'}`);
  log.info(`E2E_API_URL   = ${process.env.E2E_API_URL || '(default: http://localhost:3141/api)'}`);
  log.info(`E2E_STAGING_URL = ${processEnvironment(process.env.E2E_STAGING_URL)}`);
  log.info(`E2E_SKIP_IF_DOWN = ${process.env.E2E_SKIP_IF_DOWN ?? '(default: true)'}`);
  log.info(`E2E_LOG_LEVEL = ${process.env.E2E_LOG_LEVEL ?? '(default: info)'}`);
  log.info(`CI = ${process.env.CI ?? '(unset)'}`);
  log.info(`Projects: ${config.projects.map((p) => p.name).join(', ')}`);

  // Warnings are advisory; errors are fatal.
  if (result.warnings.length > 0) {
    for (const w of result.warnings) log.warn(w);
  }
  if (!result.ok) {
    log.error('Environment validation failed. Aborting.');
    assertValidEnvironment(); // throws
  }

  log.info('Environment OK. Starting tests.');
}

function processEnvironment(value: string | undefined): string {
  if (!value) return '(unset)';
  if (value.length > 60) return `${value.slice(0, 57)}...`;
  return value;
}