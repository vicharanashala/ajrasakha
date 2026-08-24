import { resolveEnv } from "./runtime-env";

type EnvKey =
  | "VITE_ENABLE_MOCKS"
  | "VITE_API_BASE_URL"
  | "VITE_FIREBASE_API_KEY"
  | "VITE_FIREBASE_AUTH_DOMAIN"
  | "VITE_FIREBASE_PROJECT_ID"
  | "VITE_FIREBASE_STORAGE_BUCKET"
  | "VITE_FIREBASE_MESSAGING_SENDER_ID"
  | "VITE_FIREBASE_APP_ID"
  | "VITE_FIREBASE_MEASUREMENT_ID"
  | "VITE_SARVAM_API_KEY"
  | "VITE_PLIVO_STREAM_URL"
  | "VITE_PLIVO_ENDPOINT_USERNAME"
  | "VITE_PLIVO_ENDPOINT_PASSWORD"
  | `VITE_PLIVO_${string}_USERNAME`
  | `VITE_PLIVO_${string}_PASSWORD`;

function getEnv(
  key: EnvKey,
  buildTimeValue: string | undefined,
  required = true,
  fallback = ""
): string {
  try {
    const value = resolveEnv(key, buildTimeValue);

    if (!value && required) {
      console.warn(`Missing environment variable: ${key}`);
    }

    return value || fallback;
  } catch (e) {
    return fallback;
  }
}

export const env = {
  apiBaseUrl: () =>
    getEnv("VITE_API_BASE_URL", import.meta.env.VITE_API_BASE_URL, true, "/api"),
  firebase: {
    apiKey: () =>
      getEnv(
        "VITE_FIREBASE_API_KEY",
        import.meta.env.VITE_FIREBASE_API_KEY,
        true,
        "dummy-firebase-api-key"
      ),
    authDomain: () =>
      getEnv(
        "VITE_FIREBASE_AUTH_DOMAIN",
        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        true,
        "dummy-project.firebaseapp.com"
      ),
    projectId: () =>
      getEnv(
        "VITE_FIREBASE_PROJECT_ID",
        import.meta.env.VITE_FIREBASE_PROJECT_ID,
        true,
        "dummy-project-id"
      ),
    storageBucket: () =>
      getEnv(
        "VITE_FIREBASE_STORAGE_BUCKET",
        import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
        true,
        "dummy-project.appspot.com"
      ),
    messagingSenderId: () =>
      getEnv(
        "VITE_FIREBASE_MESSAGING_SENDER_ID",
        import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        true,
        "000000000000"
      ),
    appId: () =>
      getEnv(
        "VITE_FIREBASE_APP_ID",
        import.meta.env.VITE_FIREBASE_APP_ID,
        true,
        "1:000000000000:web:dummy-app-id"
      ),
    measurementId: () =>
      getEnv(
        "VITE_FIREBASE_MEASUREMENT_ID",
        import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
        false,
        "G-DUMMY00000"
      ),
  },
  sarvamApiKey: () =>
    getEnv(
      "VITE_SARVAM_API_KEY",
      import.meta.env.VITE_SARVAM_API_KEY,
      true,
      "dummy-sarvam-api-key"
    ),
  plivo: {
    endpointUsername: () =>
      getEnv(
        "VITE_PLIVO_ENDPOINT_USERNAME",
        import.meta.env.VITE_PLIVO_ENDPOINT_USERNAME,
        false,
        "annamuser1293525305518427216"
      ),
    endpointPassword: () =>
      getEnv(
        "VITE_PLIVO_ENDPOINT_PASSWORD",
        import.meta.env.VITE_PLIVO_ENDPOINT_PASSWORD,
        false,
        "testing@annam26"
      ),
    streamUrl: () =>
      getEnv(
        "VITE_PLIVO_STREAM_URL",
        import.meta.env.VITE_PLIVO_STREAM_URL,
        false,
        "wss://dummy-stream-url.plivo.com"
      ),
  },
};
