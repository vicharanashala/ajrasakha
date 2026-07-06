type EnvKey =
  | "VITE_ENABLE_MOCKS"
  | "VITE_API_BASE_URL"
  | "VITE_FIREBASE_API_KEY"
  | "VITE_FIREBASE_AUTH_DOMAIN"
  | "VITE_FIREBASE_PROJECT_ID"
  | "VITE_FIREBASE_STORAGE_BUCKET"
  | "VITE_FIREBASE_MESSAGING_SENDER_ID"
  | "VITE_FIREBASE_APP_ID"
  | "VITE_SARVAM_API_KEY"
  | "VITE_PLIVO_STREAM_URL"
  | "VITE_PLIVO_ENDPOINT_USERNAME"
  | "VITE_PLIVO_ENDPOINT_PASSWORD"
  | `VITE_PLIVO_${string}_USERNAME`
  | `VITE_PLIVO_${string}_PASSWORD`;

function getEnv(key: EnvKey, required = true, fallback = ""): string {
  try {
    const value = import.meta.env[key];
    if (!value && required) {
      console.warn(`Missing environment variable: ${key}`);
    }
    return value || fallback;
  } catch (e) {
    return fallback;
  }
}

export const env = {
  apiBaseUrl: () => getEnv("VITE_API_BASE_URL", true, "/api"),
  firebase: {
    apiKey: () => getEnv("VITE_FIREBASE_API_KEY", true, "dummy-firebase-api-key"),
    authDomain: () => getEnv("VITE_FIREBASE_AUTH_DOMAIN", true, "dummy-project.firebaseapp.com"),
    projectId: () => getEnv("VITE_FIREBASE_PROJECT_ID", true, "dummy-project-id"),
    storageBucket: () => getEnv("VITE_FIREBASE_STORAGE_BUCKET", true, "dummy-project.appspot.com"),
    messagingSenderId: () => getEnv("VITE_FIREBASE_MESSAGING_SENDER_ID", true, "000000000000"),
    appId: () => getEnv("VITE_FIREBASE_APP_ID", true, "1:000000000000:web:dummy-app-id"),
  },
  sarvamApiKey: () => getEnv("VITE_SARVAM_API_KEY", true, "dummy-sarvam-api-key"),
  plivo: {
    endpointUsername: () => getEnv("VITE_PLIVO_ENDPOINT_USERNAME", false, ""),
    endpointPassword: () => getEnv("VITE_PLIVO_ENDPOINT_PASSWORD", false, ""),
    streamUrl: () => getEnv("VITE_PLIVO_STREAM_URL", false, "wss://dummy-stream-url.plivo.com"),
    getAgentCredentials: (agentNumber: string) => {
      const username = getEnv(`VITE_PLIVO_${agentNumber.toUpperCase()}_USERNAME`, false, "");
      const password = getEnv(`VITE_PLIVO_${agentNumber.toUpperCase()}_PASSWORD`, false, "");
      return { username, password };
    },
  },
};
