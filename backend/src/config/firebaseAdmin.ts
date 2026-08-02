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

  const { projectId, clientEmail, privateKey } = appConfig.firebase;

  try {
    if (
      projectId &&
      clientEmail &&
      privateKey &&
      privateKey.includes('-----BEGIN PRIVATE KEY-----') &&
      !privateKey.includes('dummy')
    ) {
      admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      });
    } else {
      console.warn('[Firebase Admin] Dummy credentials detected, initializing for local development.');
      admin.initializeApp({
        projectId: projectId || 'dummy-firebase-project-id',
      });
    }
  } catch (err: any) {
    console.warn('[Firebase Admin] Certificate init failed, using default app initialization.', err?.message);
    if (!admin.apps.length) {
      admin.initializeApp({
        projectId: projectId || 'dummy-firebase-project-id',
      });
    }
  }
}

export function getFirebaseAuth(): admin.auth.Auth {
  ensureFirebaseAdminInitialized();
  return admin.auth();
}
