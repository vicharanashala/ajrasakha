import { MongoClient } from '../../backend/node_modules/mongodb/lib/index.js';

const client = new MongoClient('mongodb://localhost:27018/?directConnection=true');

try {
  await client.connect();
  const db = client.db('ajrasakha');
  const users = db.collection('users');

  const testUsers = [
    {
      firebaseUID: 'myiFSI0MbpZhFyFUe5Z9wdtBWhz1',
      email: 'e2e-moderator@ajrasakha.com',
      firstName: 'E2E',
      lastName: 'Moderator',
      role: 'moderator',
      status: 'active',
      isVerified: true,
      isBlocked: false,
      reputation_score: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      firebaseUID: 'rEVi84L9dQTz4x2FA2dWz4CTVJ52',
      email: 'e2e-expert@ajrasakha.com',
      firstName: 'E2E',
      lastName: 'Expert',
      role: 'expert',
      status: 'active',
      isVerified: true,
      isBlocked: false,
      reputation_score: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  for (const u of testUsers) {
    const existing = await users.findOne({ email: u.email });
    if (existing) {
      await users.updateOne({ email: u.email }, { $set: u });
      console.log('Updated:', u.email, '->', existing._id);
    } else {
      const result = await users.insertOne(u);
      console.log('Inserted:', u.email, '->', result.insertedId);
    }
  }

  console.log('\nTest users ready.');
  const all = await users.find({ email: /e2e-/ }).toArray();
  console.log(JSON.stringify(all.map(u => ({ email: u.email, role: u.role, firebaseUID: u.firebaseUID })), null, 2));
} catch (err) {
  console.error('Error:', err.message);
} finally {
  await client.close();
}
