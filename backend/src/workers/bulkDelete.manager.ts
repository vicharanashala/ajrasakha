import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import { getContainer } from '#root/bootstrap/loadModules.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import type { QuestionService } from '#root/modules/question/services/QuestionService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface BulkDeleteJobStatus {
  id: string;
  total: number;
  processed: number;
  status: 'running' | 'completed' | 'failed';
  startedAt: Date;
  finishedAt?: Date;
  logs: string[];
}

const bulkDeleteJobs: Record<string, BulkDeleteJobStatus> = {};

export const startBulkDeleteWorker = (
  questionIds: string[],
  userId: string,
): string => {
  const jobId = `delete_${Date.now()}`;
  const total = questionIds.length;

  const job: BulkDeleteJobStatus = {
    id: jobId,
    total,
    processed: 0,
    status: 'running',
    startedAt: new Date(),
    logs: [`🚀 Bulk Delete Job ${jobId} started for ${total} question(s)`],
  };
  bulkDeleteJobs[jobId] = job;

  const workerFile = path.join(__dirname, 'bulkDelete.worker.js');
  const worker = new Worker(workerFile, {
    workerData: {
      questionIds,
      userId,
      mongoUri: process.env.DB_URL!,
      dbName: process.env.DB_NAME!,
    },
  });

  worker.on('message', (msg) => {
    if (msg?.processed !== undefined) job.processed += msg.processed;
    if (msg?.successId) job.logs.push(`✅ Deleted question ${msg.successId}`);
    if (msg?.failedQuestion)
      job.logs.push(
        `❌ Failed to delete question ${msg.failedQuestion.questionId}: ${msg.failedQuestion.reason}`,
      );
  });

  worker.on('error', (err) => {
    job.logs.push(`❌ Worker error: ${err.message}`);
    job.status = 'failed';
    job.finishedAt = new Date();
  });

  worker.on('exit', (code) => {
    if (job.status !== 'failed') {
      job.status = code === 0 ? 'completed' : 'failed';
    }
    job.finishedAt = new Date();
    job.logs.push(`🏁 Bulk Delete Job finished with exit code ${code}`);

    // Deleting questions may have freed PAE experts (a question they held for validation is
    // now gone) — run the PAE-validation queue once so freed experts pick up their next
    // question. Fire-and-forget and best-effort; can't affect the delete that already ran.
    try {
      const questionService = getContainer().get<QuestionService>(
        CORE_TYPES.QuestionService,
      );
      questionService.triggerPaeValidationQueueAllocation('bulkDeleteQuestions');
    } catch (err: any) {
      console.error(
        '[bulkDeleteQuestions] PAE-validation allocation trigger failed:',
        err?.message,
      );
    }
  });

  return jobId;
};

export const getBulkDeleteJobs = () =>
  Object.values(bulkDeleteJobs).map(({ logs, ...rest }) => ({
    ...rest,
    logs: logs.slice(-10),
  }));

export const getBulkDeleteJobById = (jobId: string) => bulkDeleteJobs[jobId];
