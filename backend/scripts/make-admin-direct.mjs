import { MongoClient } from 'mongodb';
import admin from 'firebase-admin';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/make-admin-direct.mjs <email>');
  process.exit(1);
}

const uri = 'mongodb://sannojimanjula29_db_user:V1kUCr3xLr7OTN8q@ac-irbhr7e-shard-00-00.hjtd9av.mongodb.net:27017,ac-irbhr7e-shard-00-01.hjtd9av.mongodb.net:27017,ac-irbhr7e-shard-00-02.hjtd9av.mongodb.net:27017/?replicaSet=atlas-znk4ol-shard-0&ssl=true&authSource=admin';

const client = new MongoClient(uri, {
  tlsAllowInvalidCertificates: true,
  tlsAllowInvalidHostnames: true,
  serverSelectionTimeoutMS: 15000,
});

try {
  // Get Firebase user UID
  const projectId = 'gen-lang-client-0467781459';
  const clientEmail = 'firebase-adminsdk-fbsvc@gen-lang-client-0467781459.iam.gserviceaccount.com';
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }) });
  }
  const firebaseUser = await admin.auth().getUserByEmail(email);
  const firebaseUID = firebaseUser.uid;
  console.log('Firebase UID:', firebaseUID);
  console.log('Display Name:', firebaseUser.displayName);

  await client.connect();
  const db = client.db('ajrasakha');
  const users = db.collection('users');

  const existing = await users.findOne({ email });
  if (existing) {
    await users.updateOne({ email }, { $set: { role: 'admin', isVerified: true } });
    console.log('Updated existing user to admin:', email);
  } else {
    const names = (firebaseUser.displayName || email).split(' ');
    await users.insertOne({
      firebaseUID,
      email,
      firstName: names[0] || email.split('@')[0],
      lastName: names.slice(1).join(' ') || '',
      role: 'admin',
      isVerified: true,
      isBlocked: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log('Created user with admin role:', email);
  }
} catch (e) {
  console.error('Error:', e.message);
} finally {
  await client.close();
}
