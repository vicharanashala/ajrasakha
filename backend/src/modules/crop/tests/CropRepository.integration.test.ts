import 'reflect-metadata';
import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import * as dotenv from 'dotenv';
dotenv.config();
import {MongoDatabase} from '#root/shared/database/providers/mongo/MongoDatabase.js';
import {CropRepository} from '#root/shared/database/providers/mongo/repositories/CropRepository.js';

const DB_URL = process.env.DB_URL!;
const DB_NAME = process.env.DB_NAME!;

const TS = Date.now();
const TEST_CROP_NAME = `Test_Crop_${TS}`;
const TEST_CROP_NAME_LOWER = TEST_CROP_NAME.toLowerCase();
const TEST_ALIAS_1 = `testalias1_${TS}`;
const TEST_ALIAS_2 = `testalias2_${TS}`;
const CREATED_BY = '664f00000000000000000001';

let db: MongoDatabase;
let repo: CropRepository;
let createdDocId: string;

beforeAll(async () => {
  db = new MongoDatabase(DB_URL, DB_NAME);
  await db.init();
  repo = new CropRepository(db as any);
  // Clean up any stale docs from previous failed runs
  const collection = await db.getCollection('crop_master');
  await collection.deleteMany({name: {$regex: '^test_crop_', $options: 'i'}});
}, 30000);

afterAll(async () => {
  if (createdDocId) {
    const collection = await db.getCollection('crop_master');
    const {ObjectId} = await import('mongodb');
    await collection.deleteOne({_id: new ObjectId(createdDocId)});
  }
  await db.disconnect();
}, 30000);

describe('CropRepository integration (prod_copy_db)', () => {

  it('createCrop — inserts a new doc and returns it', async () => {
    const crop = await repo.createCrop(
      TEST_CROP_NAME,
      CREATED_BY,
      [TEST_ALIAS_1, TEST_ALIAS_2],
    );

    expect(crop._id).toBeDefined();
    expect(crop.name).toBe(TEST_CROP_NAME_LOWER);
    expect(crop.aliases).toContain(TEST_ALIAS_1);

    createdDocId = crop._id!.toString();
  }, 30000);

  it('createCrop — throws on duplicate name', async () => {
    await expect(
      repo.createCrop(TEST_CROP_NAME, CREATED_BY),
    ).rejects.toThrow('already exists');
  }, 30000);

  it('getAllCrops — returns list including the created crop', async () => {
    const {crops, totalCount} = await repo.getAllCrops({search: TEST_CROP_NAME_LOWER});

    expect(totalCount).toBeGreaterThanOrEqual(1);
    expect(crops.some(c => c.name === TEST_CROP_NAME_LOWER)).toBe(true);
  }, 30000);

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
      {aliases: ['UpdatedAlias']},
      CREATED_BY,
    );

    expect(updated).not.toBeNull();
    expect(updated!.aliases).toContain('updatedalias');
    expect(updated!.aliases).not.toContain(TEST_ALIAS_1);
  }, 30000);
});
