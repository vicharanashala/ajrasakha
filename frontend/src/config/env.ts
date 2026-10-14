import { resolveEnv } from "./runtime-env";

// Add all .env keys here
type EnvKey =
  // Common
  | "VITE_ENABLE_MOCKS"
  | "VITE_API_BASE_URL"
  | "VITE_GAP_DETECTOR_API_URL"

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

  // Internal API
  | "VITE_INTERNAL_API_KEY"

  // Notification
  | "VITE_VAPID_PUBLIC_KEY"

  // Plivo
  | "VITE_PLIVO_ENDPOINT_USERNAME"
  | "VITE_PLIVO_ENDPOINT_PASSWORD"
  | "VITE_PLIVO_STREAM_URL"
  | "VITE_PLIVO_AGENT_1_USERNAME"
  | "VITE_PLIVO_AGENT_1_PASSWORD"
  | "VITE_PLIVO_AGENT_2_USERNAME"
  | "VITE_PLIVO_AGENT_2_PASSWORD"
  | "VITE_PLIVO_AGENT_3_USERNAME"
  | "VITE_PLIVO_AGENT_3_PASSWORD"
  | `VITE_PLIVO_${string}_USERNAME`
  | `VITE_PLIVO_${string}_PASSWORD`
  // FAQ / POP processing servers
  | "VITE_FAQ_API_URL"
  | "VITE_POP_API_URL";

/**
 * Internal getter (single source of truth)
 */
function getEnv(key: EnvKey, required = true, fallback = ""): string {
  try {
    const value = resolveEnv(key, import.meta.env[key]);

    if (!value && required) {
      alert(`Missing required environment variable: ${key}`);
    }

    return value || fallback;
  } catch (e) {
    alert(`Missing required environment variable: ${key}`);
    return fallback;
  }
}

// Public env helpers (ONLY using defined EnvKey values)
export const env = {
  apiBaseUrl: () => getEnv("VITE_API_BASE_URL", true, "http://localhost:3000/api"),
  gapDetectorApiUrl: () => getEnv("VITE_GAP_DETECTOR_API_URL", false, "http://localhost:8000"),

  enableMocks: () => getEnv("VITE_ENABLE_MOCKS", false, "false") === "true",

  firebase: {
    apiKey: () => getEnv("VITE_FIREBASE_API_KEY", true, "dummy-firebase-api-key"),
    authDomain: () => getEnv("VITE_FIREBASE_AUTH_DOMAIN", true, "dummy-project.firebaseapp.com"),
    projectId: () => getEnv("VITE_FIREBASE_PROJECT_ID", true, "dummy-project-id"),
    storageBucket: () => getEnv("VITE_FIREBASE_STORAGE_BUCKET", true, "dummy-project.appspot.com"),
    messagingSenderId: () => getEnv("VITE_FIREBASE_MESSAGING_SENDER_ID", true, "000000000000"),
    appId: () => getEnv("VITE_FIREBASE_APP_ID", true, "1:000000000000:web:dummy-app-id"),
    measurementId: () => getEnv("VITE_FIREBASE_MEASUREMENT_ID", false, "G-DUMMY00000"),
  },

  sarvamApiKey: () => getEnv("VITE_SARVAM_API_KEY", true, "dummy-sarvam-api-key"),

  vapidPublicKey: () => getEnv("VITE_VAPID_PUBLIC_KEY", true, "dummy-vapid-public-key"),

  plivo: {
    endpointUsername: () => getEnv("VITE_PLIVO_ENDPOINT_USERNAME", false, "dummy_endpoint_username"),
    endpointPassword: () => getEnv("VITE_PLIVO_ENDPOINT_PASSWORD", false, "dummy_endpoint_password"),
    streamUrl: () => getEnv("VITE_PLIVO_STREAM_URL", false, "wss://dummy-stream-url.plivo.com"),
    agent1Username: () => resolveEnv("VITE_PLIVO_AGENT_1_USERNAME", import.meta.env.VITE_PLIVO_AGENT_1_USERNAME) || "",
    agent1Password: () => resolveEnv("VITE_PLIVO_AGENT_1_PASSWORD", import.meta.env.VITE_PLIVO_AGENT_1_PASSWORD) || "",
    agent2Username: () => resolveEnv("VITE_PLIVO_AGENT_2_USERNAME", import.meta.env.VITE_PLIVO_AGENT_2_USERNAME) || "",
    agent2Password: () => resolveEnv("VITE_PLIVO_AGENT_2_PASSWORD", import.meta.env.VITE_PLIVO_AGENT_2_PASSWORD) || "",
    agent3Username: () => resolveEnv("VITE_PLIVO_AGENT_3_USERNAME", import.meta.env.VITE_PLIVO_AGENT_3_USERNAME) || "",
    agent3Password: () => resolveEnv("VITE_PLIVO_AGENT_3_PASSWORD", import.meta.env.VITE_PLIVO_AGENT_3_PASSWORD) || "",
    agent4Username: () => resolveEnv("VITE_PLIVO_AGENT_4_USERNAME", import.meta.env.VITE_PLIVO_AGENT_4_USERNAME) || "",
    agent4Password: () => resolveEnv("VITE_PLIVO_AGENT_4_PASSWORD", import.meta.env.VITE_PLIVO_AGENT_4_PASSWORD) || "",
  },

  internalApiKey: () => getEnv("VITE_INTERNAL_API_KEY", true, "dummy-internal-api-key"),

  // FAQ and POP are served by the backend's proxy (/api/faq, /api/pop), so they hang off
  // the API base URL like every other call. They must NOT default to a relative path: the
  // built app is served by Firebase Hosting, whose SPA rewrite answers any unknown path
  // with index.html and a 200 — so a relative /api/pop/... silently returns the HTML page
  // instead of JSON. Only an explicit VITE_FAQ_API_URL / VITE_POP_API_URL overrides this.
  faqApiUrl: () => getEnv("VITE_FAQ_API_URL", false, "") || `${apiBase()}/faq`,
  popApiUrl: () => getEnv("VITE_POP_API_URL", false, "") || `${apiBase()}/pop`,
};

/** API base URL without a trailing slash, e.g. "https://…run.app/api". */
function apiBase(): string {
  return env.apiBaseUrl().replace(/\/$/, "");
}
