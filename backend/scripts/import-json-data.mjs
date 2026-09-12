import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { MongoClient, ObjectId } from 'mongodb';

const DB_URL = process.env.DB_URL;
const DB_NAME = process.env.DB_NAME || 'agriai';

if (!DB_URL) {
  console.error('❌ Error: DB_URL is not set in backend/.env');
  process.exit(1);
}

/**
 * Recursively converts MongoDB Extended JSON (e.g., {"$oid": "..."}, {"$date": "..."})
 * to native MongoDB types (ObjectId, Date, etc.)
 */
function deserializeBSON(obj) {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return obj.map(deserializeBSON);
  }

  if (typeof obj === 'object') {
    const keys = Object.keys(obj);

    // Handle $oid
    if (keys.length === 1 && obj.$oid && typeof obj.$oid === 'string') {
      try {
        return new ObjectId(obj.$oid);
      } catch (e) {
        return obj.$oid;
      }
    }

    // Handle $date
    if (keys.length === 1 && obj.$date) {
      if (typeof obj.$date === 'string' || typeof obj.$date === 'number') {
        return new Date(obj.$date);
      }
      if (typeof obj.$date === 'object' && obj.$date.$numberLong) {
        return new Date(Number(obj.$date.$numberLong));
      }
    }

    // Handle $numberLong / $numberInt / $numberDouble
    if (keys.length === 1 && obj.$numberLong) {
      return Number(obj.$numberLong);
    }
    if (keys.length === 1 && obj.$numberInt) {
      return parseInt(obj.$numberInt, 10);
    }
    if (keys.length === 1 && obj.$numberDouble) {
      return parseFloat(obj.$numberDouble);
    }

    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = deserializeBSON(value);
    }
    return result;
  }

  return obj;
}

/**
 * Read and parse a JSON file (supports both standard JSON arrays and newline-delimited JSON)
 */
function loadJsonFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (!content) return [];

  // Try standard JSON parse
  try {
    const parsed = JSON.parse(content);
    const data = Array.isArray(parsed) ? parsed : [parsed];
    return data.map(deserializeBSON);
  } catch (err) {
    // If not standard JSON array, try line-by-line (NDJSON / JSONL)
    const lines = content.split('\n');
    const items = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        try {
          items.push(deserializeBSON(JSON.parse(trimmed)));
        } catch (e) {
          console.warn(`    ⚠️ Could not parse line in ${path.basename(filePath)}:`, trimmed.slice(0, 50));
        }
      }
    }
    return items;
  }
}

/**
 * Extract clean collection name from filename.
 * E.g., "agriai_users.json" -> "users", "farmer_feedback_gdb_entries.json" -> "gdb_entries"
 */
function getCollectionName(filename) {
  let base = path.basename(filename, '.json');
  
  // Strip known db prefixes like "agriai_" or "farmer_feedback_"
  if (base.startsWith('agriai_')) {
    base = base.replace(/^agriai_/, '');
  } else if (base.startsWith('farmer_feedback_')) {
    base = base.replace(/^farmer_feedback_/, '');
  }
  return base;
}

/**
 * Recursively find all .json files in directory
 */
function getAllJsonFiles(dirPath, fileList = []) {
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      getAllJsonFiles(fullPath, fileList);
    } else if (file.endsWith('.json')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

/**
 * Main import runner
 */
async function importData() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
ℹ️ Usage:
  node scripts/import-json-data.mjs <folder-path-or-file-path> [more-paths...]

Examples:
  node scripts/import-json-data.mjs "C:/Users/NEERAJ GIRI/Downloads/Telegram Desktop/Database"
    `);
    process.exit(0);
  }

  const client = new MongoClient(DB_URL);

  try {
    console.log('🔄 Connecting to MongoDB...');
    await client.connect();
    console.log(`✅ Connected successfully to database: "${DB_NAME}"\n`);

    const db = client.db(DB_NAME);

    // Collect all JSON files
    const jsonFiles = [];

    for (const inputPath of args) {
      const resolved = path.resolve(inputPath);
      if (!fs.existsSync(resolved)) {
        console.warn(`⚠️ Path does not exist: ${resolved}`);
        continue;
      }

      const stat = fs.statSync(resolved);
      if (stat.isDirectory()) {
        const found = getAllJsonFiles(resolved);
        for (const f of found) {
          jsonFiles.push({
            filePath: f,
            collectionName: getCollectionName(f)
          });
        }
      } else if (resolved.endsWith('.json')) {
        jsonFiles.push({
          filePath: resolved,
          collectionName: getCollectionName(resolved)
        });
      }
    }

    if (jsonFiles.length === 0) {
      console.log('⚠️ No .json files found in the provided paths.');
      return;
    }

    console.log(`📦 Found ${jsonFiles.length} JSON file(s) to import into database "${DB_NAME}":\n`);
    for (const item of jsonFiles) {
      console.log(`  • ${path.basename(item.filePath)} ➔ collection: "${item.collectionName}"`);
    }
    console.log('\n---------------------------------------------------------');

    for (const { filePath, collectionName } of jsonFiles) {
      console.log(`\n📂 Processing: ${path.basename(filePath)} (Collection: "${collectionName}")...`);
      const documents = loadJsonFile(filePath);

      if (documents.length === 0) {
        console.log(`  ⚪ 0 documents found in file. Skipping.`);
        continue;
      }

      const collection = db.collection(collectionName);

      // Perform bulk insert in chunks
      console.log(`  ⏳ Inserting ${documents.length} documents into "${collectionName}"...`);
      
      const CHUNK_SIZE = 1000;
      let insertedCount = 0;
      let duplicateCount = 0;

      for (let i = 0; i < documents.length; i += CHUNK_SIZE) {
        const chunk = documents.slice(i, i + CHUNK_SIZE);
        try {
          const result = await collection.insertMany(chunk, { ordered: false });
          insertedCount += result.insertedCount;
        } catch (err) {
          if (err.code === 11000 || err.writeErrors) {
            // Some duplicate keys or partial success
            const successful = err.result?.insertedCount ?? (chunk.length - (err.writeErrors?.length || 0));
            insertedCount += Math.max(0, successful);
            duplicateCount += (err.writeErrors?.length || 0);
          } else {
            console.error(`  ❌ Error inserting chunk into ${collectionName}:`, err.message);
          }
        }
      }

      console.log(`  ✅ Done! Inserted: ${insertedCount} docs` + (duplicateCount > 0 ? `, Duplicates skipped: ${duplicateCount}` : ''));
    }

    console.log('\n=========================================================');
    console.log('🎉 ALL DATA IMPORTS COMPLETED SUCCESSFULLY!');
    console.log('=========================================================\n');
  } catch (error) {
    console.error('❌ Import failed:', error);
  } finally {
    await client.close();
    console.log('🔒 MongoDB connection closed.');
  }
}

importData();
