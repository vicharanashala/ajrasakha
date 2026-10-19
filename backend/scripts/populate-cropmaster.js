import { MongoClient } from 'mongodb';
import xlsx from 'xlsx';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONGO_URI = process.env.DB_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'agriai';
const COLLECTION_NAME = 'crop_master';
const EXCEL_FILE_PATH = path.join(__dirname, 'Vernacular Taxonomy of Indian Agriculture.xlsx');
const SHEET_NAME = 'Master';

const cleanStr = (val) => (val !== undefined && val !== null ? String(val).trim() : '');
const toLower = (val) => cleanStr(val).toLowerCase();

/**
 * Finds if an incoming alias matches an existing structured object alias.
 * Completely ignores primitive string entries in the existingAliases array.
 */
function findMatchingAlias(existingAliases, incomingAlias) {
  if (!Array.isArray(existingAliases)) return { match: null, index: -1 };

  const incLang = toLower(incomingAlias.language);
  const incRegion = toLower(incomingAlias.region);
  const incEng = toLower(incomingAlias.english_representation);
  const incNat = toLower(incomingAlias.native_representation);

  for (let i = 0; i < existingAliases.length; i++) {
    const alias = existingAliases[i];

    // Ignore plain string entries completely
    if (typeof alias === 'string' || !alias || typeof alias !== 'object') {
      continue;
    }

    const exLang = toLower(alias.language);
    const exRegion = toLower(alias.region);
    const exEng = toLower(alias.english_representation);
    const exNat = toLower(alias.native_representation);

    if (
      exLang === incLang &&
      exRegion === incRegion &&
      exEng === incEng &&
      exNat === incNat
    ) {
      return { match: alias, index: i };
    }
  }

  return { match: null, index: -1 };
}

async function run() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    const workbook = xlsx.readFile(EXCEL_FILE_PATH);
    const sheet = workbook.Sheets[SHEET_NAME] || workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

    console.log(`Using collection: ${COLLECTION_NAME} in database: ${db.databaseName}`);
    console.log(`Found ${rows.length} rows in sheet "${SHEET_NAME || workbook.SheetNames[0]}"`);

    let createdCropsCount = 0;
    let appendedAliasesCount = 0;
    let updatedAliasesCount = 0;
    let skippedAliasesCount = 0;
    let invalidRowsCount = 0;

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const rowNum = index + 2;

      const category = cleanStr(row['Category']);
      const stdName = cleanStr(row['Standardized Category Name']);
      const scientificName = cleanStr(row['Scientific Name/Botanical Name']);
      const state = cleanStr(row['State']);
      const language = cleanStr(row['Language']);
      const nativeEng = cleanStr(row['Native Name in English Scripter']);
      const nativeNative = cleanStr(row['Native Name in Native Scripter']);
      const sourceLink = cleanStr(row['Source Link']);
      const pageNo = cleanStr(row['Page No.']);

      if (!stdName || !category) {
        console.warn(`[Row ${rowNum}] Skipped: Missing "Standardized Category Name" or "Category".`);
        invalidRowsCount++;
        continue;
      }

      const incomingType = toLower(category);

      const newAlias = {
        language: language,
        region: state,
        english_representation: nativeEng,
        native_representation: nativeNative,
        ...(sourceLink && { source_link: sourceLink }),
        ...(pageNo && { page_number: pageNo }),
      };

      // Query by name to respect unique index name_1
      const existingDoc = await collection.findOne({
        name: { $regex: `^${stdName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
      });

      if (!existingDoc) {
        // Document does not exist: create document with original type (e.g., 'flower', 'crop')
        const hasAliasData = nativeEng || nativeNative;
        const newDoc = {
          name: stdName,
          type: incomingType,
          scientificName: scientificName || null,
          aliases: hasAliasData ? [newAlias] : [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await collection.insertOne(newDoc);
        createdCropsCount++;
      } else {
        // Document exists: compare only with structured ICropAlias items
        const { match: matchedAlias, index: matchedIndex } = findMatchingAlias(existingDoc.aliases, newAlias);

        if (!matchedAlias) {
          // No structured alias matched -> push new structured alias
          await collection.updateOne(
            { _id: existingDoc._id },
            {
              $push: { aliases: newAlias },$set: {
                updatedAt: new Date(),
                ...(scientificName && !existingDoc.scientificName ? { scientificName } : {}),
              },
            }
          );
          appendedAliasesCount++;
        } else {
          // Structured alias exists -> enrich empty fields if present in Excel
          const updates = {};

          if (sourceLink && (!matchedAlias.source_link || matchedAlias.source_link.trim() === '')) {
            updates[`aliases.${matchedIndex}.source_link`] = sourceLink;
          }

          if (pageNo && (!matchedAlias.page_number || String(matchedAlias.page_number).trim() === '')) {
            updates[`aliases.${matchedIndex}.page_number`] = pageNo;
          }

          if (scientificName && !existingDoc.scientificName) {
            updates.scientificName = scientificName;
          }

          if (Object.keys(updates).length > 0) {
            updates.updatedAt = new Date();
            await collection.updateOne({ _id: existingDoc._id }, { $set: updates });
            console.log(`[Row ${rowNum}] Enriched alias metadata for "${existingDoc.name}" (${existingDoc.type})`);
            updatedAliasesCount++;
          } else {
            console.log(
              `[Row ${rowNum}] Skipped identical alias for "${existingDoc.name}" (${existingDoc.type}): "${nativeEng} / ${nativeNative}"`
            );
            skippedAliasesCount++;
          }
        }
      }
    }

    console.log('\n================ Execution Summary ================');
    console.log(`New crop documents inserted : ${createdCropsCount}`);
    console.log(`New aliases appended        : ${appendedAliasesCount}`);
    console.log(`Existing aliases enriched   : ${updatedAliasesCount}`);
    console.log(`Duplicate aliases skipped   : ${skippedAliasesCount}`);
    console.log(`Invalid rows skipped        : ${invalidRowsCount}`);
    console.log('====================================================\n');
  } catch (error) {
    console.error('Error during data import:', error);
  } finally {
    await client.close();
    console.log('Database connection closed.');
  }
}

run();