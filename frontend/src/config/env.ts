// Add all .env keys here
type EnvKey =
  // Common
  | "VITE_ENABLE_MOCKS"
  | "VITE_API_BASE_URL"

  // Firebase
  | "VITE_FIREBASE_API_KEY"
  | "VITE_FIREBASE_AUTH_DOMAIN"
  | "VITE_FIREBASE_PROJECT_ID"
  | "VITE_FIREBASE_STORAGE_BUCKET"
  | "VITE_FIREBASE_MESSAGING_SENDER_ID"
  | "VITE_FIREBASE_APP_ID"
  | "VITE_FIREBASE_MEASUREMENT_ID"

  // Sarvam keys
  | "VITE_SARVAM_API_KEY"

  // Notification
  | "VITE_VAPID_PUBLIC_KEY"

  // Plivo
  | "VITE_PLIVO_ENDPOINT_USERNAME"
  | "VITE_PLIVO_ENDPOINT_PASSWORD"
  | "VITE_PLIVO_STREAM_URL"
  | "VITE_TARGET_USER_ID";

/**
 * Internal getter (single source of truth)
 */
function getEnv(key: EnvKey, required = true): string {
  const value = import.meta.env[key];

  if (!value && required) {
    alert("Missing required environment variable");
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value ?? "";
}

// Public env helpers (ONLY using defined EnvKey values)
export const env = {
  apiBaseUrl: () => getEnv("VITE_API_BASE_URL"),

  enableMocks: () => getEnv("VITE_ENABLE_MOCKS", false) === "true",

  firebase: {
    apiKey: () => getEnv("VITE_FIREBASE_API_KEY"),
    authDomain: () => getEnv("VITE_FIREBASE_AUTH_DOMAIN"),
    projectId: () => getEnv("VITE_FIREBASE_PROJECT_ID"),
    storageBucket: () => getEnv("VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: () => getEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: () => getEnv("VITE_FIREBASE_APP_ID"),
    measurementId: () => getEnv("VITE_FIREBASE_MEASUREMENT_ID", false),
  },

  sarvamApiKey: () => getEnv("VITE_SARVAM_API_KEY"),

  vapidPublicKey: () => getEnv("VITE_VAPID_PUBLIC_KEY"),

  plivo: {
    endpointUsername: () => getEnv("VITE_PLIVO_ENDPOINT_USERNAME", false),
    endpointPassword: () => getEnv("VITE_PLIVO_ENDPOINT_PASSWORD", false),
    streamUrl: () => getEnv("VITE_PLIVO_STREAM_URL"),
    targetUserId: () => getEnv("VITE_TARGET_USER_ID", false),
  },
};
