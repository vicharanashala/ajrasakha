import 'reflect-metadata';
import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import * as dotenv from 'dotenv';

import {MongoDatabase} from '#root/shared/database/providers/mongo/MongoDatabase.js';
import {ChemicalRepository} from '#root/shared/database/providers/mongo/repositories/ChemicalRepository.js';

dotenv.config({
  path: '.env.test',
});

const DB_URL = process.env.DB_URL!;
const DB_NAME = process.env.DB_NAME!;
console.log('DB_URL', DB_URL);

const TS = Date.now();

const TEST_CHEMICAL_NAME = `Chemical_${TS}`;
const UPDATED_CHEMICAL_NAME = `ChemicalUpdated_${TS}`;
const CREATED_BY = '664f00000000000000000001';

let db: MongoDatabase;
let repo: ChemicalRepository;

let createdChemicalId: string;
let duplicateCheckChemicalId: string;

beforeAll(async () => {
  db = new MongoDatabase(DB_URL, DB_NAME);
  await db.init();

  repo = new ChemicalRepository(db as any);

  const collection = await db.getCollection('chemical_master');

  await collection.deleteMany({
    name: {
      $regex: '^(chemical_|chemicalupdated_)',
      $options: 'i',
    },
  });
}, 30000);

afterAll(async () => {
  const collection = await db.getCollection('chemical_master');
  const {ObjectId} = await import('mongodb');

  const ids = [createdChemicalId, duplicateCheckChemicalId].filter(Boolean);

  for (const id of ids) {
    await collection.deleteOne({
      _id: new ObjectId(id),
    });
  }

  await db.disconnect();
}, 30000);

describe('ChemicalRepository integration', () => {
  it('createChemical — creates a chemical successfully', async () => {
    const chemical = await repo.createChemical(
      TEST_CHEMICAL_NAME,
      'Restricted',
      CREATED_BY,
    );

    expect(chemical._id).toBeDefined();
    expect(chemical.name).toBe(TEST_CHEMICAL_NAME);
    expect(chemical.status).toBe('Restricted');

    createdChemicalId = chemical._id!.toString();
  }, 30000);

  it('createChemical — throws on duplicate name', async () => {
    await expect(
      repo.createChemical(TEST_CHEMICAL_NAME, 'Restricted', CREATED_BY),
    ).rejects.toThrow('already exists');
  }, 30000);

  it('getAllChemicals — returns created chemical', async () => {
    const result = await repo.getAllChemicals({
      search: TEST_CHEMICAL_NAME,
    });

    expect(result.totalCount).toBeGreaterThanOrEqual(1);

    expect(result.chemicals.some(c => c.name === TEST_CHEMICAL_NAME)).toBe(
      true,
    );
  }, 30000);

  it('getAllChemicals — filters by search on status', async () => {
    const result = await repo.getAllChemicals({
      search: 'Restricted',
    });

    expect(result.chemicals.some(c => c.status === 'Restricted')).toBe(true);
  }, 30000);

  it('getAllChemicals — respects pagination', async () => {
    const result = await repo.getAllChemicals({
      page: 1,
      limit: 1,
    });

    expect(result.chemicals.length).toBeLessThanOrEqual(1);
  });

  it('getAllChemicals — sorts by name ascending', async () => {
    const result = await repo.getAllChemicals({
      sort: 'name_asc',
      limit: 20,
    });

    const names = result.chemicals.map(c => c.name);
    const sorted = [...names].sort();

    expect(names).toEqual(sorted);
  });

  it('getChemicalById — returns created chemical', async () => {
    const chemical = await repo.getChemicalById(createdChemicalId);

    expect(chemical).not.toBeNull();
    expect(chemical?.name).toBe(TEST_CHEMICAL_NAME);
  }, 30000);

  it('getChemicalById — returns null for unknown id', async () => {
    const chemical = await repo.getChemicalById('664f00000000000000000099');

    expect(chemical).toBeNull();
  }, 30000);

  it('findByName — finds chemical by name', async () => {
    const chemical = await repo.findByName(TEST_CHEMICAL_NAME);

    expect(chemical).not.toBeNull();
    expect(chemical?.name).toBe(TEST_CHEMICAL_NAME);
  }, 30000);

  it('findByName — returns null when chemical does not exist', async () => {
    const chemical = await repo.findByName('does-not-exist');

    expect(chemical).toBeNull();
  }, 30000);

  it('updateChemical — updates chemical name', async () => {
    const updated = await repo.updateChemical(
      createdChemicalId,
      {
        name: UPDATED_CHEMICAL_NAME,
      },
      CREATED_BY,
    );

    expect(updated).not.toBeNull();
    expect(updated?.name).toBe(UPDATED_CHEMICAL_NAME);
  }, 30000);

  it('updateChemical — updates chemical status', async () => {
    const updated = await repo.updateChemical(
      createdChemicalId,
      {
        status: 'Banned',
      },
      CREATED_BY,
    );

    expect(updated).not.toBeNull();
    expect(updated?.status).toBe('Banned');
  }, 30000);

  it('updateChemical — returns current chemical when no changes provided', async () => {
    const current = await repo.getChemicalById(createdChemicalId);

    const updated = await repo.updateChemical(
      createdChemicalId,
      {
        name: current!.name,
        status: current!.status,
      },
      CREATED_BY,
    );

    expect(updated).not.toBeNull();
    expect(updated?._id).toBe(createdChemicalId);
  }, 30000);

  it('updateChemical — rejects duplicate name', async () => {
    const secondChemical = await repo.createChemical(
      `DuplicateChemical_${TS}`,
      'Restricted',
      CREATED_BY,
    );

    duplicateCheckChemicalId = secondChemical._id!.toString();

    await expect(
      repo.updateChemical(
        duplicateCheckChemicalId,
        {
          name: UPDATED_CHEMICAL_NAME,
        },
        CREATED_BY,
      ),
    ).rejects.toThrow('already exists');
  }, 30000);

  it('updateChemical — returns null for unknown chemical', async () => {
    const result = await repo.updateChemical(
      '664f00000000000000000099',
      {
        name: 'anything',
      },
      CREATED_BY,
    );

    expect(result).toBeNull();
  }, 30000);

  it('deleteChemical — deletes chemical successfully', async () => {
    const chemical = await repo.createChemical(
      `DeleteChemical_${TS}`,
      'Restricted',
      CREATED_BY,
    );

    const deleted = await repo.deleteChemical(chemical._id!.toString());

    expect(deleted).toBe(true);

    const found = await repo.getChemicalById(chemical._id!.toString());

    expect(found).toBeNull();
  }, 30000);

  it('deleteChemical — returns false for unknown id', async () => {
    const deleted = await repo.deleteChemical('664f00000000000000000099');

    expect(deleted).toBe(false);
  }, 30000);
});
