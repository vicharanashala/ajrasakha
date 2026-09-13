/**
 * One-time migration script: Normalize crop names in crop_master and questions collections.
 *
 * For each entry in CROP_NAME_MAP:
 *  1. Find the crop_master document whose `name` matches the `name` value (case-insensitive).
 *     If found → update `name` to `expectedName` (stored lowercase to match schema convention).
 *     If not found → collect into the "not in crop_master" report.
 *  2. Update all questions where `details.normalised_crop` matches `name` (case-insensitive)
 *     → replace with `expectedName`.
 *
 * Run:
 *   cd backend
 *   pnpm build && node build/scripts/normalizeCropNames.js
 *
 * Or compile just this file:
 *   pnpx ts-node --esm src/scripts/normalizeCropNames.ts
 */

import { config } from 'dotenv';
import { MongoClient } from 'mongodb';

config();

const MONGO_URI = process.env.DB_URL || process.env.MONGO_URI || process.env.DATABASE_URL || '';
const DB_NAME   = process.env.DB_NAME || process.env.DATABASE_NAME || '';

if (!MONGO_URI || !DB_NAME) {
  console.error('❌  DB_URL and DB_NAME must be set in your .env file.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Mapping: { name: value to find, expectedName: value to set }
// ---------------------------------------------------------------------------
const CROP_NAME_MAP: { name: string; expectedName: string }[] = [
  { name: 'all', expectedName: 'All' },
  { name: 'all crops', expectedName: 'All Crops' },
  { name: 'allspice', expectedName: 'All Spice' },
  { name: 'amaranthus', expectedName: 'Amaranth' },
  { name: 'apple', expectedName: 'Apple' },
  { name: 'arecanut', expectedName: 'Arecanut' },
  { name: 'babycorn', expectedName: 'Baby Corn' },
  { name: 'bajra/pearl millet', expectedName: 'Pearl Millet' },
  { name: 'bamboo', expectedName: 'Bamboo' },
  { name: 'banana', expectedName: 'Banana' },
  { name: 'banana stem', expectedName: 'Banana Stem' },
  { name: 'barley', expectedName: 'Barley' },
  { name: 'bellary onion', expectedName: 'Bellary Onion' },
  { name: 'bengal gram', expectedName: 'Bengal Gram' },
  { name: 'berseem', expectedName: 'Berseem' },
  { name: 'bitter gourd', expectedName: 'Bitter Gourd' },
  { name: 'black cumin', expectedName: 'Black Cumin' },
  { name: 'black gram', expectedName: 'Black Gram' },
  { name: 'black pepper', expectedName: 'Black Pepper' },
  { name: 'blackgram', expectedName: 'Black Gram' },
  { name: 'bottle gourd', expectedName: 'Bottle Gourd' },
  { name: 'brinjal', expectedName: 'Brinjal' },
  { name: 'broccoli', expectedName: 'Broccoli' },
  { name: 'cabbage', expectedName: 'Cabbage' },
  { name: 'cardamom', expectedName: 'Cardamom' },
  { name: 'carrot', expectedName: 'Carrot' },
  { name: 'cashew', expectedName: 'Cashew' },
  { name: 'cassava', expectedName: 'Cassava' },
  { name: 'cassava (tapioca)', expectedName: 'Tapioca' },
  { name: 'cattle', expectedName: 'Cattle' },
  { name: 'cauliflower', expectedName: 'Cauliflower' },
  { name: 'cauliflower/cabbage', expectedName: 'Cauliflower/Cabbage' },
  { name: 'chickpea', expectedName: 'Chickpea' },
  { name: 'chili', expectedName: 'Chili' },
  { name: 'chilli', expectedName: 'Chili' },
  { name: 'chilly', expectedName: 'Chili' },
  { name: 'chinese cabbage', expectedName: 'Chinese Cabbage' },
  { name: 'citrus', expectedName: 'Citrus' },
  { name: 'cluster bean', expectedName: 'Cluster Bean' },
  { name: 'cocoa', expectedName: 'Cocoa' },
  { name: 'coconut', expectedName: 'Coconut' },
  { name: 'coriander', expectedName: 'Coriander' },
  { name: 'cotton', expectedName: 'Cotton' },
  { name: 'cotton, guar', expectedName: 'Cotton, Guar' },
  { name: 'cowpea', expectedName: 'Cowpea' },
  { name: 'crop production', expectedName: 'Crop Production' },
  { name: 'cucumber', expectedName: 'Cucumber' },
  { name: 'cumin', expectedName: 'Cumin' },
  { name: 'custard apple', expectedName: 'Custard Apple' },
  { name: 'dragon fruit', expectedName: 'Dragon Fruit' },
  { name: 'drumstick', expectedName: 'Drumstick' },
  { name: 'fennel', expectedName: 'Fennel' },
  { name: 'fenugreek', expectedName: 'Fenugreek' },
  { name: 'fenugreek (methi)', expectedName: 'Fenugreek' },
  { name: 'finger millet', expectedName: 'Finger Millet' },
  { name: 'finger millet (ragi)', expectedName: 'Finger Millet' },
  { name: 'fodder', expectedName: 'Fodder' },
  { name: 'fodder crop', expectedName: 'Fodder' },
  { name: 'fodder crops', expectedName: 'Fodder' },
  { name: 'fodder maize', expectedName: 'Fodder Maize' },
  { name: 'fodder sorghum', expectedName: 'Fodder Sorghum' },
  { name: 'foxnut', expectedName: 'Foxnut' },
  { name: 'foxnut (makhana)', expectedName: 'Foxnut' },
  { name: 'french bean', expectedName: 'French Bean' },
  { name: 'fruit tree', expectedName: 'Fruit Tree' },
  { name: 'garlic', expectedName: 'Garlic' },
  { name: 'general', expectedName: 'General' },
  { name: 'ginger', expectedName: 'Ginger' },
  { name: 'grape', expectedName: 'Grape' },
  { name: 'grapes', expectedName: 'Grape' },
  { name: 'green chili', expectedName: 'Chili' },
  { name: 'green chilli', expectedName: 'Chili' },
  { name: 'green gram', expectedName: 'Green Gram' },
  { name: 'groundnut', expectedName: 'Groundnut' },
  { name: 'guar', expectedName: 'Guar' },
  { name: 'guava', expectedName: 'Guava' },
  { name: 'har har dal (pulses)', expectedName: 'Pigeon Pea' },
  { name: 'indian rapeseed & mustard', expectedName: 'Rapeseed & Mustard' },
  { name: 'indian rapeseed and mustard', expectedName: 'Rapeseed & Mustard' },
  { name: 'jasmine', expectedName: 'Jasmine' },
  { name: 'jasmine flower', expectedName: 'Jasmine' },
  { name: 'jhona (millet/sorghum)', expectedName: 'Paddy' },
  { name: 'jute', expectedName: 'Jute' },
  { name: 'jute leaves', expectedName: 'Jute' },
  { name: 'kidney bean', expectedName: 'Kidney Bean' },
  { name: 'kidney bean/rajama', expectedName: 'Kidney Bean' },
  { name: 'kinnow', expectedName: 'Kinnow' },
  { name: 'kiwifruit', expectedName: 'Kiwi' },
  { name: 'lemon', expectedName: 'Lemon' },
  { name: 'lentil', expectedName: 'Lentil' },
  { name: 'lime', expectedName: 'Lime' },
  { name: 'linseed', expectedName: 'Linseed' },
  { name: 'litchi', expectedName: 'Litchi' },
  { name: 'maize', expectedName: 'Maize' },
  { name: 'makhana', expectedName: 'Foxnut' },
  { name: 'mango', expectedName: 'Mango' },
  { name: 'mentha (mint)', expectedName: 'Mint' },
  { name: 'millet', expectedName: 'Millet' },
  { name: 'moringa', expectedName: 'Moringa' },
  { name: 'multiple crops', expectedName: 'Multiple Crops' },
  { name: 'mushroom', expectedName: 'Mushroom' },
  { name: 'mustard', expectedName: 'Mustard' },
  { name: 'n/a', expectedName: 'N/A' },
  { name: 'napier grass', expectedName: 'Napier Grass' },
  { name: 'not specified', expectedName: 'Not Specified' },
  { name: 'oats', expectedName: 'Oats' },
  { name: 'okra', expectedName: 'Okra' },
  { name: 'onion', expectedName: 'Onion' },
  { name: 'opium', expectedName: 'Opium' },
  { name: 'orange', expectedName: 'Orange' },
  { name: 'paddy', expectedName: 'Paddy' },
  { name: 'paddy/rice', expectedName: 'Paddy' },
  { name: 'pady', expectedName: 'Paddy' },
  { name: 'papaya', expectedName: 'Papaya' },
  { name: 'passion fruit', expectedName: 'Passion Fruit' },
  { name: 'pea', expectedName: 'Pea' },
  { name: 'pearl millet', expectedName: 'Pearl Millet' },
  { name: 'pepper', expectedName: 'Pepper' },
  { name: 'pigeon pea', expectedName: 'Pigeon Pea' },
  { name: 'pineapple', expectedName: 'Pineapple' },
  { name: 'pomegranate', expectedName: 'Pomegranate' },
  { name: 'poplar', expectedName: 'Poplar' },
  { name: 'potato', expectedName: 'Potato' },
  { name: 'red sanders', expectedName: 'Red Sanders' },
  { name: 'rice', expectedName: 'Paddy' },
  { name: 'rice (paddy)', expectedName: 'Paddy' },
  { name: 'rice, cotton', expectedName: 'Paddy, Cotton' },
  { name: 'ridge gourd', expectedName: 'Ridge Gourd' },
  { name: 'rose', expectedName: 'Rose' },
  { name: 'rubber', expectedName: 'Rubber' },
  { name: 'rye', expectedName: 'Rye' },
  { name: 'saffron', expectedName: 'Saffron' },
  { name: 'sapota', expectedName: 'Sapota' },
  { name: 'sesame', expectedName: 'Sesame' },
  { name: 'small onion', expectedName: 'Small Onion' },
  { name: 'sorghum', expectedName: 'Sorghum' },
  { name: 'soybean', expectedName: 'Soybean' },
  { name: 'spinach', expectedName: 'Spinach' },
  { name: 'sugarcane', expectedName: 'Sugarcane' },
  { name: 'sugarcane ratoon', expectedName: 'Sugarcane' },
  { name: 'sun hemp', expectedName: 'Sunn Hemp' },
  { name: 'sunflower', expectedName: 'Sunflower' },
  { name: 'sunnhemp', expectedName: 'Sunn Hemp' },
  { name: 'sweet corn', expectedName: 'Sweet Corn' },
  { name: 'sweet lemon', expectedName: 'Sweet Lemon' },
  { name: 'tapioca', expectedName: 'Tapioca' },
  { name: 'tea', expectedName: 'Tea' },
  { name: 'tobacco', expectedName: 'Tobacco' },
  { name: 'tomato', expectedName: 'Tomato' },
  { name: 'tomatos', expectedName: 'Tomato' },
  { name: 'tree tomato', expectedName: 'Tree Tomato' },
  { name: 'tuberose', expectedName: 'Tuberose' },
  { name: 'turmeric', expectedName: 'Turmeric' },
  { name: 'unknown', expectedName: 'Unknown' },
  { name: 'vanilla', expectedName: 'Vanilla' },
  { name: 'vegetables', expectedName: 'Vegetables' },
  { name: 'walnut', expectedName: 'Walnut' },
  { name: 'watermelon', expectedName: 'Watermelon' },
  { name: 'wheat', expectedName: 'Wheat' },
  { name: 'wood apple', expectedName: 'Wood Apple' },
];

// ---------------------------------------------------------------------------

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function main() {
  console.log('🔌  Connecting to MongoDB...');
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  const cropCol      = db.collection('crop_master');
  const questionsCol = db.collection('questions');

  const notInCropMaster: string[] = [];

  let cropUpdated   = 0;
  let cropSkipped   = 0; // already has the right name / no change needed
  let questionsUpdated = 0;

  console.log(`\n📋  Processing ${CROP_NAME_MAP.length} entries...\n`);

  // Track names that have already been renamed so duplicate mappings
  // (e.g. "chilli" → "Chili" and "chili" → "Chili") don't conflict.
  // Key: originalName (lowercased), Value: expectedName used
  const processedCropNames = new Map<string, string>();

  for (const { name, expectedName } of CROP_NAME_MAP) {
    const regex = new RegExp(`^${escapeRegex(name.trim())}$`, 'i');

    // ── 1. crop_master ──────────────────────────────────────────────────────
    const existingCrop = await cropCol.findOne({ name: regex });

    if (!existingCrop) {
      console.log(`  ⚠️   crop_master — NOT FOUND: "${name}"`);
      notInCropMaster.push(name);
    } else {
      const alreadyCorrect = existingCrop.name === expectedName;
      if (alreadyCorrect) {
        console.log(`  ✅  crop_master — already correct: "${expectedName}"`);
        cropSkipped++;
      } else if (processedCropNames.has(existingCrop.name)) {
        // Document was already renamed by a previous iteration (e.g. "chilli" already merged into "Chili")
        console.log(`  ⏭️   crop_master — skipped (already processed as "${processedCropNames.get(existingCrop.name)}"): "${name}"`);
        cropSkipped++;
      } else {
        // Check if a document with expectedName already exists (merge/conflict case)
        const targetExists = await cropCol.findOne({ name: expectedName });
        if (targetExists && targetExists._id.toString() !== existingCrop._id.toString()) {
          console.log(`  ℹ️   crop_master — target "${expectedName}" already exists; skipping rename of "${existingCrop.name}" (manual review needed)`);
          cropSkipped++;
        } else {
          await cropCol.updateOne(
            { _id: existingCrop._id },
            { $set: { name: expectedName, updatedAt: new Date() } },
          );
          console.log(`  ✏️   crop_master — renamed: "${existingCrop.name}" → "${expectedName}"`);
          processedCropNames.set(existingCrop.name, expectedName);
          cropUpdated++;
        }
      }
    }

    // ── 2. questions.details.normalised_crop ────────────────────────────────
    const result = await questionsCol.updateMany(
      { 'details.normalised_crop': regex },
      { $set: { 'details.normalised_crop': expectedName, updatedAt: new Date() } },
    );

    if (result.modifiedCount > 0) {
      console.log(`  📝  questions — updated ${result.modifiedCount} doc(s): normalised_crop "${name}" → "${expectedName}"`);
      questionsUpdated += result.modifiedCount;
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(60));
  console.log('📊  Summary');
  console.log('─'.repeat(60));
  console.log(`  crop_master updated : ${cropUpdated}`);
  console.log(`  crop_master skipped : ${cropSkipped}`);
  console.log(`  questions updated   : ${questionsUpdated}`);

  if (notInCropMaster.length > 0) {
    console.log(`\n❌  Crops NOT found in crop_master (${notInCropMaster.length}):`);
    notInCropMaster.forEach((name, i) => console.log(`  ${i + 1}. ${name}`));
  } else {
    console.log('\n✅  All crops were found in crop_master.');
  }

  await client.close();
  console.log('\n🎉  Done.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
