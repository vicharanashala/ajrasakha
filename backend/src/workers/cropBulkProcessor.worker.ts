import { parentPort, workerData } from 'worker_threads';
import 'reflect-metadata';
import { Container } from 'inversify';
import { MongoDatabase } from '#root/shared/index.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { ICropAlias } from '#root/shared/interfaces/models.js';

interface WorkerData {
  rows: any[];
  userId: string;
  mongoUri: string;
  dbName: string;
}

if (!parentPort) {
  process.exit(1);
}

const { rows, userId, mongoUri, dbName } = workerData as WorkerData;

const container = new Container({ defaultScope: 'Singleton' });
container.bind<string>(GLOBAL_TYPES.uri).toConstantValue(mongoUri);
container.bind<string>(GLOBAL_TYPES.dbName).toConstantValue(dbName);
container.bind<MongoDatabase>(GLOBAL_TYPES.Database).to(MongoDatabase).inSingletonScope();

const database = container.get<MongoDatabase>(GLOBAL_TYPES.Database);
await database.init();

const { CropRepository } = await import(
  '#root/shared/database/providers/mongo/repositories/CropRepository.js'
);
const cropRepo = new CropRepository(database);

/**
 * Case-insensitive field lookup — handles header casing inconsistencies in CSV.
 */
function getField(row: any, ...keys: string[]): string {
  for (const key of keys) {
    const found = Object.keys(row).find(
      k => k.trim().toLowerCase() === key.toLowerCase(),
    );
    if (found !== undefined) return (row[found] ?? '').toString().trim();
  }
  return '';
}

/**
 * Crop names must be plain words — only letters and spaces (e.g. "Wheat", "Wheat Crop").
 * Any symbol or digit ( , / ( ) - 2 @ # … ) makes the name invalid, so it is skipped.
 */
function hasSpecialChar(name: string): boolean {
  return /[^A-Za-z ]/.test(name);
}

// ── Alias merge helpers: one alias per (language, region); its english / native holds
//    the name(s). Merging appends new names to the matching (language, region) alias
//    instead of adding a duplicate row, and never repeats a name already present. ────
const aliasKey = (a: ICropAlias): string =>
  `${(a.language ?? '').trim().toLowerCase()}||${(a.region ?? '').trim().toLowerCase()}`;

const nameList = (s?: string): string[] =>
  (s ?? '').split(/[,/]/).map(x => x.trim()).filter(Boolean);

const mergeNames = (a?: string, b?: string): string => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const n of [...nameList(a), ...nameList(b)]) {
    const k = n.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(n);
    }
  }
  return out.join(', ');
};

const mergeAliasInto = (list: ICropAlias[], inc: ICropAlias): void => {
  const found = list.find(a => aliasKey(a) === aliasKey(inc));
  if (found) {
    // Same (language, region) → update it: add any new english/native names, skip existing.
    found.english_representation = mergeNames(found.english_representation, inc.english_representation);
    found.native_representation = mergeNames(found.native_representation, inc.native_representation);
  } else {
    list.push({ ...inc });
  }
};

// ── Group CSV rows by crop name (case-insensitive) ──────────────────────────

const cropMap = new Map<string, { name: string; aliases: ICropAlias[] }>();

for (const row of rows) {
  const name = getField(row, 'crop name', 'cropname', 'crop_name');
  if (!name) continue;

  const key = name.toLowerCase();
  if (!cropMap.has(key)) {
    cropMap.set(key, { name, aliases: [] });
  }

  const group = cropMap.get(key)!;

  const language = getField(row, 'language');
  const region = getField(row, 'region');
  const englishRepr = getField(row, 'english name', 'english_name', 'englishname').toLowerCase();
  const nativeRepr = getField(row, 'native name', 'native_name', 'nativename');

  // Skip rows with no english representation, or if it duplicates the crop name itself
  if (!englishRepr || englishRepr === name.toLowerCase()) continue;

  const alias: ICropAlias = {
    language,
    region,
    english_representation: englishRepr,
    native_representation: nativeRepr,
  };

  // Merge by (language, region): same slot → append new name(s); new slot → add alias.
  mergeAliasInto(group.aliases, alias);
}

// ── Process each unique crop ─────────────────────────────────────────────────

let created = 0;
let updated = 0;
const errors: string[] = [];
// Per-entry outcome for the downloadable results report.
const results: { name: string; status: string; reason: string }[] = [];

for (const [, group] of cropMap) {
  // Skip names with special characters — don't add them.
  if (hasSpecialChar(group.name)) {
    const reason = 'Name contains special characters';
    errors.push(`${group.name}: skipped — ${reason.toLowerCase()}`);
    results.push({ name: group.name, status: 'skipped', reason });
    parentPort!.postMessage({ processed: 1 });
    continue;
  }
  try {
    const existing = await cropRepo.findByNameOrAlias(group.name);

    if (existing) {
      // Merge new aliases into existing by (language, region): update the matching alias
      // (append new names, skip ones already present) rather than adding a duplicate row.
      const merged = (existing.aliases ?? [])
        .filter((a): a is ICropAlias => typeof a !== 'string')
        .map(a => ({ ...a }));

      for (const newAlias of group.aliases) {
        mergeAliasInto(merged, newAlias);
      }

      await cropRepo.updateCrop(existing._id!.toString(), { aliases: merged, type: 'crop' }, userId);
      updated++;
      results.push({ name: group.name, status: 'updated', reason: 'Merged aliases into existing crop' });
    } else {
      await cropRepo.createCrop(group.name, userId, group.aliases, 'crop');
      created++;
      results.push({ name: group.name, status: 'created', reason: '' });
    }

    parentPort!.postMessage({ processed: 1 });
  } catch (err: any) {
    errors.push(`${group.name}: ${err.message}`);
    results.push({ name: group.name, status: 'failed', reason: err.message });
    parentPort!.postMessage({ processed: 1, error: err.message });
  }
}

parentPort!.postMessage({ success: true, created, updated, errors, results });
// Let the final message flush to the parent before terminating (an immediate
// process.exit races message delivery, dropping the created/updated/results payload).
setTimeout(() => process.exit(0), 100);
