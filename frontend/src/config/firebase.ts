import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  connectAuthEmulator,
} from "firebase/auth";
import { resolveEnv } from "./runtime-env";

export const firebaseConfig = {
  apiKey: resolveEnv("VITE_FIREBASE_API_KEY", import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: resolveEnv(
    "VITE_FIREBASE_AUTH_DOMAIN",
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN
  ),
  projectId: resolveEnv(
    "VITE_FIREBASE_PROJECT_ID",
    import.meta.env.VITE_FIREBASE_PROJECT_ID
  ),
  storageBucket: resolveEnv(
    "VITE_FIREBASE_STORAGE_BUCKET",
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET
  ),
  messagingSenderId: resolveEnv(
    "VITE_FIREBASE_MESSAGING_SENDER_ID",
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID
  ),
  appId: resolveEnv("VITE_FIREBASE_APP_ID", import.meta.env.VITE_FIREBASE_APP_ID),
  measurementId: resolveEnv(
    "VITE_FIREBASE_MEASUREMENT_ID",
    import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
  ),
};
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Local E2E / dev-only: point the client at the Firebase Auth Emulator.
// Gated behind an explicit dev env var — never set in staging/production.
const authEmulatorHost = resolveEnv(
  "VITE_FIREBASE_AUTH_EMULATOR_HOST",
  import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST
);
if (authEmulatorHost) {
  connectAuthEmulator(auth, `http://${authEmulatorHost}`, {
    disableWarnings: true,
  });
}

export const googleProvider = new GoogleAuthProvider();
