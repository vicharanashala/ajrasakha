#!/usr/bin/env node

/**
 * ============================================================================
 *  check-missing-crops.mjs
 * ============================================================================
 *
 *  Standalone script — run directly from the backend folder:
 *
 *      node scripts/check-missing-crops.mjs              # check missing crops
 *      node scripts/check-missing-crops.mjs --dry-run    # preview only (same as default)
 *
 *  What it does:
 *    1. Connects to MongoDB using DB_URL / DB_NAME from backend/.env
 *    2. Fetches all unique normalised_crop values from the questions collection
 *    3. Fetches all crop names from the crop_master collection
 *    4. Compares them and lists crops that are in questions but NOT in crop_master
 *    5. Optionally (commented out) adds missing crops to crop_master
 *
 *  Dependencies: mongodb, dotenv (already in backend/package.json)
 * ============================================================================
 */

import {MongoClient} from 'mongodb';
import {config} from 'dotenv';
import {resolve, dirname} from 'path';
import {fileURLToPath} from 'url';

// ── Load .env from backend/ ────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
config({path: resolve(__dirname, '..', '.env')});

const DB_URL = process.env.DB_URL;
const DB_NAME = process.env.DB_NAME || 'agriai';
const DRY_RUN = process.argv.includes('--dry-run');

if (!DB_URL) {
  console.error('❌  Missing DB_URL in backend/.env');
  process.exit(1);
}

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   Check Missing Crops in crop_master                        ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log(`  Database : ${DB_NAME}`);
console.log(
  `  Mode     : ${DRY_RUN ? '🔍 DRY RUN (no writes)' : '✏️  LIVE (will update DB)'}`,
);
console.log('');

// ── Connect ────────────────────────────────────────────────────────────────
const client = new MongoClient(DB_URL);

try {
  await client.connect();
  console.log('✅  Connected to MongoDB\n');

  const db = client.db(DB_NAME);
  const questionsCol = db.collection('questions');
  const cropMasterCol = db.collection('crop_master');

  // ── 1. Get all unique normalised_crop values from questions ──────────────
  console.log(
    '📋  Fetching unique normalised_crop values from questions collection...',
  );

  const normalisedCropsFromQuestions = await questionsCol.distinct(
    'details.normalised_crop',
  );

  // Filter out empty, null, or undefined values
  const validCropsFromQuestions = normalisedCropsFromQuestions.filter(
    crop => crop && typeof crop === 'string' && crop.trim() !== '',
  );

  console.log(
    `  Found ${validCropsFromQuestions.length} unique normalised_crop value(s)\n`,
  );

  // ── 2. Get all crop names from crop_master ───────────────────────────────
  console.log('📋  Fetching all crop names from crop_master collection...');

  const cropsFromMaster = await cropMasterCol.distinct('name');
  const validCropsFromMaster = cropsFromMaster.filter(
    crop => crop && typeof crop === 'string' && crop.trim() !== '',
  );

  console.log(
    `  Found ${validCropsFromMaster.length} crop(s) in crop_master\n`,
  );

  // ── 3. Find missing crops ────────────────────────────────────────────────
  const missingCrops = validCropsFromQuestions.filter(
    crop => !validCropsFromMaster.includes(crop),
  );

  // ── 4. Display results ───────────────────────────────────────────────────
  console.log(
    '═══════════════════════════════════════════════════════════════',
  );
  console.log('  RESULTS');
  console.log(
    '═══════════════════════════════════════════════════════════════',
  );
  console.log(
    `  Total unique crops in questions  : ${validCropsFromQuestions.length}`,
  );
  console.log(
    `  Total crops in crop_master       : ${validCropsFromMaster.length}`,
  );
  console.log(`  Missing crops (not in crop_master): ${missingCrops.length}`);
  console.log('');

  if (missingCrops.length > 0) {
    console.log('  ┌───────┬────────────────────────────────────────────┐');
    console.log('  │  #    │ Missing Crop                                │');
    console.log('  ├───────┼────────────────────────────────────────────┤');
    missingCrops.forEach((crop, index) => {
      const num = String(index + 1).padStart(3);
      const cropName = crop.padEnd(42).slice(0, 42);
      console.log(`  │ ${num}   │ ${cropName} │`);
    });
    console.log('  └───────┴────────────────────────────────────────────┘');
    console.log('');

    // ── 5. Add missing crops to crop_master (COMMENTED OUT) ─────────────────
    // Uncomment the code below to add missing crops to crop_master
    // Make sure to set a valid userId or update the placeholder

    /*
    // ═══════════════════════════════════════════════════════════════════════
    // CODE TO ADD MISSING CROPS TO crop_master (UNCOMMENT TO RUN)
    // ═══════════════════════════════════════════════════════════════════════
    
    // const userId = 'system-script'; // Replace with actual user ID if needed
    
    // console.log('\n📝  Adding missing crops to crop_master...\n');
    
    // const insertResults = [];
    // for (const cropName of missingCrops) {
    //   try {
    //     const result = await cropMasterCol.insertOne({
    //       name: cropName,
    //       aliases: [],
    //       type: 'crop',
    //       status: 'active',
    //       createdBy: userId,
    //       createdAt: new Date(),
    //       updatedAt: new Date(),
    //     });
    //     insertResults.push({ crop: cropName, success: true, id: result.insertedId });
    //     console.log(`  ✅ Added: ${cropName}`);
    //   } catch (err) {
    //     insertResults.push({ crop: cropName, success: false, error: err.message });
    //     console.log(`  ❌ Failed to add: ${cropName} - ${err.message}`);
    //   }
    // }
    
    // console.log('\n═══════════════════════════════════════════════════════════════');
    // console.log('  INSERT SUMMARY');
    // console.log('═══════════════════════════════════════════════════════════════');
    // const successful = insertResults.filter(r => r.success).length;
    // const failed = insertResults.filter(r => !r.success).length;
    // console.log(`  Successfully added : ${successful}`);
    // console.log(`  Failed             : ${failed}`);
    // console.log('');
    
    // ═══════════════════════════════════════════════════════════════════════
    // END OF CODE TO ADD MISSING CROPS
    // ═══════════════════════════════════════════════════════════════════════
    */

    if (DRY_RUN) {
      console.log('  ⚠️   DRY RUN — no changes were written to the database.');
      console.log(
        '  ➡️   To add missing crops, uncomment the code block in this script',
      );
      console.log('      and run again without --dry-run:');
      console.log('       node scripts/check-missing-crops.mjs');
    }
  } else {
    console.log('  ✅  All crops in questions are present in crop_master!');
  }

  console.log('');
} catch (err) {
  console.error('❌  Fatal error:', err);
  process.exit(1);
} finally {
  await client.close();
  console.log('🔒  MongoDB connection closed.');
}

export const jsonCropArray = [
  {
    crops_now: 'All Crops',
    crops_after: 'ALL',
  },
  {
    crops_now: 'Bengal Gram (Chickpea)',
    crops_after: 'Bengal Gram',
    aliases: 'Chickpea',
  },
  {
    crops_now: 'Raw Bengal Gram',
    crops_after: 'Bengal Gram',
  },
  {
    crops_now: 'chickpea (gram)',
    crops_after: 'Bengal Gram',
  },
  {
    crops_now: 'black chickpea',
    crops_after: 'Black Chickpea',
  },
  {
    crops_now: 'Black Gram (Urd Bean)',
    crops_after: 'Black Gram',
    aliases: 'Urd Bean',
  },
  {
    crops_now: 'Urd (black Gram)',
    crops_after: 'Black Gram',
    aliases: 'black Gram',
  },
  {
    crops_now: 'black gram (urad)',
    crops_after: 'Black Gram',
    aliases: 'urad',
  },
  {
    crops_now: 'Cluster Bean (Guar)',
    crops_after: 'Cluster Bean',
    aliases: 'Guar',
  },
  {
    crops_now: 'Drumstick (Moringa)',
    crops_after: 'Drumstick',
    aliases: 'Moringa',
  },
  {
    crops_now: 'fenugreek (methi)',
    crops_after: 'Fenugreek',
    aliases: 'methi',
  },
  {
    crops_now: 'Finger Millet (Ragi)',
    crops_after: 'Finger Millet',
    aliases: 'Ragi',
  },
  {
    crops_now: 'Foxnut (Makhana)',
    crops_after: 'Foxnut',
    aliases: 'Makhana',
  },
  {
    crops_now: 'Pea',
    crops_after: 'Garden Pea',
  },
  {
    crops_now: 'Vegetable Pea',
    crops_after: 'Garden Pea',
  },
  {
    crops_now: 'Green Gram (Moong Bean)',
    crops_after: 'Green Gram',
    aliases: 'Moong Bean',
  },
  {
    crops_now: 'green gram (moong)',
    crops_after: 'Green Gram',
    aliases: 'moong',
  },
  {
    crops_now: 'Peas',
    crops_after: 'Green Pea',
  },
  {
    crops_now: 'Kidney Bean (Rajma)',
    crops_after: 'Kidney Bean',
    aliases: 'Rajma',
  },
  {
    crops_now: 'keenu',
    crops_after: 'Kinnow',
  },
  {
    crops_now: 'kiwi fruit',
    crops_after: 'Kiwi',
  },
  {
    crops_now: 'flaxseed',
    crops_after: 'Linseed',
  },
  {
    crops_now: 'lychee',
    crops_after: 'Litchi',
  },
  {
    crops_now: 'Mentha Oil',
    crops_after: 'Mentha',
  },
  {
    crops_now: 'Mint (pudina)',
    crops_after: 'Mentha',
    aliases: 'pudina',
  },
  {
    crops_now: "Lady's Finger",
    crops_after: 'Okra',
  },
  {
    crops_now: 'chona',
    crops_after: 'Paddy',
  },
  {
    crops_now: 'Pearl Millet (Barja)',
    crops_after: 'Pearl Millet',
    aliases: 'Bajra',
  },
  {
    crops_now: 'Pearl Millet (bajra)',
    crops_after: 'Pearl Millet',
    aliases: 'Bajra',
  },
  {
    crops_now: 'Pigeon Pea (Red Gram)',
    crops_after: 'Pigeon Pea',
    aliases: 'Red Gram',
  },
  {
    crops_now: 'pigeon pea (tur)',
    crops_after: 'Pigeon Pea',
    aliases: 'tur',
  },
  {
    crops_now: 'Roselle Red Sorrel',
    crops_after: 'Roselle',
  },
  {
    crops_now: 'Rosellered Sorrel',
    crops_after: 'Roselle',
  },
  {
    crops_now: 'Jowar (sorghum)',
    crops_after: 'Sorghum',
    aliases: 'sorghum',
  },
  {
    crops_now: 'sorghum (jowar)',
    crops_after: 'Sorghum',
    aliases: 'jowar',
  },
  {
    crops_now: 'Sunn Hemp',
    crops_after: 'Sunnhemp',
  },
  {
    crops_now: 'Cassava',
    crops_after: 'Tapioca',
  },
  {
    crops_now: 'Water Chestnut (Singhara)',
    crops_after: 'Water Chestnut',
    aliases: 'Singhara',
  },
];
