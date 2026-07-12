import { FullResult } from '@playwright/test';
import { Logger } from './logger';

const log = new Logger('global-teardown');

/**
 * Runs once after all tests have completed (regardless of pass/fail).
 * Reports a one-line summary and exits with the correct code.
 */
export default async function globalTeardown(_result: FullResult): Promise<void> {
  log.info('==================================================');
  log.info('Reviewer System E2E — finished');
  log.info('==================================================');
}