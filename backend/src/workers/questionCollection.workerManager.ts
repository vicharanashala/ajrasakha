/**
 * Worker manager for Question Collection background processing.
 * Generates embeddings and normalizes crops for bulk-inserted questions.
 */
import path from 'path';
import {fileURLToPath} from 'url';
import {Worker} from 'worker_threads';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface QuestionCollectionWorkerInput {
  questionIds: string[];
}

const QUESTION_COLLECTION_WORKER_PATH = path.resolve(__dirname, 'questionCollectionProcessor.worker.js');

/**
 * Starts the Question Collection background worker to process embeddings and crop normalization.
 * Returns immediately (fire-and-forget) after starting the worker thread.
 */
export async function startQuestionCollectionProcessing(
  input: QuestionCollectionWorkerInput,
): Promise<void> {
  const {questionIds} = input;

  if (!Array.isArray(questionIds) || questionIds.length === 0) {
    console.log('[QuestionCollectionWorkerManager] No questions to process — skipping');
    return;
  }

  const mongoUri = process.env.DB_URL;
  const dbName = process.env.DB_NAME;

  console.log(
    `[QuestionCollectionWorkerManager] Starting background worker for ${questionIds.length} question(s)`,
  );

  return new Promise((resolve, reject) => {
    const worker = new Worker(QUESTION_COLLECTION_WORKER_PATH, {
      workerData: {
        questionIds,
        mongoUri,
        dbName,
      },
    });

    worker.on('message', (message: any) => {
      if (message.success) {
        console.log(
          `[QuestionCollectionWorkerManager] Worker completed — processed: ${message.processed}, failed: ${message.failed}`,
        );
      } else {
        console.error('[QuestionCollectionWorkerManager] Worker reported failure:', message);
      }
      resolve();
    });

    worker.on('error', (error) => {
      console.error('[QuestionCollectionWorkerManager] Worker error:', error);
      // Don't reject — background processing failure should not break the main flow
      resolve();
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        console.warn(`[QuestionCollectionWorkerManager] Worker exited with code ${code}`);
      }
    });
  });
}