import admin from 'firebase-admin';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

console.log('projectId:', projectId);
console.log('clientEmail:', clientEmail);
console.log('privateKey set:', !!privateKey);
console.log('privateKey length:', privateKey?.length);

try {
  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
  const user = await admin.auth().createUser({
    email: 'test-' + Date.now() + '@test.com',
    password: 'Test@1234',
    displayName: 'Test User',
  });
  console.log('User created:', user.uid);
  await admin.auth().deleteUser(user.uid);
  console.log('User deleted');
  console.log('Firebase working!');
} catch (e) {
  console.error('Error:', e.message ?? e);
  console.error('Code:', e.code);
}
