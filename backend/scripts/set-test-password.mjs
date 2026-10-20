import * as dotenv from 'dotenv';
import admin from 'firebase-admin';

dotenv.config();

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error('Usage: node backend/scripts/set-test-password.mjs <email> <new-password>');
  process.exit(1);
}

if (password.length < 8) {
  console.error('Password must be at least 8 characters long.');
  process.exit(1);
}

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error(
    'Firebase Admin credentials missing. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.',
  );
  process.exit(1);
}

try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }

  const user = await admin.auth().getUserByEmail(email);
  await admin.auth().updateUser(user.uid, {
    password,
    emailVerified: true,
  });

  console.log(`Password updated for ${email}`);
} catch (error) {
  const message = error instanceof Error ? error.message : 'Firebase Admin operation failed.';
  console.error(`Could not update password for ${email}: ${message}`);
  process.exit(1);
}
