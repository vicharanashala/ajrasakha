const REDACTED = '[Filtered]';

// Request fields and headers that carry credentials and must never leave the server in error reports.
const SENSITIVE_KEY_PATTERN = /password|passwd|secret|token|authorization|cookie|api[-_]?key|^otp$|otphash/i;
const MAX_DEPTH = 10;

type EventWithRequest = {
  request?: {
    data?: unknown;
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
  };
};

// Recursively replaces the values of credential-like keys.
function redactSensitiveKeys(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(item => redactSensitiveKeys(item, depth + 1));
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redactSensitiveKeys(entry, depth + 1),
    ]),
  );
}

// Redacts a request body; raw string bodies are parsed as JSON, or dropped if they mention credentials.
function redactRequestBody(data: unknown): unknown {
  if (typeof data !== 'string') {
    return redactSensitiveKeys(data);
  }
  try {
    return JSON.stringify(redactSensitiveKeys(JSON.parse(data)));
  } catch {
    return SENSITIVE_KEY_PATTERN.test(data) ? REDACTED : data;
  }
}

/**
 * Sentry beforeSend/beforeSendTransaction hook. The SDK attaches request bodies and headers
 * (sendDefaultPii), which include passwords on login/signup and bearer tokens on every request.
 */
export function scrubSensitiveEventData<T extends EventWithRequest>(event: T): T {
  const request = event.request;
  if (!request) {
    return event;
  }
  if (request.data !== undefined) {
    request.data = redactRequestBody(request.data);
  }
  if (request.headers) {
    request.headers = redactSensitiveKeys(request.headers) as Record<string, string>;
  }
  delete request.cookies;
  return event;
}
