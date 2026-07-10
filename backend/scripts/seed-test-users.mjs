import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.test' });

const DB_URL = process.env.DB_URL;
const DB_NAME = process.env.DB_NAME;
const password = await bcrypt.hash('12345678', 10);

const users = [
  { email: 'modtest1@annam.ai', role: 'moderator', firstName: 'Mod', lastName: 'Test1', isBlocked: false, special_task_force: false },
  { email: 'admintest1@annam.ai', role: 'admin', firstName: 'Admin', lastName: 'Test1', isBlocked: false, special_task_force: false },
  { email: 'experttest1@annam.ai', role: 'expert', firstName: 'Expert', lastName: 'Test1', preferences: { state: 'Punjab', domain: 'Crop Protection', crop: 'Brinjal' }, reputation_score: 0, isBlocked: false, special_task_force: true },
  { email: 'experttest2@annam.ai', role: 'expert', firstName: 'Expert', lastName: 'Test2', reputation_score: 0, isBlocked: false, special_task_force: true },
  { email: 'experttest3@annam.ai', role: 'expert', firstName: 'Expert', lastName: 'Test3', reputation_score: 0, isBlocked: false, special_task_force: true },
  { email: 'experttest4@annam.ai', role: 'expert', firstName: 'Expert', lastName: 'Test4', reputation_score: 0, isBlocked: false, special_task_force: false },
  { email: 'experttest5@annam.ai', role: 'expert', firstName: 'Expert', lastName: 'Test5', reputation_score: 0, isBlocked: false, special_task_force: false },
  { email: 'experttest6@annam.ai', role: 'expert', firstName: 'Expert', lastName: 'Test6', reputation_score: 0, isBlocked: false, special_task_force: false },
  { email: 'experttest7@annam.ai', role: 'expert', firstName: 'Expert', lastName: 'Test7', reputation_score: 0, isBlocked: false, special_task_force: false },
  { email: 'experttest8@annam.ai', role: 'expert', firstName: 'Expert', lastName: 'Test8', reputation_score: 0, isBlocked: false, special_task_force: false },
];

const client = new MongoClient(DB_URL);
await client.connect();
const db = client.db(DB_NAME);
const col = db.collection('users');

for (const user of users) {
  await col.updateOne(
    { email: user.email },
    { $set: { ...user, password, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true }
  );
  console.log(`✓ ${user.email}`);
}

console.log('Seed complete.');
await client.close();