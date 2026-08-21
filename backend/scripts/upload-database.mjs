import dns from 'dns';
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch {}

import fs from 'fs';
import path from 'path';
import { MongoClient, BSON } from 'mongodb';
const { EJSON } = BSON;
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const DB_URL = process.env.DB_URL;
const DB_NAME = process.env.DB_NAME || 'agriai';

if (!DB_URL) {
  console.error('DB_URL not found in .env');
  process.exit(1);
}

const DESKTOP_DB_DIR = 'C:/Users/tomar/OneDrive/Desktop/Database';

function getCollectionName(filename) {
  const base = path.basename(filename, '.json').toLowerCase();
  
  // Specific mappings
  const mapping = {
    'agriai_users': 'users',
    'agriai_user_details': 'user_details',
    'agriai_user_role_history': 'user_role_history',
    'agriai_questions': 'questions',
    'agriai_answers': 'answers',
    'agriai_question_submissions': 'question_submissions',
    'agriai_duplicate_questions': 'duplicate_questions',
    'agriai_reviews': 'reviews',
    'agriai_requests': 'requests',
    'agriai_reroutes': 'reroutes',
    'agriai_comments': 'comments',
    'agriai_contexts': 'contexts',
    'agriai_crop_master': 'crop_master',
    'agriai_subscriptions': 'subscriptions',
    'agriai_notifications': 'notifications',
    'agriai_audit_trails': 'audits',
    'agriai_audittrails': 'audits',
    'agriai_audits': 'audits',
    'agriai_langgraph_log': 'langgraph_log',
    'farmer_feedback_feedback': 'feedbacks',
    'farmer_feedback_flagged_entries': 'flagged_entries',
    'farmer_feedback_gdb_entries': 'gdb_entries',
    'farmer_feedback_message_tracking': 'farmer_feedback_message_tracking',
    'farmer_feedback_weekly_digest': 'farmer_feedback_weekly_digest',
  };

  if (mapping[base]) return mapping[base];

  // Strip prefix agriai_ or farmer_feedback_
  let cleanName = base.replace(/^agriai_/, '').replace(/^farmer_feedback_/, '');
  return cleanName;
}

function findJsonFiles(dir) {
  const results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results.push(...findJsonFiles(fullPath));
    } else if (file.endsWith('.json')) {
      results.push(fullPath);
    }
  }
  return results;
}

async function run() {
  console.log(`🚀 Connecting to MongoDB Atlas (${DB_NAME})...`);
  const client = new MongoClient(DB_URL);
  await client.connect();
  console.log('✅ Connected successfully!');

  const db = client.db(DB_NAME);
  const files = findJsonFiles(DESKTOP_DB_DIR);

  console.log(`📁 Found ${files.length} JSON data files in ${DESKTOP_DB_DIR}`);

  const summary = [];

  for (const filePath of files) {
    const fileName = path.basename(filePath);
    const collectionName = getCollectionName(fileName);
    try {
      const rawContent = fs.readFileSync(filePath, 'utf8');
      if (!rawContent || !rawContent.trim()) {
        console.warn(`⚠️ Empty file: ${fileName}`);
        continue;
      }

      let parsed = EJSON.parse(rawContent);
      if (!Array.isArray(parsed)) {
        parsed = [parsed];
      }

      if (parsed.length === 0) {
        summary.push({ File: fileName, Collection: collectionName, Count: 0, Status: 'Empty array' });
        continue;
      }

      const collection = db.collection(collectionName);
      
      const operations = parsed.map(doc => {
        if (doc._id) {
          return {
            replaceOne: {
              filter: { _id: doc._id },
              replacement: doc,
              upsert: true,
            },
          };
        } else {
          return {
            insertOne: {
              document: doc,
            },
          };
        }
      });

      // Execute in chunks of 500
      const chunkSize = 500;
      for (let i = 0; i < operations.length; i += chunkSize) {
        const chunk = operations.slice(i, i + chunkSize);
        await collection.bulkWrite(chunk, { ordered: false });
      }

      // If feedbacks or gdb_entries, also duplicate to farmer_feedback_* collections if needed
      if (collectionName === 'feedbacks') {
        const secondary = db.collection('farmer_feedback_feedback');
        for (let i = 0; i < operations.length; i += chunkSize) {
          await secondary.bulkWrite(operations.slice(i, i + chunkSize), { ordered: false });
        }
      }
      if (collectionName === 'gdb_entries') {
        const secondary = db.collection('farmer_feedback_gdb_entries');
        for (let i = 0; i < operations.length; i += chunkSize) {
          await secondary.bulkWrite(operations.slice(i, i + chunkSize), { ordered: false });
        }
      }

      summary.push({ File: fileName, Collection: collectionName, Count: parsed.length, Status: '✅ Uploaded' });
      console.log(`  -> [${collectionName}] Uploaded ${parsed.length} documents from ${fileName}`);
    } catch (err) {
      console.error(`❌ Error uploading ${fileName}:`, err.message);
      summary.push({ File: fileName, Collection: collectionName, Count: 0, Status: `❌ Error: ${err.message}` });
    }
  }

  console.log('\n📊 Database Upload Summary:');
  console.table(summary);

  await client.close();
  console.log('🎉 All database records uploaded to MongoDB Atlas successfully!');
}

run().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
