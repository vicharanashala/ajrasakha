import { MongoClient } from 'mongodb';

const client = new MongoClient('mongodb://localhost:27018/ajrasakha', { directConnection: true });
await client.connect();
const db = client.db('ajrasakha');
const users = db.collection('users');

const allUsers = await users.find({}).toArray();
console.log('Users:', JSON.stringify(allUsers.map(u => ({ email: u.email, role: u.role, isVerified: u.isVerified })), null, 2));

const r = await users.updateOne(
  { email: 'sannojimanjula29@gmail.com' },
  { $set: { isVerified: true, role: 'admin' } }
);
console.log('Matched:', r.matchedCount, 'Modified:', r.modifiedCount);

if (r.matchedCount === 0) {
  // User doesn't exist yet - create
  const firebaseUID = 'G3TkSIN9wOfwzI1eVZFkXO6RavG3';
  await users.insertOne({
    firebaseUID,
    email: 'sannojimanjula29@gmail.com',
    firstName: 'Sannoj',
    lastName: 'Manjula',
    role: 'admin',
    isVerified: true,
    isBlocked: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  console.log('Created user');
}

await client.close();
