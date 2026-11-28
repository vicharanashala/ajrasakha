// Field names that must never be serialised into an HTTP response, at any depth.
const SENSITIVE_RESPONSE_FIELDS = new Set(['password']);

// JSON.stringify replacer for Express ("json replacer") so password hashes cannot leak through any endpoint.
export function stripSensitiveResponseFields(key: string, value: unknown): unknown {
  return SENSITIVE_RESPONSE_FIELDS.has(key) ? undefined : value;
}
