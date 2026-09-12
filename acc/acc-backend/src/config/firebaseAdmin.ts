import admin from 'firebase-admin';
import { appConfig } from './app.js';

const STORAGE_APP_NAME = 'gcp-recordings-storage-app';

function getServiceAccount(): admin.ServiceAccount {
  const { projectId, clientEmail, privateKey } = appConfig.firebase;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Firebase Admin credentials missing. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.',
    );
  }

  return { projectId, clientEmail, privateKey };
}

function getStorageServiceAccount(): admin.ServiceAccount | null {
  const { projectId, clientEmail, privateKey } = appConfig.storage;

  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey };
  }
  return null;
}

export function ensureFirebaseAdminInitialized(): void {
  // Set STORAGE_EMULATOR_HOST for @google-cloud/storage when running local Firebase emulator
  const emulatorHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST || process.env.STORAGE_EMULATOR_HOST;
  if (emulatorHost) {
    const cleanHost = emulatorHost.replace(/^http:\/\//, '');
    process.env.STORAGE_EMULATOR_HOST = `http://${cleanHost}`;
    process.env.FIREBASE_STORAGE_EMULATOR_HOST = cleanHost;
  }

  // 1. Initialize default Firebase App (used for Auth & default services)
  if (!admin.apps.some((app) => !app?.name || app.name === '[DEFAULT]')) {
    admin.initializeApp({
      credential: admin.credential.cert(getServiceAccount()),
      storageBucket: appConfig.storage.bucket || appConfig.firebase.storageBucket,
    });
  }

  // 2. Initialize dedicated GCP Storage App if distinct storage credentials are provided
  const storageAccount = getStorageServiceAccount();
  if (storageAccount && !admin.apps.some((app) => app?.name === STORAGE_APP_NAME)) {
    admin.initializeApp(
      {
        credential: admin.credential.cert(storageAccount),
        storageBucket: appConfig.storage.bucket || appConfig.firebase.storageBucket,
      },
      STORAGE_APP_NAME
    );
  }
}

export function getFirebaseAuth(): admin.auth.Auth {
  ensureFirebaseAdminInitialized();
  return admin.auth();
}

export function getFirebaseStorage(): admin.storage.Storage {
  ensureFirebaseAdminInitialized();
  const storageAccount = getStorageServiceAccount();
  if (storageAccount) {
    return admin.app(STORAGE_APP_NAME).storage();
  }
  return admin.storage();
}

