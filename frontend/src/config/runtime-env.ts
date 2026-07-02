declare global {
  interface Window {
    __RUNTIME_CONFIG__?: Partial<Record<string, string>>;
  }
}

/** Docker/Portainer: values injected into /runtime-config.js at container start. */
export function readRuntimeEnv(key: string): string | undefined {
  const value = window.__RUNTIME_CONFIG__?.[key];
  return value && value.length > 0 ? value : undefined;
}

export function resolveEnv(
  key: string,
  buildTimeValue: string | undefined
): string | undefined {
  return readRuntimeEnv(key) ?? buildTimeValue;
}
