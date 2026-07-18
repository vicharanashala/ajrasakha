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

  if (appConfig.isDevelopment) {
    console.log('[DEV] Skipping Firebase Admin initialization — using in-memory auth');
    return;
  }

  admin.initializeApp({
    credential: admin.credential.cert(getServiceAccount()),
  });
}

export function getFirebaseAuth(): admin.auth.Auth {
  ensureFirebaseAdminInitialized();
  if (appConfig.isDevelopment && !admin.apps.length) {
    return null as any;
  }
  return admin.auth();
}
