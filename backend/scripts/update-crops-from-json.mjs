#!/usr/bin/env node

/**
 * ============================================================================
 *  update-crops-from-json.mjs
 * ============================================================================
 *
 *  Standalone script — run directly from the backend folder:
 *
 *      node scripts/update-crops-from-json.mjs              # check questions (dry run)
 *      node scripts/update-crops-from-json.mjs --dry-run    # same as above (preview only)
 *
 *  What it does:
 *    1. Connects to MongoDB using DB_URL / DB_NAME from backend/.env
 *    2. Takes a JSON array with crops_now and crops_after mappings
 *    3. Finds all questions where details.normalised_crop matches any crops_now
 *    4. Lists question IDs for each crop mapping
 *    5. Optionally (commented out):
 *       - Updates question.details.normalised_crop from crops_now to crops_after
 *       - Creates missing crops in crop_master
 *       - Adds aliases to existing crops in crop_master
 *
 *  Example JSON array format:
 *    [
 *      {
 *        "crops_now": "old_crop_name",
 *        "crops_after": "new_crop_name",
 *        "aliases": ["alias1", "alias2"]
 *      }
 *    ]
 *
 *  Dependencies: mongodb, dotenv (already in backend/package.json)
 * ============================================================================
 */

import { MongoClient } from 'mongodb';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Load .env from backend/ ────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env') });

const DB_URL = process.env.DB_URL;
const DB_NAME = process.env.DB_NAME || 'agriai';
const DRY_RUN = process.argv.includes('--dry-run');

// ── JSON Array of crop mappings ────────────────────────────────────────────
// Modify this array to change the crop mappings you want to process
// Note: aliases is a single string, not an array
// const jsonCropArray = [
//   // Example:
//   // {
//   //   "crops_now": "wheat",
//   //   "crops_after": "wheat_new",
//   //   "aliases": "gehu"  // single string, will be stored as array in crop_master
//   // }
// ];
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

if (!DB_URL) {
  console.error('❌  Missing DB_URL in backend/.env');
  process.exit(1);
}

if (!jsonCropArray || jsonCropArray.length === 0) {
  console.error('❌  jsonCropArray is empty. Please add crop mappings to the array at the top of this script.');
  process.exit(1);
}

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   Update Crops from JSON Array                              ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log(`  Database : ${DB_NAME}`);
console.log(`  Mode     : ${DRY_RUN ? '🔍 DRY RUN (no writes)' : '✏️  LIVE (will update DB)'}`);
console.log(`  Mappings : ${jsonCropArray.length} crop(s) to process`);
console.log('');

// ── Connect ────────────────────────────────────────────────────────────────
const client = new MongoClient(DB_URL);

try {
  await client.connect();
  console.log('✅  Connected to MongoDB\n');

  const db = client.db(DB_NAME);
  const questionsCol = db.collection('questions');
  const cropMasterCol = db.collection('crop_master');

  // ── 1. Extract all crops_now from the JSON array ─────────────────────────
  const cropsNowList = jsonCropArray.map(item => item.crops_now).filter(Boolean);
  console.log('📋  Crops to find:', cropsNowList.join(', '));
  console.log('');

  // ── 2. Find all questions matching any crops_now ─────────────────────────
  console.log('📋  Searching for questions with matching normalised_crop...');

  const questions = await questionsCol
    .find({
      'details.normalised_crop': { $in: cropsNowList }
    })
    .project({ _id: 1, 'details.normalised_crop': 1 })
    .toArray();

  // Group questions by crops_now
  const questionsByCrop = {};
  for (const item of jsonCropArray) {
    questionsByCrop[item.crops_now] = [];
  }

  for (const q of questions) {
    const crop = q.details?.normalised_crop;
    if (questionsByCrop[crop]) {
      questionsByCrop[crop].push(q._id.toString());
    }
  }

  // ── 3. Display results ───────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  RESULTS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Total questions found: ${questions.length}`);
  console.log('');

  let totalQuestions = 0;
  for (const item of jsonCropArray) {
    const cropNow = item.crops_now;
    const cropAfter = item.crops_after;
    const alias = item.aliases || '';  // aliases is a string, not array
    const questionIds = questionsByCrop[cropNow] || [];
    totalQuestions += questionIds.length;

    console.log(`  ┌──────────────────────────────────────────────────────────────┐`);
    console.log(`  │  ${cropNow.padEnd(55)} │`);
    console.log(`  │  → ${cropAfter.padEnd(54)} │`);
    console.log(`  │  Alias: ${alias.padEnd(50)} │`);
    console.log(`  │  Questions found: ${String(questionIds.length).padEnd(39)} │`);
    console.log(`  │                                                              │`);

    if (questionIds.length > 0) {
      // Show first 10 question IDs
      const displayIds = questionIds.slice(0, 10);
      for (const qid of displayIds) {
        console.log(`  │    - ${qid.padEnd(51)} │`);
      }
      if (questionIds.length > 10) {
        console.log(`  │    ... and ${questionIds.length - 10} more`.padEnd(60) + `│`);
      }
    } else {
      console.log(`  │    (No questions found)`.padEnd(60) + `│`);
    }
    console.log(`  └──────────────────────────────────────────────────────────────┘`);
    console.log('');
  }

  console.log(`  Total questions to update: ${totalQuestions}`);
  console.log('');

  // ── 4. Check crop_master status for crops_after ──────────────────────────
  console.log('📋  Checking crop_master for crops_after...');

  const cropsAfterList = jsonCropArray.map(item => item.crops_after).filter(Boolean);
  const existingCrops = await cropMasterCol
    .find({ name: { $in: cropsAfterList } })
    .project({ name: 1, aliases: 1 })
    .toArray();

  const existingCropNames = existingCrops.map(c => c.name);
  
  // Deduplicate missing crops - only show each crop once
  const missingCropsSet = new Set(cropsAfterList.filter(c => !existingCropNames.includes(c)));
  const missingCrops = Array.from(missingCropsSet);

  console.log(`  Existing in crop_master: ${existingCropNames.length}`);
  console.log(`  Missing from crop_master: ${missingCrops.length}`);

  if (missingCrops.length > 0) {
    console.log('');
    console.log('  Missing crops that need to be created:');
    for (const crop of missingCrops) {
      // Find the first item with this crops_after to get the alias
      const item = jsonCropArray.find(i => i.crops_after === crop);
      console.log(`    - ${crop} (alias: ${item?.aliases || 'none'})`);
    }
  }

  // Check aliases for existing crops (aliases is a string, not array)
  // Deduplicate by crop name
  const cropsNeedingAliasesMap = new Map();
  for (const existingCrop of existingCrops) {
    const item = jsonCropArray.find(i => i.crops_after === existingCrop.name);
    if (item && item.aliases && typeof item.aliases === 'string') {
      // Check if alias already exists in the crop's aliases (handle object format)
      const existingAliases = existingCrop.aliases || [];
      const aliasExists = existingAliases.some(existing => {
        if (typeof existing === 'string') return existing === item.aliases;
        if (typeof existing === 'object') {
          // Handle object format like { english_representation: "..." }
          return existing.english_representation === item.aliases || 
                 existing.native_representation === item.aliases;
        }
        return false;
      });
      
      if (!aliasExists && !cropsNeedingAliasesMap.has(existingCrop.name)) {
        cropsNeedingAliasesMap.set(existingCrop.name, {
          name: existingCrop.name,
          existingAliases,
          newAlias: item.aliases
        });
      }
    }
  }
  const cropsNeedingAliases = Array.from(cropsNeedingAliasesMap.values());

  if (cropsNeedingAliases.length > 0) {
    console.log('');
    console.log('  Crops needing alias updates:');
    for (const crop of cropsNeedingAliases) {
      console.log(`    - ${crop.name}`);
      // Format existing aliases for display (handle object format)
      const existingDisplay = crop.existingAliases.map(a => {
        if (typeof a === 'string') return a;
        if (typeof a === 'object') return a.english_representation || a.native_representation || JSON.stringify(a);
        return String(a);
      }).join(', ');
      console.log(`      Existing: ${existingDisplay || 'none'}`);
      console.log(`      New: ${crop.newAlias}`);
    }
  }

  console.log('');

  // ── 5. Update operations (COMMENTED OUT) ─────────────────────────────────
  // Uncomment the code below to perform the actual updates
  // Make sure to set a valid userId or update the placeholder

  /*
  // ═══════════════════════════════════════════════════════════════════════
  // CODE TO UPDATE QUESTIONS AND crop_master (UNCOMMENT TO RUN)
  // ═══════════════════════════════════════════════════════════════════════

  const userId = 'system-script'; // Replace with actual user ID if needed

  // ── 5a. Create missing crops in crop_master ──────────────────────────────
  console.log('\n📝  Creating missing crops in crop_master...\n');

  for (const cropName of missingCrops) {
    const item = jsonCropArray.find(i => i.crops_after === cropName);
    try {
      // Store alias as array in crop_master
      const aliasesArray = item?.aliases ? [item.aliases] : [];
      await cropMasterCol.insertOne({
        name: cropName,
        aliases: aliasesArray,
        type: 'crop',
        status: 'active',
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log(`  ✅ Created crop: ${cropName} (alias: ${item?.aliases || 'none'})`);
    } catch (err) {
      console.log(`  ❌ Failed to create crop: ${cropName} - ${err.message}`);
    }
  }

  // ── 5b. Add alias to existing crops ──────────────────────────────────────
  console.log('\n📝  Adding alias to existing crops...\n');

  for (const crop of cropsNeedingAliases) {
    try {
      // Add single alias string to the aliases array
      await cropMasterCol.updateOne(
        { name: crop.name },
        { 
          $addToSet: { aliases: crop.newAlias },
          $set: { updatedAt: new Date() }
        }
      );
      console.log(`  ✅ Added alias "${crop.newAlias}" to: ${crop.name}`);
    } catch (err) {
      console.log(`  ❌ Failed to add alias to: ${crop.name} - ${err.message}`);
    }
  }

  // ── 5c. Update questions with new normalised_crop ────────────────────────
  console.log('\n📝  Updating questions with new normalised_crop...\n');

  let updatedCount = 0;
  let errorCount = 0;

  for (const item of jsonCropArray) {
    const cropNow = item.crops_now;
    const cropAfter = item.crops_after;
    const questionIds = questionsByCrop[cropNow] || [];

    if (questionIds.length === 0) continue;

    try {
      const result = await questionsCol.updateMany(
        { 'details.normalised_crop': cropNow },
        { 
          $set: { 
            'details.normalised_crop': cropAfter,
            updatedAt: new Date()
          }
        }
      );
      updatedCount += result.modifiedCount;
      console.log(`  ✅ Updated ${result.modifiedCount} questions: ${cropNow} → ${cropAfter}`);
    } catch (err) {
      errorCount += questionIds.length;
      console.log(`  ❌ Failed to update questions for: ${cropNow} - ${err.message}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  UPDATE SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Questions updated : ${updatedCount}`);
  console.log(`  Errors            : ${errorCount}`);
  console.log(`  Crops created     : ${missingCrops.length}`);
  console.log(`  Crops updated     : ${cropsNeedingAliases.length}`);
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════
  // END OF UPDATE CODE
  // ═══════════════════════════════════════════════════════════════════════
  */

  if (DRY_RUN || totalQuestions > 0) {
    console.log('  ⚠️   DRY RUN — no changes were written to the database.');
    console.log('  ➡️   To perform updates:');
    console.log('      1. Uncomment the code block in this script');
    console.log('      2. Add your crop mappings to jsonCropArray');
    console.log('      3. Run: node scripts/update-crops-from-json.mjs');
  }

  console.log('');
} catch (err) {
  console.error('❌  Fatal error:', err);
  process.exit(1);
} finally {
  await client.close();
  console.log('🔒  MongoDB connection closed.');
}