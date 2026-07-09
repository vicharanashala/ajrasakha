import admin from 'firebase-admin';
import { appConfig } from './app.js';

function getServiceAccount(): admin.ServiceAccount {
  const { projectId, clientEmail, privateKey } = appConfig.firebase;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Firebase Admin credentials missing. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.',
    );
  }

  return { projectId, clientEmail, privateKey };
}

export function ensureFirebaseAdminInitialized(): void {
  if (admin.apps.length) {
    return;
  }

  const hasEnvVars = appConfig.firebase.projectId && appConfig.firebase.clientEmail && appConfig.firebase.privateKey;
  const hasGcpCreds = appConfig.GOOGLE_APPLICATION_CREDENTIALS;

  if (hasGcpCreds) {
    try {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
      return;
    } catch {
      // Fall through to cert-based initialization
    }
  }

  if (hasEnvVars) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert(getServiceAccount()),
      });
      return;
    } catch {
      // Fall through to no-credential initialization
    }
  }

  // Initialize without credentials (auth will not work but app won't crash)
  admin.initializeApp({});
}

export function getFirebaseAuth(): admin.auth.Auth {
  ensureFirebaseAdminInitialized();
  return admin.auth();
}
