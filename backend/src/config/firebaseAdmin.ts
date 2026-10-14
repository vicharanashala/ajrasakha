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

  const isRealKey =
    projectId &&
    clientEmail &&
    privateKey &&
    privateKey.includes('-----BEGIN PRIVATE KEY-----') &&
    !privateKey.includes('dummy');

  if (!isRealKey && !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
    console.warn(
      '[Firebase Admin] Local development mode active: Enabled FIREBASE_AUTH_EMULATOR_HOST to bypass Google OAuth credential checks.',
    );
  }

  try {
    if (isRealKey) {
      admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      });
    } else {
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
