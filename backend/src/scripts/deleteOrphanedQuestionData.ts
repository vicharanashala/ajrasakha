/**
 * One-time cleanup script: Delete orphaned documents from question_submissions,
 * answers, and reviews collections for a list of deleted question IDs.
 *
 * Reads IDs from: /Users/vishwas/Desktop/ajrasakha/todelete.txt
 * (JSON array of ID strings)
 *
 * Run:
 *   cd backend
 *   pnpm build && node build/scripts/deleteOrphanedQuestionData.js
 */

import { config } from 'dotenv';
import { MongoClient, ObjectId } from 'mongodb';
import { readFileSync } from 'fs';
import { resolve } from 'path';

config();

const MONGO_URI = process.env.DB_URL || process.env.MONGO_URI || process.env.DATABASE_URL || '';
const DB_NAME   = process.env.DB_NAME || process.env.DATABASE_NAME || '';

if (!MONGO_URI || !DB_NAME) {
  console.error('❌  DB_URL and DB_NAME must be set in your .env file.');
  process.exit(1);
}

const TXT_PATH = resolve(process.cwd(), '../todelete.txt');
const DELETED_QUESTION_IDS: string[] = JSON.parse(readFileSync(TXT_PATH, 'utf-8'));

async function main() {
  console.log(`📂  Loaded ${DELETED_QUESTION_IDS.length} question IDs from todelete.txt`);
  console.log('🔌  Connecting to MongoDB...');

  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  const submissionsCol = db.collection('question_submissions');
  const answersCol     = db.collection('answers');
  const reviewsCol     = db.collection('reviews');

  const objectIds = DELETED_QUESTION_IDS.map(id => new ObjectId(id));

  console.log(`\n📋  Deleting orphaned data for ${objectIds.length} question IDs...\n`);

  const submissions = await submissionsCol.deleteMany({ questionId: { $in: objectIds } });
  console.log(`  🗑️   question_submissions deleted : ${submissions.deletedCount}`);

  const answers = await answersCol.deleteMany({ questionId: { $in: objectIds } });
  console.log(`  🗑️   answers deleted              : ${answers.deletedCount}`);

  const reviews = await reviewsCol.deleteMany({ questionId: { $in: objectIds } });
  console.log(`  🗑️   reviews deleted              : ${reviews.deletedCount}`);

  console.log('\n🎉  Done.');
  await client.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
