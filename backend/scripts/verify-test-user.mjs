import * as dotenv from 'dotenv';
import admin from 'firebase-admin';

dotenv.config();

const email = process.argv[2];

if (!email) {
  console.error('Usage: pnpm run verify-user <email>');
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
    emailVerified: true,
  });

  console.log(`Successfully verified ${user.email} (UID: ${user.uid}).`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Could not verify user ${email}: ${message}`);
  process.exit(1);
}