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

  // Deduplicate aliases within the group
  const isDup = group.aliases.some(
    a =>
      a.language.toLowerCase() === alias.language.toLowerCase() &&
      a.english_representation === alias.english_representation &&
      a.native_representation === alias.native_representation,
  );
  if (!isDup) group.aliases.push(alias);
}

// ── Process each unique crop ─────────────────────────────────────────────────

let created = 0;
let updated = 0;
const errors: string[] = [];

for (const [, group] of cropMap) {
  try {
    const existing = await cropRepo.findByNameOrAlias(group.name);

    if (existing) {
      // Merge new aliases into existing ones, deduplicating
      const existingAliases = (existing.aliases ?? []).filter(
        (a): a is ICropAlias => typeof a !== 'string',
      );
      const merged = [...existingAliases];

      for (const newAlias of group.aliases) {
        const isDup = merged.some(
          a =>
            a.language.toLowerCase() === newAlias.language.toLowerCase() &&
            a.english_representation === newAlias.english_representation &&
            a.native_representation === newAlias.native_representation,
        );
        if (!isDup) merged.push(newAlias);
      }

      await cropRepo.updateCrop(existing._id!.toString(), { aliases: merged, type: 'crop' }, userId);
      updated++;
    } else {
      await cropRepo.createCrop(group.name, userId, group.aliases, 'crop');
      created++;
    }

    parentPort!.postMessage({ processed: 1 });
  } catch (err: any) {
    errors.push(`${group.name}: ${err.message}`);
    parentPort!.postMessage({ processed: 1, error: err.message });
  }
}

parentPort!.postMessage({ success: true, created, updated, errors });
process.exit(0);
