import * as dotenv from 'dotenv';
dotenv.config(); // { path: `.env.${process.env.NODE_ENV}` }

export function env(key: string, defaultValue: null | string = null): string {
  return process.env[key] ?? (defaultValue as string);
}

export function envOrFail(key: string, fallback = ""): string {
  try {
    if (typeof process.env[key] === 'undefined') {
      console.warn(`Environment variable ${key} is not set. Using fallback.`);
      return fallback;
    }

    return process.env[key] as string;
  } catch (e) {
    console.error(`Failed to read environment variable ${key}:`, e);
    return fallback;
  }
}
