import 'reflect-metadata';
import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import * as dotenv from 'dotenv';
dotenv.config();
import {MongoDatabase} from '#root/shared/database/providers/mongo/MongoDatabase.js';
import {CropRepository} from '#root/shared/database/providers/mongo/repositories/CropRepository.js';

const DB_URL = process.env.DB_URL!;
const DB_NAME = process.env.DB_NAME!;

const TEST_CROP_ID = `TEST_CROP_${Date.now()}`;
const CREATED_BY = '664f00000000000000000001';

let db: MongoDatabase;
let repo: CropRepository;
let createdDocId: string;

beforeAll(async () => {
  db = new MongoDatabase(DB_URL, DB_NAME);
  await db.init();
  repo = new CropRepository(db as any);
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
      TEST_CROP_ID,
      'Test Crop',
      CREATED_BY,
      ['TestAlias1', 'TestAlias2'],
    );

    expect(crop._id).toBeDefined();
    expect(crop.cropId).toBe(TEST_CROP_ID);
    expect(crop.name).toBe('Test Crop');
    expect(crop.aliases).toContain('TestAlias1');

    createdDocId = crop._id!.toString();
  }, 30000);

  it('createCrop — throws on duplicate cropId', async () => {
    await expect(
      repo.createCrop(TEST_CROP_ID, 'Duplicate Crop', CREATED_BY),
    ).rejects.toThrow('already exists');
  }, 30000);

  it('getAllCrops — returns list including the created crop', async () => {
    const {crops, totalCount} = await repo.getAllCrops({search: TEST_CROP_ID});

    expect(totalCount).toBeGreaterThanOrEqual(1);
    expect(crops.some(c => c.cropId === TEST_CROP_ID)).toBe(true);
  }, 30000);

  it('getCropById — returns the correct crop', async () => {
    const crop = await repo.getCropById(createdDocId);

    expect(crop).not.toBeNull();
    expect(crop!.cropId).toBe(TEST_CROP_ID);
    expect(crop!.name).toBe('Test Crop');
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
    expect(updated!.aliases).toContain('UpdatedAlias');
    expect(updated!.aliases).not.toContain('TestAlias1');
  }, 30000);

  it('deleteCrop — hard-deletes and returns deletedCount 1', async () => {
    const result = await repo.deleteCrop(createdDocId);
    expect(result.deletedCount).toBe(1);
    createdDocId = ''; // already deleted, skip afterAll cleanup
  }, 30000);

  it('deleteCrop — throws 404 for non-existent crop', async () => {
    await expect(
      repo.deleteCrop('664f00000000000000000099'),
    ).rejects.toThrow('not found');
  }, 30000);
});
