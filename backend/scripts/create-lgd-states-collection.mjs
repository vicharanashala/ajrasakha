#!/usr/bin/env node

/**
 * ============================================================================
 *  create-lgd-states-collection.mjs
 * ============================================================================
 *
 *  Standalone script — run directly from the backend folder:
 *
 *      node scripts/create-lgd-states-collection.mjs          # dry run (default)
 *      node scripts/create-lgd-states-collection.mjs --apply  # actually write
 *
 *  What it does:
 *    Fetches the LGD (Local Government Directory) states list from the same
 *    external data.gov.in API used by LocationService.getStates()
 *    (backend/src/modules/lgd/services/locationService.ts) and stores it in a
 *    new `states` MongoDB collection, so state lookups can be served from
 *    the database instead of calling the external API on every request.
 *
 *  Collection:
 *    • states — one document per state, synchronized on `stateCode`.
 *
 *  Safe to re-run: existing states are updated (matched on stateCode), never
 *  duplicated. A unique index on `stateCode` is created if missing.
 *
 *  Reads DB_URL / DB_NAME and the LGD_* env vars from backend/.env.
 * ============================================================================
 */
import 'dotenv/config';
import axios from 'axios';
import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APPLY = process.argv.includes('--apply');

const DB_URL = process.env.DB_URL;
const DB_NAME = process.env.DB_NAME || 'agriai';
if (!DB_URL) {
  console.error('❌ DB_URL is not set (put it in .env or pass it inline).');
  process.exit(1);
}

const LGD_API_KEY = process.env.LGD_API_KEY;
const LGD_STATES_API_URL = process.env.LGD_STATES_API_URL;
if (!LGD_API_KEY) {
  console.error('❌ LGD_API_KEY is not set.');
  process.exit(1);
}
if (!LGD_STATES_API_URL) {
  console.error('❌ LGD_STATES_API_URL is not set.');
  process.exit(1);
}

const COLLECTION_NAME = 'states';

/**
 * Fetches the raw state records from the LGD API.
 * Mirrors LocationService#fetchStates / #makeLGDRequest.
 */
async function fetchStatesFromApi() {
  const params = {
    'api-key': LGD_API_KEY,
    format: 'json',
    limit: 10000,
    offset: 0,
  };

  const response = await axios.get(LGD_STATES_API_URL, {
    params,
    timeout: 30000,
  });

  if (!response?.data?.records) {
    throw new Error('Invalid LGD API response: records missing');
  }

  return response.data.records;
}

function normalizeWhitespace(str) {
  if (!str) return '';
  return str.trim().replace(/\s+/g, ' ');
}

function normalizeForComparison(value) {
  return normalizeWhitespace(value).toLocaleLowerCase('en');
}

function parseStateName(rawName) {
  const normalizedRaw = normalizeWhitespace(rawName);
  
  const parenIndex = normalizedRaw.indexOf('(');
  if (parenIndex === -1) {
    return {
      name: normalizedRaw,
      aliases: [],
    };
  }
  
  const primaryName = normalizeWhitespace(normalizedRaw.substring(0, parenIndex));
  
  const closingParenIndex = normalizedRaw.indexOf(')', parenIndex);
  let aliasesStr = '';
  if (closingParenIndex !== -1) {
    aliasesStr = normalizedRaw.substring(parenIndex + 1, closingParenIndex);
  } else {
    aliasesStr = normalizedRaw.substring(parenIndex + 1);
  }
  
  const rawAliases = aliasesStr.split(',').map(a => normalizeWhitespace(a));
  
  const aliases = [];
  const seenNorm = new Set([normalizeForComparison(primaryName)]);
  
  for (const alias of rawAliases) {
    if (!alias) continue;
    const normAlias = normalizeForComparison(alias);
    if (!seenNorm.has(normAlias)) {
      aliases.push(alias);
      seenNorm.add(normAlias);
    }
  }
  
  return {
    name: primaryName,
    aliases,
  };
}

function areSetsEqual(arr1, arr2) {
  if (!arr1 || !arr2) return false;
  const set1 = new Set(arr1.map(normalizeForComparison));
  const set2 = new Set(arr2.map(normalizeForComparison));
  if (set1.size !== set2.size) return false;
  for (const a of set2) {
    if (!set1.has(a)) return false;
  }
  return true;
}

async function run() {
  let client;
  let db;
  let collection;
  
  client = new MongoClient(DB_URL);
  await client.connect();
  db = client.db(DB_NAME);
  collection = db.collection(COLLECTION_NAME);

  try {
    console.log(
      `\n🗄️  Database  : ${DB_NAME}` +
        `\n📦 Collection: ${COLLECTION_NAME}` +
        `\n🔧 Mode      : ${APPLY ? 'APPLY (will write)' : 'DRY RUN (no writes — pass --apply)'}\n`,
    );

    console.log('🌐 Fetching states from LGD API...');
    const records = await fetchStatesFromApi();
    
    const incomingStates = records.map(record => {
      const parsed = parseStateName(record.state_name_english);
      return {
        stateCode: Number(record.state_code),
        stateNameEnglish: parsed.name,
        aliases: parsed.aliases,
        stateNameLocal: normalizeWhitespace(record.state_name_local),
        dataLastUpdated: new Date(record.last_updated),
      };
    });

    console.log(`✅ Fetched ${incomingStates.length} state(s) from the LGD API.\n`);

    if (incomingStates.length === 0) {
      console.log('Nothing to write — the LGD API returned no states.');
      process.exit(0);
    }

    if (!APPLY) {
      console.log('Sample parsed state document:');
      const sample = incomingStates[0];
      console.log(JSON.stringify({
        stateCode: sample.stateCode,
        stateNameEnglish: sample.stateNameEnglish,
        aliases: sample.aliases,
        stateNameLocal: sample.stateNameLocal,
        dataLastUpdated: sample.dataLastUpdated,
      }, null, 2));
      console.log('\n🔍 DRY-RUN REPORT — no database changes were made\n');
    }

    if (APPLY) {
      await collection.createIndex({ stateCode: 1 }, { unique: true });
    }
    
    const existingStates = await collection.find({}).toArray();
    const existingStatesByCode = new Map(existingStates.map(s => [s.stateCode, s]));

    const report = {
      apiReceived: incomingStates.length,
      existingCount: existingStatesByCode.size,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      nameChanged: 0,
      aliasesChanged: 0,
      errors: 0,
      insertedList: [],
      updatedList: [],
      failedStates: []
    };

    const bulkOps = [];
    const now = new Date();

    for (const incoming of incomingStates) {
      try {
        const existing = existingStatesByCode.get(incoming.stateCode);

        if (!existing) {
          report.inserted++;
          report.insertedList.push({
            stateCode: incoming.stateCode,
            stateNameEnglish: incoming.stateNameEnglish,
            aliases: incoming.aliases,
            _id: 'N/A (New)'
          });

          if (APPLY) {
            bulkOps.push({
              insertOne: {
                document: {
                  stateCode: incoming.stateCode,
                  stateNameEnglish: incoming.stateNameEnglish,
                  aliases: incoming.aliases,
                  stateNameLocal: incoming.stateNameLocal,
                  dataLastUpdated: incoming.dataLastUpdated,
                  createdAt: now,
                  updatedAt: now,
                }
              }
            });
          }
          continue;
        }

        const existingName = existing.stateNameEnglish || '';
        const parsedExistingName = parseStateName(existingName);
        const existingPrimaryName = parsedExistingName.name;
        const parsedExistingAliases = parsedExistingName.aliases;
        const existingAliases = (existing.aliases || []).map(normalizeWhitespace).filter(Boolean);
        
        let canonicalNameChanged = false;
        let finalAliases = [];
        const finalAliasesSeen = new Set();
        
        const normIncomingName = normalizeForComparison(incoming.stateNameEnglish);
        finalAliasesSeen.add(normIncomingName);

        const normExistingName = normalizeForComparison(existingName);
        if (normExistingName !== normIncomingName) {
          canonicalNameChanged = true;
          
          const normExistingPrimaryName = normalizeForComparison(existingPrimaryName);
          if (existingPrimaryName && normExistingPrimaryName !== normIncomingName) {
            if (!finalAliasesSeen.has(normExistingPrimaryName)) {
              finalAliases.push(existingPrimaryName);
              finalAliasesSeen.add(normExistingPrimaryName);
            }
          }
        }
        
        for (const alias of parsedExistingAliases) {
          if (!alias) continue;
          const normAlias = normalizeForComparison(alias);
          if (!finalAliasesSeen.has(normAlias)) {
            finalAliases.push(alias);
            finalAliasesSeen.add(normAlias);
          }
        }
        
        for (const alias of existingAliases) {
          if (!alias) continue;
          const normAlias = normalizeForComparison(alias);
          if (!finalAliasesSeen.has(normAlias)) {
            finalAliases.push(alias);
            finalAliasesSeen.add(normAlias);
          }
        }
        
        for (const alias of incoming.aliases) {
          if (!alias) continue;
          const normAlias = normalizeForComparison(alias);
          if (!finalAliasesSeen.has(normAlias)) {
            finalAliases.push(alias);
            finalAliasesSeen.add(normAlias);
          }
        }
        
        let isChanged = false;
        const changes = [];
        
        if (canonicalNameChanged) {
          isChanged = true;
          changes.push('name');
          report.nameChanged++;
        }
        
        let aliasesToSave = finalAliases;
        const aliasesChanged = !areSetsEqual(existingAliases, finalAliases);
        
        if (aliasesChanged) {
          isChanged = true;
          changes.push('aliases');
          report.aliasesChanged++;
        } else {
          // Preserve existing order and case, but deduplicate and normalize whitespace
          aliasesToSave = [];
          const seen = new Set();
          for (const a of existingAliases) {
            const norm = normalizeForComparison(a);
            if (!seen.has(norm)) {
              aliasesToSave.push(a);
              seen.add(norm);
            }
          }
        }
        
        const localNameChanged = normalizeWhitespace(existing.stateNameLocal) !== incoming.stateNameLocal;
        if (localNameChanged) {
          isChanged = true;
          changes.push('stateNameLocal');
        }

        const existingDate = existing.dataLastUpdated ? new Date(existing.dataLastUpdated).getTime() : 0;
        const incomingDate = incoming.dataLastUpdated ? incoming.dataLastUpdated.getTime() : 0;
        
        if (existingDate !== incomingDate) {
          isChanged = true;
          changes.push('dataLastUpdated');
        }

        if (!isChanged) {
          report.unchanged++;
          continue;
        }

        report.updated++;
        
        const existingDateStr = existing.dataLastUpdated ? new Date(existing.dataLastUpdated).toISOString() : '';
        const incomingDateStr = incoming.dataLastUpdated ? incoming.dataLastUpdated.toISOString() : '';

        if (changes.length > 0) {
          report.updatedList.push({
            stateCode: incoming.stateCode,
            _id: existing._id,
            previousName: existingName,
            newName: incoming.stateNameEnglish,
            previousAliases: existing.aliases || [],
            newAliases: aliasesToSave,
            previousLocalName: existing.stateNameLocal || '',
            newLocalName: incoming.stateNameLocal || '',
            previousLastUpdated: existingDateStr,
            newLastUpdated: incomingDateStr,
            changes
          });
        }

        if (APPLY) {
          bulkOps.push({
            updateOne: {
              filter: { stateCode: incoming.stateCode },
              update: {
                $set: {
                  stateCode: incoming.stateCode,
                  stateNameEnglish: incoming.stateNameEnglish,
                  aliases: aliasesToSave,
                  stateNameLocal: incoming.stateNameLocal,
                  dataLastUpdated: incoming.dataLastUpdated,
                  updatedAt: now,
                }
              }
            }
          });
        }
      } catch (err) {
        report.errors++;
        report.failedStates.push({
          stateCode: incoming.stateCode,
          _id: existingStatesByCode.get(incoming.stateCode)?._id || 'N/A',
          error: err.message || err.toString()
        });
        console.error(`Error processing stateCode ${incoming.stateCode}:`, err);
      }
    }

    if (APPLY) {
      if (bulkOps.length > 0) {
        const result = await collection.bulkWrite(bulkOps);
        console.log(
          `✅ MongoDB BulkWrite Result: ${result.insertedCount} inserted, ${result.modifiedCount} updated ` +
            `(${result.matchedCount} matched).`,
        );
      } else {
        console.log('✅ MongoDB BulkWrite Result: 0 inserted, 0 updated.');
      }
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportDir = path.join(__dirname, '..', 'logs', 'lgd_api_report');
    fs.mkdirSync(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, `lgd-states-sync-report-${timestamp}.txt`);

    let reportText = '';
    
    if (APPLY) {
      reportText += '✅ APPLY REPORT\n\nThe synchronization completed successfully\nand the database changes were applied.\n\n';
    } else {
      reportText += '🔍 DRY-RUN REPORT\n\nThe following changes were detected,\nbut no database changes were made.\n\n';
    }

    reportText += '📊 LGD State Synchronization Report\n\n';
    reportText += `API states received: ${report.apiReceived}\n`;
    reportText += `Existing database states: ${report.existingCount}\n\n`;
    reportText += `New states: ${report.inserted}\n`;
    reportText += `Updated states: ${report.updated}\n`;
    reportText += `Unchanged states: ${report.unchanged}\n\n`;
    reportText += `Canonical name changes: ${report.nameChanged}\n`;
    reportText += `Alias changes: ${report.aliasesChanged}\n`;
    reportText += `Processing errors: ${report.errors}\n\n`;

    if (report.insertedList.length > 0) {
      reportText += '✨ New states:\n\n';
      for (const change of report.insertedList) {
        reportText += `• State code ${change.stateCode}\n`;
        reportText += `  Action: Inserted\n`;
        reportText += `  MongoDB _id: ${change._id}\n`;
        reportText += `  Changed fields: N/A\n`;
        reportText += `  Name: ${change.stateNameEnglish}\n`;
        if (change.aliases && change.aliases.length > 0) {
          reportText += `  Aliases: [${change.aliases.join(', ')}]\n`;
        }
        reportText += '\n';
      }
    }

    if (report.updatedList.length > 0) {
      reportText += '📝 Changed states:\n\n';
      for (const change of report.updatedList) {
        reportText += `• State code ${change.stateCode}\n`;
        reportText += `  Action: Updated\n`;
        reportText += `  MongoDB _id: ${change._id}\n`;
        reportText += `  Changed fields: ${change.changes.join(', ')}\n`;
        if (change.changes.includes('name')) {
          reportText += `  Name: ${change.previousName} → ${change.newName}\n`;
        }
        if (change.changes.includes('aliases')) {
          const prev = `[${(change.previousAliases || []).join(', ')}]`;
          const curr = `[${(change.newAliases || []).join(', ')}]`;
          reportText += `  Aliases: ${prev} → ${curr}\n`;
        }
        if (change.changes.includes('stateNameLocal')) {
          reportText += `  Local name: ${change.previousLocalName || ''} → ${change.newLocalName || ''}\n`;
        }
        if (change.changes.includes('dataLastUpdated')) {
          reportText += `  LGD last updated:\n  ${change.previousLastUpdated || ''} → ${change.newLastUpdated || ''}\n`;
        }
        reportText += '\n';
      }
    }

    if (report.failedStates.length > 0) {
      reportText += '❌ Failed states:\n\n';
      for (const failed of report.failedStates) {
        reportText += `• State code ${failed.stateCode}\n`;
        reportText += `  Action: Error\n`;
        reportText += `  MongoDB _id: ${failed._id || 'N/A'}\n`;
        reportText += `  Changed fields: N/A\n`;
        reportText += `  Error: ${failed.error}\n\n`;
      }
    }

    fs.writeFileSync(reportPath, reportText);
    console.log(reportText);
    console.log(`📄 Report successfully saved to: ${reportPath}\n`);
    
    if (!APPLY) {
      console.log('   Re-run with --apply to write the changes.');
    }

    console.log('\n🎉 Done.');
  } catch (error) {
    console.error('❌ Failed to create/populate states collection:', error?.message || error);
    process.exitCode = 1;
  } finally {
    if (client) {
      await client.close();
    }
  }
}

run();
