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

  admin.initializeApp({
    credential: admin.credential.cert(getServiceAccount()),
  });
}

export function getFirebaseAuth(): admin.auth.Auth {
  ensureFirebaseAdminInitialized();
  return admin.auth();
}
