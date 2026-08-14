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

  // Set STORAGE_EMULATOR_HOST for @google-cloud/storage when running local Firebase emulator
  const emulatorHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST || process.env.STORAGE_EMULATOR_HOST;
  if (emulatorHost) {
    const cleanHost = emulatorHost.replace(/^http:\/\//, '');
    process.env.STORAGE_EMULATOR_HOST = `http://${cleanHost}`;
    process.env.FIREBASE_STORAGE_EMULATOR_HOST = cleanHost;
  }

  admin.initializeApp({
    credential: admin.credential.cert(getServiceAccount()),
    storageBucket: appConfig.firebase.storageBucket,
  });
}


export function getFirebaseAuth(): admin.auth.Auth {
  ensureFirebaseAdminInitialized();
  return admin.auth();
}

export function getFirebaseStorage(): admin.storage.Storage {
  ensureFirebaseAdminInitialized();
  return admin.storage();
}

