#!/usr/bin/env node

/**
 * ============================================================================
 *  create-lgd-districts-collection.mjs
 * ============================================================================
 *
 *  Standalone script — run directly from the backend folder:
 *
 *      node scripts/create-lgd-districts-collection.mjs          # dry run (default)
 *      node scripts/create-lgd-districts-collection.mjs --apply  # actually write
 *
 *  What it does:
 *    Fetches the LGD (Local Government Directory) districts list from the
 *    same external data.gov.in API used by LocationService.getDistricts()
 *    (backend/src/modules/lgd/services/locationService.ts) and stores it in a
 *    new `districts` MongoDB collection, so district lookups can be served
 *    from the database instead of calling the external API on every request.
 *
 *    The districts API only returns results for one state at a time (same as
 *    LocationService, which requires a stateCode), so this script first
 *    fetches the state list and then fetches districts state-by-state.
 *
 *  Collection:
 *    • districts — one document per district, synchronized on `districtCode`.
 *
 *  Safe to re-run: existing districts are updated (matched on districtCode),
 *  never duplicated. A unique index on `districtCode` is created if missing.
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
const LGD_DISTRICTS_API_URL = process.env.LGD_DISTRICTS_API_URL;
if (!LGD_API_KEY) {
  console.error('❌ LGD_API_KEY is not set.');
  process.exit(1);
}
if (!LGD_STATES_API_URL) {
  console.error('❌ LGD_STATES_API_URL is not set.');
  process.exit(1);
}
if (!LGD_DISTRICTS_API_URL) {
  console.error('❌ LGD_DISTRICTS_API_URL is not set.');
  process.exit(1);
}

const COLLECTION_NAME = 'districts';
// Small pause between per-state requests to be gentle on the external API.
const REQUEST_DELAY_MS = 200;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Shared request helper — mirrors LocationService#makeLGDRequest.
 */
async function makeLgdRequest(apiUrl, filters) {
  const params = {
    'api-key': LGD_API_KEY,
    format: 'json',
    limit: 10000,
    offset: 0,
  };

  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      params[`filters[${key}]`] = value;
    }
  }

  const response = await axios.get(apiUrl, { params, timeout: 30000 });

  if (!response?.data?.records) {
    throw new Error('Invalid LGD API response: records missing');
  }

  return response.data.records;
}

/** Mirrors LocationService#fetchStates / #getStates. */
async function fetchStates() {
  const records = await makeLgdRequest(LGD_STATES_API_URL);
  return records.map(record => ({
    stateCode: Number(record.state_code),
    stateNameEnglish: record.state_name_english,
  }));
}

/** Mirrors LocationService#fetchDistricts / #getDistricts. */
async function fetchDistrictsForState(stateCode) {
  const records = await makeLgdRequest(LGD_DISTRICTS_API_URL, { state_code: stateCode });
  return records.map(record => ({
    districtCode: Number(record.district_code),
    districtNameEnglish: record.district_name_english,
    stateCode: Number(record.state_code),
    districtNameLocal: record.district_name_local,
  }));
}

function normalizeWhitespace(str) {
  if (!str) return '';
  return str.trim().replace(/\s+/g, ' ');
}

function normalizeForComparison(value) {
  return normalizeWhitespace(value).toLocaleLowerCase('en');
}

function parseDistrictName(rawName) {
  const normalizedRaw = normalizeWhitespace(rawName);
  
  const parenIndex = normalizedRaw.indexOf('(');
  if (parenIndex === -1) {
    return {
      districtNameEnglish: normalizedRaw,
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
    districtNameEnglish: primaryName,
    aliases,
  };
}

function areAliasSetsEqual(arr1, arr2) {
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
    const states = await fetchStates();
    console.log(`✅ Fetched ${states.length} state(s).\n`);

    console.log('🌐 Fetching districts per state from LGD API...');
    const rawDistricts = [];
    const failedStates = [];

    for (const [index, state] of states.entries()) {
      try {
        const stateDistricts = await fetchDistrictsForState(state.stateCode);
        rawDistricts.push(...stateDistricts);
        console.log(
          `   [${index + 1}/${states.length}] ${state.stateNameEnglish} (${state.stateCode}): ${stateDistricts.length} district(s)`,
        );
      } catch (error) {
        failedStates.push({
          stateCode: state.stateCode,
          stateNameEnglish: state.stateNameEnglish,
          message: error?.message || error
        });
        console.warn(
          `   ⚠️  [${index + 1}/${states.length}] ${state.stateNameEnglish} (${state.stateCode}) failed: ${error?.message || error}`,
        );
      }

      if (index < states.length - 1) {
        await sleep(REQUEST_DELAY_MS);
      }
    }

    console.log(`\n✅ Fetched ${rawDistricts.length} district(s) across ${states.length - failedStates.length}/${states.length} state(s).`);
    if (failedStates.length > 0) {
      console.warn(
        `⚠️  Skipped ${failedStates.length} state(s) due to errors: ${failedStates.map(s => s.stateNameEnglish).join(', ')}`,
      );
    }
    console.log('');

    if (rawDistricts.length === 0) {
      console.log('Nothing to write — no districts were fetched.');
      process.exit(0);
    }

    const report = {
      statesReceived: states.length,
      statesSuccess: states.length - failedStates.length,
      stateFailures: failedStates.length,
      apiReceived: rawDistricts.length,
      existingCount: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      nameChanged: 0,
      aliasesChanged: 0,
      stateCodeChanged: 0,
      localNameChanged: 0,
      errors: 0,
      duplicates: 0,
      insertedList: [],
      updatedList: [],
      failedDistricts: [],
      failedStates: failedStates
    };

    const districtCodeSeen = new Set();
    const duplicateCodes = new Set();
    const validIncomingDistricts = [];

    for (const record of rawDistricts) {
      const dCode = record.districtCode;
      
      if (dCode === null || dCode === undefined || isNaN(dCode) || !Number.isFinite(dCode)) {
        report.errors++;
        report.failedDistricts.push({
          districtCode: record.districtCode, 
          action: 'Skipped',
          _id: 'N/A',
          message: 'Invalid districtCode'
        });
        continue;
      }

      if (districtCodeSeen.has(dCode)) {
        report.duplicates++;
        duplicateCodes.add(dCode);
        report.failedDistricts.push({
          districtCode: dCode,
          action: 'Skipped',
          _id: 'N/A',
          message: 'Duplicate districtCode in API response'
        });
        continue;
      }
      districtCodeSeen.add(dCode);
      
      const sCode = record.stateCode;
      if (sCode === null || sCode === undefined || isNaN(sCode) || !Number.isFinite(sCode)) {
        report.errors++;
        report.failedDistricts.push({
          districtCode: dCode,
          action: 'Skipped',
          _id: 'N/A',
          message: 'Invalid stateCode'
        });
        continue;
      }
      
      const parsed = parseDistrictName(record.districtNameEnglish);
      if (!parsed.districtNameEnglish) {
        report.errors++;
        report.failedDistricts.push({
          districtCode: dCode,
          action: 'Skipped',
          _id: 'N/A',
          message: 'Parsed canonical district name is empty'
        });
        continue;
      }

      validIncomingDistricts.push({
        districtCode: dCode,
        stateCode: sCode,
        districtNameEnglish: parsed.districtNameEnglish,
        aliases: parsed.aliases,
        districtNameLocal: normalizeWhitespace(record.districtNameLocal),
      });
    }

    if (!APPLY) {
      console.log('Sample parsed district document:');
      const sample = validIncomingDistricts[0];
      if (sample) {
        console.log(JSON.stringify({
          districtCode: sample.districtCode,
          districtNameEnglish: sample.districtNameEnglish,
          aliases: sample.aliases,
          stateCode: sample.stateCode,
          districtNameLocal: sample.districtNameLocal,
        }, null, 2));
      }
      console.log('\n🔍 DRY-RUN REPORT — no database changes were made\n');
    }

    if (APPLY) {
      await collection.createIndex({ districtCode: 1 }, { unique: true });
    }
    
    const existingDistricts = await collection.find({}).toArray();
    const existingDistrictsByCode = new Map(existingDistricts.map(d => [d.districtCode, d]));
    report.existingCount = existingDistrictsByCode.size;

    const bulkOps = [];
    const now = new Date();

    for (const incoming of validIncomingDistricts) {
      try {
        const existing = existingDistrictsByCode.get(incoming.districtCode);

        if (!existing) {
          report.inserted++;
          report.insertedList.push({
            districtCode: incoming.districtCode,
            districtNameEnglish: incoming.districtNameEnglish,
            aliases: incoming.aliases,
            stateCode: incoming.stateCode,
            districtNameLocal: incoming.districtNameLocal,
            _id: 'N/A (New)'
          });

          if (APPLY) {
            bulkOps.push({
              insertOne: {
                document: {
                  districtCode: incoming.districtCode,
                  districtNameEnglish: incoming.districtNameEnglish,
                  aliases: incoming.aliases,
                  stateCode: incoming.stateCode,
                  districtNameLocal: incoming.districtNameLocal,
                  createdAt: now,
                  updatedAt: now,
                }
              }
            });
          }
          continue;
        }

        const existingName = existing.districtNameEnglish || '';
        const parsedExistingName = parseDistrictName(existingName);
        const existingPrimaryName = parsedExistingName.districtNameEnglish;
        const parsedExistingAliases = parsedExistingName.aliases;
        const existingAliases = (existing.aliases || []).map(normalizeWhitespace).filter(Boolean);
        
        let canonicalNameChanged = false;
        let finalAliases = [];
        const finalAliasesSeen = new Set();
        
        const normIncomingName = normalizeForComparison(incoming.districtNameEnglish);
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
        const aliasesChanged = !areAliasSetsEqual(existingAliases, finalAliases);
        
        if (aliasesChanged) {
          isChanged = true;
          changes.push('aliases');
          report.aliasesChanged++;
        } else {
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
        
        const localNameChanged = normalizeWhitespace(existing.districtNameLocal) !== incoming.districtNameLocal;
        if (localNameChanged) {
          isChanged = true;
          changes.push('districtNameLocal');
          report.localNameChanged++;
        }

        const stateCodeChanged = existing.stateCode !== incoming.stateCode;
        if (stateCodeChanged) {
           isChanged = true;
           changes.push('stateCode');
           report.stateCodeChanged++;
        }

        if (!isChanged) {
          report.unchanged++;
          continue;
        }

        report.updated++;
        
        report.updatedList.push({
          districtCode: incoming.districtCode,
          _id: existing._id,
          previousName: existingName,
          newName: incoming.districtNameEnglish,
          previousAliases: existing.aliases || [],
          newAliases: aliasesToSave,
          previousStateCode: existing.stateCode,
          newStateCode: incoming.stateCode,
          previousLocalName: existing.districtNameLocal || '',
          newLocalName: incoming.districtNameLocal || '',
          changes
        });

        if (APPLY) {
          bulkOps.push({
            updateOne: {
              filter: { districtCode: incoming.districtCode },
              update: {
                $set: {
                  districtCode: incoming.districtCode,
                  districtNameEnglish: incoming.districtNameEnglish,
                  aliases: aliasesToSave,
                  stateCode: incoming.stateCode,
                  districtNameLocal: incoming.districtNameLocal,
                  updatedAt: now,
                }
              }
            }
          });
        }
      } catch (err) {
        report.errors++;
        report.failedDistricts.push({
          districtCode: incoming.districtCode,
          action: 'Error',
          _id: existingDistrictsByCode.get(incoming.districtCode)?._id || 'N/A',
          message: err.message || err.toString()
        });
        console.error(`Error processing districtCode ${incoming.districtCode}:`, err);
      }
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportDir = path.join(__dirname, '..', 'logs', 'lgd_api_report');
    fs.mkdirSync(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, `lgd-districts-sync-report-${timestamp}.txt`);

    let reportText = '';

    if (APPLY) {
      reportText += '📋 PLANNED APPLY SYNCHRONIZATION\n\nDatabase changes have not yet been confirmed.\n\n';
    } else {
      reportText += '🔍 DRY-RUN REPORT\n\nThe following changes were detected,\nbut no database changes were made.\n\n';
    }

    reportText += '📊 LGD District Synchronization Report\n\n';
    reportText += `States received: ${report.statesReceived}\n`;
    reportText += `States fetched successfully: ${report.statesSuccess}\n`;
    reportText += `State fetch failures: ${report.stateFailures}\n\n`;
    reportText += `Districts received from API: ${report.apiReceived}\n`;
    reportText += `Existing database districts: ${report.existingCount}\n\n`;
    reportText += `New districts: ${report.inserted}\n`;
    reportText += `Updated districts: ${report.updated}\n`;
    reportText += `Unchanged districts: ${report.unchanged}\n\n`;
    reportText += `Canonical name changes: ${report.nameChanged}\n`;
    reportText += `Alias changes: ${report.aliasesChanged}\n`;
    reportText += `State relationship changes: ${report.stateCodeChanged}\n`;
    reportText += `Local-name changes: ${report.localNameChanged}\n\n`;
    reportText += `Processing errors: ${report.errors}\n`;
    reportText += `Duplicate district codes: ${report.duplicates}\n\n`;

    if (report.insertedList.length > 0 || report.updatedList.length > 0 || report.failedDistricts.length > 0 || report.failedStates.length > 0) {
      reportText += '📝 Synchronization details:\n\n';
    }

    if (report.insertedList.length > 0) {
      reportText += '➕ Inserted districts:\n\n';
      for (const change of report.insertedList) {
        reportText += `• District code ${change.districtCode}\n`;
        reportText += `  Action: Inserted\n`;
        reportText += `  MongoDB _id: ${change._id}\n`;
        reportText += `  Changed fields: N/A\n`;
        reportText += `  Name: ${change.districtNameEnglish}\n`;
        if (change.aliases && change.aliases.length > 0) {
          reportText += `  Aliases: [${change.aliases.join(', ')}]\n`;
        }
        reportText += `  State code: ${change.stateCode}\n\n`;
      }
    }

    if (report.updatedList.length > 0) {
      reportText += '📝 Updated districts:\n\n';
      for (const change of report.updatedList) {
        reportText += `• District code ${change.districtCode}\n`;
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
        if (change.changes.includes('stateCode')) {
          reportText += `  State code: ${change.previousStateCode} → ${change.newStateCode}\n`;
        }
        if (change.changes.includes('districtNameLocal')) {
          reportText += `  Local name: ${change.previousLocalName || ''} → ${change.newLocalName || ''}\n`;
        }
        reportText += '\n';
      }
    }

    if (report.failedDistricts.length > 0) {
      reportText += '❌ Processing errors:\n\n';
      for (const err of report.failedDistricts) {
        reportText += `• District code ${err.districtCode}\n`;
        reportText += `  Action: ${err.action || 'Error'}\n`;
        reportText += `  MongoDB _id: ${err._id || 'N/A'}\n`;
        reportText += `  Changed fields: N/A\n`;
        reportText += `  Error: ${err.message}\n\n`;
      }
    }
    
    if (report.failedStates.length > 0) {
      reportText += '❌ State fetch failures:\n\n';
      for (const state of report.failedStates) {
         reportText += `• State code ${state.stateCode} (${state.stateNameEnglish})\n  Error: ${state.message}\n\n`;
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
      
      const successText = '✅ APPLY REPORT\n\nThe synchronization completed successfully\nand the database changes were applied.\n\n';
      const finalReportText = reportText.replace('📋 PLANNED APPLY SYNCHRONIZATION\n\nDatabase changes have not yet been confirmed.\n\n', successText);
      fs.writeFileSync(reportPath, finalReportText);
      console.log(finalReportText);
      console.log(`📄 Report successfully saved to: ${reportPath}\n`);
    } else {
      fs.writeFileSync(reportPath, reportText);
      console.log(reportText);
      console.log(`📄 Report successfully saved to: ${reportPath}\n`);
      console.log('   Re-run with --apply to write the changes.');
    }

    console.log('\n🎉 Done.');
  } catch (error) {
    console.error('❌ Failed to create/populate districts collection:', error?.message || error);
    process.exitCode = 1;
  } finally {
    if (client) {
      await client.close();
    }
  }
}

run();
