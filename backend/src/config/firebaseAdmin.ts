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
  const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || appConfig.firebase.authEmulatorHost;

  if (emulatorHost) {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = emulatorHost;
    process.env.FIREBASE_EMULATOR_HOST = emulatorHost;
  }

  if (admin.apps.length) {
    const auth = admin.auth();
    if (emulatorHost && typeof (auth as any).useEmulator === 'function') {
      (auth as any).useEmulator(`http://${emulatorHost}`);
    }
    return;
  }

  if (emulatorHost) {
    admin.initializeApp({
      projectId: appConfig.firebase.projectId || 'local-emulator',
    });
  } else {
    admin.initializeApp({
      credential: admin.credential.cert(getServiceAccount()),
    });
  }

  const auth = admin.auth();
  if (emulatorHost && typeof (auth as any).useEmulator === 'function') {
    (auth as any).useEmulator(`http://${emulatorHost}`);
  }
}

export function getFirebaseAuth(): admin.auth.Auth {
  ensureFirebaseAdminInitialized();
  return admin.auth();
}
