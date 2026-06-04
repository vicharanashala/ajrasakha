import 'reflect-metadata';
import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import * as dotenv from 'dotenv';
import {MongoDatabase} from '#root/shared/database/providers/mongo/MongoDatabase.js';
import {CropRepository} from '#root/shared/database/providers/mongo/repositories/CropRepository.js';
dotenv.config({
  path: '.env.test',
});

const DB_URL = process.env.DB_URL!;
const DB_NAME = process.env.DB_NAME!;
console.log({
  DB_URL,
  DB_NAME,
});
const TS = Date.now();
const TEST_CROP_NAME = `Test_Crop_${TS}`;
const TEST_CROP_NAME_LOWER = TEST_CROP_NAME.toLowerCase();
const TEST_ALIAS_1 = `testalias1_${TS}`;
const TEST_ALIAS_2 = `testalias2_${TS}`;
const CREATED_BY = '664f00000000000000000001';

let db: MongoDatabase;
let repo: CropRepository;
let createdDocId: string;
let chemicalId: string;
let secondCropId: string;
let findCropId: string;

beforeAll(async () => {
  db = new MongoDatabase(DB_URL, DB_NAME);
  await db.init();
  repo = new CropRepository(db as any);
  // Clean up any stale docs from previous failed runs
  const collection = await db.getCollection('crop_master');
  await collection.deleteMany({name: {$regex: '^test_crop_', $options: 'i'}});
}, 30000);

afterAll(async () => {
  const collection = await db.getCollection('crop_master');
  const {ObjectId} = await import('mongodb');

  const idsToDelete = [
    createdDocId,
    chemicalId,
    secondCropId,
    findCropId,
  ].filter(Boolean);

  for (const id of idsToDelete) {
    await collection.deleteOne({
      _id: new ObjectId(id),
    });
  }

  await collection.deleteMany({
    $or: [
      {name: {$regex: '^test_crop_', $options: 'i'}},
      {name: {$regex: '^chemical_', $options: 'i'}},
      {name: {$regex: '^findcrop_', $options: 'i'}},
      {name: {$regex: '^secondcrop_', $options: 'i'}},
      {name: {$regex: '^deletecrop_', $options: 'i'}},
    ],
  });

  await db.disconnect();
}, 30000);

describe('CropRepository integration ', () => {
  it('createCrop — inserts a new doc and returns it', async () => {
    const crop = await repo.createCrop(
      TEST_CROP_NAME,
      CREATED_BY,
      [
        {
          language: 'en-IN',
          region: '',
          english_representation: TEST_ALIAS_1,
          native_representation: TEST_ALIAS_1,
        },
        {
          language: 'en-IN',
          region: '',
          english_representation: TEST_ALIAS_2,
          native_representation: TEST_ALIAS_2,
        },
      ],
      'crop',
    );

    expect(crop._id).toBeDefined();
    expect(crop.name).toBe(TEST_CROP_NAME_LOWER);
    expect(
      crop.aliases.some(
        a =>
          typeof a !== 'string' &&
          a.english_representation === TEST_ALIAS_1.toLowerCase(),
      ),
    ).toBe(true);

    createdDocId = crop._id!.toString();
  }, 30000);

  it('createCrop — throws on duplicate name', async () => {
    await expect(repo.createCrop(TEST_CROP_NAME, CREATED_BY)).rejects.toThrow(
      'already exists',
    );
  }, 30000);

  it('createCrop — throws when alias already exists as crop name', async () => {
    await expect(
      repo.createCrop(
        `AnotherCrop_${TS}`,
        CREATED_BY,
        [
          {
            language: 'en-IN',
            region: '',
            english_representation: TEST_CROP_NAME,
            native_representation: TEST_CROP_NAME,
          },
        ],
        'crop',
      ),
    ).rejects.toThrow('already exists');
  }, 30000);

  let chemicalId: string;

  it('createCrop — creates chemical correctly', async () => {
    const chemical = await repo.createCrop(
      `Chemical_${TS}`,
      CREATED_BY,
      [],
      'chemical',
      'approved',
      ['rice', 'wheat'],
    );

    expect(chemical.type).toBe('chemical');
    expect(chemical.status).toBe('approved');
    expect(chemical.crops).toEqual(['rice', 'wheat']);

    chemicalId = chemical._id!.toString();
  }, 30000);

  it('findByNameOrAlias — finds crop by name', async () => {
    const crop = await repo.findByNameOrAlias(TEST_CROP_NAME);
    findCropId = crop._id!.toString();
    expect(crop).not.toBeNull();
    expect(crop?.name).toBe(TEST_CROP_NAME_LOWER);
  }, 30000);

  const FIND_ALIAS = `find_alias_${TS}`;
  it('findByNameOrAlias — finds crop by alias', async () => {
    const crop = await repo.createCrop(
      `FindCrop_${TS}`,
      CREATED_BY,
      [
        {
          language: 'en-IN',
          region: '',
          english_representation: FIND_ALIAS,
          native_representation: FIND_ALIAS,
        },
      ],
      'crop',
    );

    findCropId = crop._id!.toString();

    const found = await repo.findByNameOrAlias(FIND_ALIAS);

    expect(found).not.toBeNull();
  });

  it('getAllCrops — returns list including the created crop', async () => {
    const {crops, totalCount} = await repo.getAllCrops({
      search: TEST_CROP_NAME_LOWER,
    });

    expect(totalCount).toBeGreaterThanOrEqual(1);
    expect(crops.some(c => c.name === TEST_CROP_NAME_LOWER)).toBe(true);
  }, 30000);

  it('getAllCrops — filters by crop type', async () => {
    const result = await repo.getAllCrops({
      type: 'crop',
    });

    expect(result.crops.every(c => !c.type || c.type === 'crop')).toBe(true);
  }, 30000);

  it('getAllCrops — filters by chemical type', async () => {
    const result = await repo.getAllCrops({
      type: 'chemical',
    });

    expect(result.crops.every(c => c.type === 'chemical')).toBe(true);
  }, 30000);

  it('getAllCrops — respects pagination', async () => {
    const result = await repo.getAllCrops({
      page: 1,
      limit: 1,
    });

    expect(result.crops.length).toBeLessThanOrEqual(1);
  });

  it('getAllCrops — sorts by name ascending', async () => {
    const result = await repo.getAllCrops({
      sort: 'name_asc',
      limit: 20,
    });

    const names = result.crops.map(c => c.name);
    const sorted = [...names].sort();

    expect(names).toEqual(sorted);
  });

  it('getCropById — returns the correct crop', async () => {
    const crop = await repo.getCropById(createdDocId);

    expect(crop).not.toBeNull();
    expect(crop!.name).toBe(TEST_CROP_NAME_LOWER);
  }, 30000);

  it('getCropById — returns null for unknown id', async () => {
    const crop = await repo.getCropById('664f00000000000000000099');
    expect(crop).toBeNull();
  }, 30000);

  it('updateCrop — updates aliases and returns updated doc', async () => {
    const updated = await repo.updateCrop(
      createdDocId,
      {
        aliases: [
          {
            language: 'en-IN',
            region: '',
            english_representation: 'UpdatedAlias',
            native_representation: 'UpdatedAlias',
          },
        ],
      },
      CREATED_BY,
    );

    expect(updated).not.toBeNull();
    expect(
      updated!.aliases.some(
        a =>
          typeof a !== 'string' && a.english_representation === 'updatedalias',
      ),
    ).toBe(true);
    expect(
      updated!.aliases.some(
        a =>
          typeof a !== 'string' &&
          a.english_representation === TEST_ALIAS_1.toLowerCase(),
      ),
    ).toBe(false);
  }, 30000);

  let secondCropId: string;
  it('updateCrop — rejects alias that exists in another crop', async () => {
    const secondCrop = await repo.createCrop(`SecondCrop_${TS}`, CREATED_BY);

    secondCropId = secondCrop._id!.toString();

    await expect(
      repo.updateCrop(
        secondCropId,
        {
          aliases: [
            {
              language: 'en-IN',
              region: '',
              english_representation: TEST_CROP_NAME,
              native_representation: TEST_CROP_NAME,
            },
          ],
        },
        CREATED_BY,
      ),
    ).rejects.toThrow('already exists');
  }, 30000);

  it('updateCrop — removes alias equal to crop name', async () => {
    const updated = await repo.updateCrop(
      createdDocId,
      {
        aliases: [
          {
            language: 'en-IN',
            region: '',
            english_representation: TEST_CROP_NAME_LOWER,
            native_representation: TEST_CROP_NAME_LOWER,
          },
        ],
      },
      CREATED_BY,
    );

    expect(updated?.aliases.length).toBe(0);
  }, 30000);

  it('deleteCrop — deletes crop successfully', async () => {
    const crop = await repo.createCrop(`DeleteCrop_${TS}`, CREATED_BY);

    const deleted = await repo.deleteCrop(crop._id!.toString());

    expect(deleted).toBe(true);

    const found = await repo.getCropById(crop._id!.toString());

    expect(found).toBeNull();
  }, 30000);

  it('findChemicalByNameOrAlias — finds chemical by name', async () => {
    const chemical = await repo.findChemicalByNameOrAlias(`Chemical_${TS}`);

    expect(chemical).not.toBeNull();
    expect(chemical?.type).toBe('chemical');
  }, 30000);
});
