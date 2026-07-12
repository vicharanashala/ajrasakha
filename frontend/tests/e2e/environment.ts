export const testEnvironment = {
  baseUrl: process.env.E2E_BASE_URL || 'http://localhost:5173',
  apiUrl: process.env.E2E_API_URL || 'http://localhost:3141/api',
  stagingUrl: process.env.E2E_STAGING_URL || '',

  /**
   * When true (default), each spec probes the target before running and
   * skips cleanly if unreachable. When false, tests fail loudly — useful
   * for CI where a missing target is itself a bug.
   *
   * Override: E2E_SKIP_IF_DOWN=false
   */
  skipIfDown: process.env.E2E_SKIP_IF_DOWN !== 'false',

  /** User-Agent suffix for outgoing HTTP requests. Helps identify our traffic in logs. */
  userAgentSuffix: process.env.E2E_USER_AGENT_SUFFIX || 'qa-e2e/1.0.0',

  /** Log level: silent | error | warn | info | debug. */
  logLevel: process.env.E2E_LOG_LEVEL || 'info',

  timing: {
    /** Default per-test timeout. */
    defaultTimeout: parsePositiveInt(process.env.E2E_TIMEOUT_MS, 30000),
    /** Short, fast operations (HTTP probes, fetches). */
    shortTimeout: parsePositiveInt(process.env.E2E_SHORT_TIMEOUT_MS, 5000),
    /** Medium — page navigation + DOM settle. */
    mediumTimeout: parsePositiveInt(process.env.E2E_MEDIUM_TIMEOUT_MS, 10000),
    /** Long — full hydration, login form ready. */
    longTimeout: parsePositiveInt(process.env.E2E_LONG_TIMEOUT_MS, 60000),
    /** Backend cron interval for stuck-question tests. */
    cronIntervalMs: 45 * 60 * 1000,
    /** Frontend 5-minute timer for stuck-question tests. */
    frontendTimerMs: 5 * 60 * 1000,
  },
} as const;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export type ApiUrlOptions = {
  /** When true, returns the path relative to the API base; when false, returns the absolute URL. */
  absolute?: boolean;
};