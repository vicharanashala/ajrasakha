import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/make-admin.mjs <email>');
  process.exit(1);
}

const uri = process.env.DB_URL;
const dbName = process.env.DB_NAME || 'agriai';

if (!uri) {
  console.error('DB_URL not set in .env');
  process.exit(1);
}

const client = new MongoClient(uri);
try {
  await client.connect();
  const db = client.db(dbName);
  const users = db.collection('users');

  const user = await users.findOne({ email });
  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  const oldRole = user.role;
  await users.updateOne({ _id: user._id }, { $set: { role: 'admin' } });
  console.log(`Updated ${email}: ${oldRole} → admin`);
} finally {
  await client.close();
}
