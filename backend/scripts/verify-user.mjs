import 'dotenv/config';
import admin from 'firebase-admin';

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

const email = 'avani.jain2811@gmail.com';

const user = await admin.auth().getUserByEmail(email);
await admin.auth().updateUser(user.uid, { emailVerified: true });

console.log(`✅ ${email} is now verified!`);
process.exit(0);