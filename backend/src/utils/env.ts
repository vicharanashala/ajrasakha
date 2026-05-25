import * as dotenv from 'dotenv';
const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
dotenv.config({path: envFile}); // { path: `.env.${process.env.NODE_ENV}` }

console.log(`[env] Loaded environment file: ${envFile}`);

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
