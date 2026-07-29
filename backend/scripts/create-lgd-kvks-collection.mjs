#!/usr/bin/env node

/**
 * ============================================================================
 *  create-lgd-kvks-collection.mjs
 * ============================================================================
 *
 *  Standalone script — run directly from the backend folder:
 *
 *      node scripts/create-lgd-kvks-collection.mjs          # dry run (default)
 *      node scripts/create-lgd-kvks-collection.mjs --apply  # actually write
 *
 *  What it does:
 *    Reads the KVK registry CSV file and uploads the data into a
 *    new `kvks` MongoDB collection.
 *
 *  Collection:
 *    • kvks — one document per KVK, upserted on `kvkId`.
 *      Fields stored: kvkId, kvkName, kvkAddress, districtCode,
 *      createdAt, updatedAt.
 *
 *  Safe to re-run: existing KVKs are upserted (matched on kvkId).
 *  A unique index on `kvkId` is created if missing.
 * ============================================================================
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { MongoClient } from 'mongodb';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CSV_FILE_PATH = path.join(__dirname, 'krishi_vigyan kendra registry_2026-04-22_14-07-33.csv');

const APPLY = process.argv.includes('--apply');

const DB_URL = process.env.DB_URL;
const DB_NAME = process.env.DB_NAME || 'agriai';

if (!DB_URL) {
  console.error('❌ DB_URL is not set (put it in .env or pass it inline).');
  process.exit(1);
}

const COLLECTION_NAME = 'kvks';

async function run() {
  console.log(`\n======================================================`);
  console.log(` KVK Upload Script`);
  console.log(`======================================================\n`);
  
  if (!fs.existsSync(CSV_FILE_PATH)) {
    console.error(`❌ CSV file not found at: ${CSV_FILE_PATH}`);
    process.exit(1);
  }

  if (!APPLY) {
    console.log(`[DRY RUN] Will not write to DB. Run with --apply to insert/update.`);
  }

  const results = [];
  
  console.log(`Reading CSV from ${CSV_FILE_PATH}...`);
  
  let currentStateLgdCode = null;

  await new Promise((resolve, reject) => {
    fs.createReadStream(CSV_FILE_PATH)
      .pipe(csv())
      .on('data', (data) => {
        let kvkId, kvkName, kvkAddress, districtLgdCodeStr, stateLgdCodeStr, latitudeStr, longitudeStr;
        for (const key of Object.keys(data)) {
            const cleanKey = key.replace(/^[\uFEFF\u200B]+/, '').replace(/^["']|["']$/g, '').trim();
            let val = data[key];
            if (typeof val === 'string') {
                val = val.replace(/^="?([^"]+)"?$/, '$1').trim();
            }
            if (cleanKey === 'KVK ID') kvkId = val;
            if (cleanKey === 'KVK Name') kvkName = val;
            if (cleanKey === 'KVK Address') kvkAddress = val;
            if (cleanKey === 'District LGD Code') districtLgdCodeStr = val;
            if (cleanKey === 'State LGD Code') stateLgdCodeStr = val;
            if (cleanKey === 'Latitude') latitudeStr = val;
            if (cleanKey === 'Longitude') longitudeStr = val;
        }
        
        if (stateLgdCodeStr) {
            currentStateLgdCode = Number(stateLgdCodeStr);
        }
        
        const parseNum = (v) => (!v || v === 'NA') ? null : (isNaN(Number(v)) ? null : Number(v));
        
        const districtCode = parseNum(districtLgdCodeStr);
        const latitude = parseNum(latitudeStr);
        const longitude = parseNum(longitudeStr);
        const stateCode = currentStateLgdCode;
        
        if (kvkId && kvkName) {
            results.push({
                kvkId,
                kvkName,
                kvkAddress,
                districtCode,
                stateCode,
                latitude,
                longitude,
                createdAt: new Date(),
                updatedAt: new Date()
            });
        }
      })
      .on('end', () => {
        resolve();
      })
      .on('error', (err) => reject(err));
  });

  console.log(`Found ${results.length} valid KVK records in CSV.`);
  
  if (!APPLY) {
      console.log(`\nSample of records to be inserted:`);
      console.dir(results.slice(0, 3), { depth: null });
      console.log(`\nRun with --apply to insert into database.`);
      process.exit(0);
  }

  console.log(`Connecting to MongoDB at ${DB_URL}...`);
  const client = new MongoClient(DB_URL);
  
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);
    
    console.log(`Creating unique index on kvkId...`);
    await collection.createIndex({ kvkId: 1 }, { unique: true });
    
    console.log(`Upserting ${results.length} KVK records...`);
    
    let inserted = 0;
    let updated = 0;
    
    const operations = results.map(record => {
      const { kvkId, ...updateData } = record;
      // Don't overwrite createdAt on update
      delete updateData.createdAt;
      
      return {
        updateOne: {
          filter: { kvkId },
          update: { 
            $set: updateData,
            $setOnInsert: { createdAt: record.createdAt }
          },
          upsert: true
        }
      };
    });
    
    // Process in batches of 500
    const batchSize = 500;
    for (let i = 0; i < operations.length; i += batchSize) {
        const batch = operations.slice(i, i + batchSize);
        const result = await collection.bulkWrite(batch);
        inserted += result.upsertedCount;
        updated += result.modifiedCount;
        console.log(`Processed batch ${Math.floor(i/batchSize) + 1} / ${Math.ceil(operations.length/batchSize)}`);
    }
    
    console.log(`\n✅ Done! Inserted ${inserted} new records, updated ${updated} existing records.`);

  } catch (error) {
    console.error('❌ Error during database operation:', error);
  } finally {
    await client.close();
  }
}

run().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
