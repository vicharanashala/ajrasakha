/**
 * Background worker for processing Question Collection questions.
 * Generates embeddings and ensures crop normalization for bulk-inserted questions.
 *
 * Input data:
 *   - questionIds: string[]   — IDs of newly inserted questions to process
 *   - mongoUri: string        — MongoDB connection URI
 *   - dbName: string          — MongoDB database name
 *
 * Output:
 *   - { success, processed, failed }
 */
import {parentPort, workerData} from 'worker_threads';
import 'reflect-metadata';
import path from 'path';
import {Container} from 'inversify';
import {MongoDatabase} from '#root/shared/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {ObjectId} from 'mongodb';
import {appConfig} from '#root/config/app.js';

interface WorkerData {
  questionIds: string[];
  mongoUri: string;
  dbName: string;
}

const data = workerData as WorkerData;
const questionIds: string[] = Array.isArray(data?.questionIds) ? data.questionIds : [];
const mongoUri = data.mongoUri;
const dbName = data.dbName;

if (!parentPort) {
  console.error('❌ parentPort not found – Question Collection worker must run in a worker thread.');
  process.exit(1);
}

console.log(`[QuestionCollectionWorker] Starting — ${questionIds.length} question(s) to process`);

const container = new Container({defaultScope: 'Singleton'});
container.bind<string>(GLOBAL_TYPES.uri).toConstantValue(mongoUri);
container.bind<string>(GLOBAL_TYPES.dbName).toConstantValue(dbName);
container.bind<MongoDatabase>(GLOBAL_TYPES.Database).to(MongoDatabase).inSingletonScope();

const database = container.get<MongoDatabase>(GLOBAL_TYPES.Database);
await database.init();

const {QuestionRepository} = await import('#root/shared/database/providers/mongo/repositories/QuestionRepository.js');
const {CropRepository} = await import('#root/shared/database/providers/mongo/repositories/CropRepository.js');

const questionRepo = new QuestionRepository(database);
await (questionRepo as any).init();
const cropRepo = new CropRepository(database);
await (cropRepo as any).init();

const {AiService} = await import('#root/modules/ai/services/AiService.js');
const aiService = new AiService();

(async () => {
  if (questionIds.length === 0) {
    parentPort?.postMessage({success: true, processed: 0, failed: 0});
    process.exit(0);
  }

  let processed = 0;
  let failed = 0;
  const errors: Array<{questionId: string; error: string}> = [];

  // In-memory crop cache for normalization
  const cropCache = new Map<string, string>();

  // Batch size for AI embedding calls (avoid overwhelming the AI server)
  const BATCH_SIZE = 10;

  for (let i = 0; i < questionIds.length; i += BATCH_SIZE) {
    const batch = questionIds.slice(i, i + BATCH_SIZE);
    console.log(`[QuestionCollectionWorker] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}, questions ${i + 1}–${Math.min(i + BATCH_SIZE, questionIds.length)}`);

    try {
      // 1. Fetch questions by IDs
      const questions = await questionRepo.findByIds(batch.map(id => new ObjectId(id)));

      if (!questions || questions.length === 0) {
        console.warn(`[QuestionCollectionWorker] No questions found for IDs: ${batch.join(', ')}`);
        continue;
      }

      // 2. Build bulk update array
      const updates: Array<{questionId: string; embedding: number[]; normalisedCrop?: string}> = [];

      for (const q of questions) {
        try {
          const questionText = q.question || '';
          let embedding: number[] = [];
          let normalisedCrop: string | undefined;

          // Generate embedding if AI server is enabled and question has text
          if (appConfig.ENABLE_AI_SERVER && questionText.trim()) {
            try {
              const {embedding: emb} = await aiService.getEmbedding(questionText);
              embedding = emb || [];
            } catch (embError: any) {
              console.warn(`[QuestionCollectionWorker] Embedding generation failed for ${q._id}:`, embError.message);
              // Keep empty embedding — question will be picked up by the regular embedding cron
            }
          }

          // Normalize crop if not already set
          const existingCrop = q.details?.normalised_crop;
          if (!existingCrop) {
            const rawCrop = (q.details?.crop || '').toString().trim();
            if (rawCrop) {
              const cacheKey = rawCrop.toLowerCase();
              if (cropCache.has(cacheKey)) {
                normalisedCrop = cropCache.get(cacheKey);
              } else {
                try {
                  const cropRecord = await cropRepo.findByNameOrAlias(rawCrop);
                  if (cropRecord) {
                    normalisedCrop = cropRecord.name;
                    cropCache.set(cacheKey, normalisedCrop);
                  }
                } catch (_) { /* crop normalization not critical */ }
              }
            }
          }

          updates.push({
            questionId: q._id.toString(),
            embedding,
            normalisedCrop,
          });
        } catch (qError: any) {
          console.error(`[QuestionCollectionWorker] Error processing question ${q._id}:`, qError.message);
          errors.push({questionId: q._id.toString(), error: qError.message});
          failed++;
        }
      }

      // 3. Bulk update in DB
      if (updates.length > 0) {
        const result = await questionRepo.bulkUpdateEmbeddings(updates);
        console.log(`[QuestionCollectionWorker] Bulk updated ${result.modifiedCount}/${updates.length} question(s)`);
        processed += updates.length;
      }
    } catch (batchError: any) {
      console.error(`[QuestionCollectionWorker] Batch error:`, batchError.message);
      failed += batch.length;
    }
  }

  console.log(`[QuestionCollectionWorker] Done — processed: ${processed}, failed: ${failed}`);
  parentPort?.postMessage({success: true, processed, failed, errors: errors.slice(0, 20)});
  process.exit(0);
})();