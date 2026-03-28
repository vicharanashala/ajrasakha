import 'reflect-metadata';
import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import * as dotenv from 'dotenv';
dotenv.config();
import {ObjectId} from 'mongodb';
import {MongoDatabase} from '#root/shared/database/providers/mongo/MongoDatabase.js';
import {CropRepository} from '#root/shared/database/providers/mongo/repositories/CropRepository.js';

const DB_URL = process.env.DB_URL!;
const DB_NAME = process.env.DB_NAME!;

const TEST_CROP_ID = `TEST_DELETE_CROP_${Date.now()}`;
const CREATED_BY = '664f00000000000000000001';

let db: MongoDatabase;
let repo: CropRepository;
let cropDocId: string;
let questionDocId: string;

beforeAll(async () => {
  db = new MongoDatabase(DB_URL, DB_NAME);
  await db.init();
  repo = new CropRepository(db as any);
}, 30000);

afterAll(async () => {
  // Safety net: clean up both docs even if tests fail mid-way
  const cropCollection = await db.getCollection('crop_master');
  const questionCollection = await db.getCollection('questions');

  if (cropDocId) {
    await cropCollection.deleteOne({_id: new ObjectId(cropDocId)}).catch(() => {});
  }
  if (questionDocId) {
    await questionCollection.deleteOne({_id: new ObjectId(questionDocId)}).catch(() => {});
  }
  await db.disconnect();
}, 30000);

describe('CropDeleteProtection integration (prod_copy_db)', () => {

  it('1 — create a new test crop in crop_master', async () => {
    const crop = await repo.createCrop(
      TEST_CROP_ID,
      'Test Delete Crop',
      CREATED_BY,
      ['TestDeleteAlias'],
    );

    expect(crop._id).toBeDefined();
    expect(crop.cropId).toBe(TEST_CROP_ID);
    cropDocId = crop._id!.toString();
  }, 30000);

  it('2 — insert a question referencing the crop (new ICropRef object format)', async () => {
    const questionCollection = await db.getCollection('questions');

    const result = await questionCollection.insertOne({
      question: `[TEST] Question referencing ${TEST_CROP_ID}`,
      userId: new ObjectId(CREATED_BY),
      status: 'open',
      priority: 'low',
      source: 'AGRI_EXPERT',
      totalAnswersCount: 0,
      details: {
        state: 'TestState',
        district: 'TestDistrict',
        crop: {
          cropId: TEST_CROP_ID,
          name: 'Test Delete Crop',
          aliases: ['TestDeleteAlias'],
        },
        season: 'Kharif',
        domain: 'Agriculture',
      },
      isAutoAllocate: false,
      embedding: [],
      metrics: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(result.insertedId).toBeDefined();
    questionDocId = result.insertedId.toString();
  }, 30000);

  it('3 — delete crop is BLOCKED because a question references it', async () => {
    await expect(repo.deleteCrop(cropDocId)).rejects.toMatchObject({
      httpCode: 400,
      message: expect.stringContaining('referenced by existing questions'),
    });
  }, 30000);

  it('4 — hard-delete the test question from questions collection', async () => {
    const questionCollection = await db.getCollection('questions');
    const result = await questionCollection.deleteOne({
      _id: new ObjectId(questionDocId),
    });

    expect(result.deletedCount).toBe(1);
    questionDocId = ''; // skip afterAll cleanup
  }, 30000);

  it('5 — delete crop SUCCEEDS now that no questions reference it', async () => {
    const result = await repo.deleteCrop(cropDocId);

    expect(result.deletedCount).toBe(1);
    cropDocId = ''; // skip afterAll cleanup
  }, 30000);
});
