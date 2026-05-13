import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PaeJobStatus {
  id: string;
  total: number;
  processed: number;
  status: 'running' | 'completed' | 'failed';
  startedAt: Date;
  finishedAt?: Date;
  logs: string[];
}

const paeJobs: Record<string, PaeJobStatus> = {};

export const startPaeAllocationWorker = (
  questionIds: string[],
  paeExpertId: string,
  userId: string,
): string => {
  const jobId = `pae_${Date.now()}`;
  const total = questionIds.length;

  const job: PaeJobStatus = {
    id: jobId,
    total,
    processed: 0,
    status: 'running',
    startedAt: new Date(),
    logs: [`🚀 PAE Allocation Job ${jobId} started for ${total} question(s)`],
  };
  paeJobs[jobId] = job;

  const workerFile = path.join(__dirname, 'paeAllocation.worker.js');
  const worker = new Worker(workerFile, {
    workerData: {
      questionIds,
      paeExpertId,
      userId,
      mongoUri: process.env.DB_URL!,
      dbName: process.env.DB_NAME!,
    },
  });

  worker.on('message', (msg) => {
    if (msg?.processed !== undefined) job.processed += msg.processed;
    if (msg?.successId) job.logs.push(`✅ Allocated question ${msg.successId}`);
    if (msg?.failedQuestion)
      job.logs.push(
        `❌ Failed question ${msg.failedQuestion.questionId}: ${msg.failedQuestion.reason}`,
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
    job.logs.push(`🏁 PAE Allocation Job finished with exit code ${code}`);
  });

  return jobId;
};

export const getPaeJobs = () =>
  Object.values(paeJobs).map(({ logs, ...rest }) => ({
    ...rest,
    logs: logs.slice(-10),
  }));

export const getPaeJobById = (jobId: string) => paeJobs[jobId];
