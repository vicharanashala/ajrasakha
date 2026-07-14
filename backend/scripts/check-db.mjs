import { MongoClient } from 'mongodb';

const uri = 'mongodb+srv://sannojimanjula29_db_user:V1kUCr3xLr7OTN8q@cluster0.hjtd9av.mongodb.net/?appName=Cluster0';
const client = new MongoClient(uri);
try {
  await client.connect();
  const dbs = await client.db().admin().listDatabases();
  console.log('Databases:', dbs.databases.map(d => d.name));
  for (const dbInfo of dbs.databases) {
    if (['admin', 'local'].includes(dbInfo.name)) continue;
    const db = client.db(dbInfo.name);
    const collections = await db.listCollections().toArray();
    console.log(`\n${dbInfo.name} collections:`, collections.map(c => c.name));
    if (collections.some(c => c.name === 'users')) {
      const users = db.collection('users');
      const count = await users.countDocuments();
      console.log(`  users count: ${count}`);
      const sample = await users.findOne();
      console.log(`  sample user:`, sample ? { email: sample.email, role: sample.role } : 'empty');
    }
  }
} catch (e) { console.error(e.message ?? e); }
finally { await client.close(); }
