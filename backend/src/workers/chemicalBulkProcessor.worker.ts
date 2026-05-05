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

// ── Group CSV rows by chemical name (input_chemical, case-insensitive) ────────

interface ChemicalGroup {
  name: string;
  status: string;
  aliases: ICropAlias[];
}

const chemicalMap = new Map<string, ChemicalGroup>();

for (const row of rows) {
  const name = getField(row, 'input_chemical', 'inputchemical', 'input chemical');
  if (!name) continue;

  const key = name.toLowerCase();
  const alias = getField(row, 'alias', 'aliases');
  const status = getField(row, 'status');

  if (!chemicalMap.has(key)) {
    chemicalMap.set(key, {
      name,
      status, // take status from first row for this chemical
      aliases: [],
    });
  }

  const group = chemicalMap.get(key)!;

  // Skip rows with no alias value
  if (!alias) continue;

  const aliasEntry: ICropAlias = {
    language: '',
    region: '',
    english_representation: alias.toLowerCase(),
    native_representation: '',
  };

  // Deduplicate aliases within the group
  const isDup = group.aliases.some(
    a => a.english_representation === aliasEntry.english_representation,
  );
  if (!isDup) group.aliases.push(aliasEntry);
}

// ── Process each unique chemical ─────────────────────────────────────────────

let created = 0;
let updated = 0;
const errors: string[] = [];

for (const [, group] of chemicalMap) {
  try {
    const existing = await cropRepo.findChemicalByNameOrAlias(group.name);

    if (existing) {
      // Merge aliases, deduplicating by english_representation
      const existingAliases = (existing.aliases ?? []).filter(
        (a): a is ICropAlias => typeof a !== 'string',
      );
      const merged = [...existingAliases];

      for (const newAlias of group.aliases) {
        const isDup = merged.some(
          a => a.english_representation === newAlias.english_representation,
        );
        if (!isDup) merged.push(newAlias);
      }

      await cropRepo.updateCrop(
        existing._id!.toString(),
        { aliases: merged, status: group.status, type: 'chemical' },
        userId,
      );
      updated++;
    } else {
      await cropRepo.createCrop(group.name, userId, group.aliases, 'chemical', group.status);
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
