import { Worker } from 'worker_threads';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface JobStatus {
  id: string;
  total: number;
  processed: number;
  status: 'running' | 'completed' | 'failed';
  startedAt: Date;
  finishedAt?: Date;
  logs: string[];
}

const jobs: Record<string, JobStatus> = {};


function chunkArray<T>(arr: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    chunks.push(arr.slice(i, i + chunkSize));
  }
  return chunks;
}


export const startBackgroundProcessing = (questionIds: string[]) => {
  if (!questionIds?.length) return;

  const jobId = Date.now().toString();
  const total = questionIds.length;
  const job: JobStatus = {
    id: jobId,
    total,
    processed: 0,
    status: 'running',
    startedAt: new Date(),
    logs: [`🚀 Job ${jobId} started with ${total} questions`],
  };
  jobs[jobId] = job;

  // Determine optimal concurrency
  const cpuCount = os.cpus().length;
  const MAX_WORKERS = Math.min(8, Math.max(2, Math.floor(cpuCount / 2))); // Cap at 8 
  const CHUNK_SIZE = Math.ceil(questionIds.length / MAX_WORKERS);

  const chunks = chunkArray(questionIds, CHUNK_SIZE);
  const workerFile = path.join(__dirname, 'questionProcessor.worker.js');

  job.logs.push(
    `🧠 Using ${MAX_WORKERS} workers (chunk size ~${CHUNK_SIZE})`
  );

  let completedWorkers = 0;
  let failedWorkers = 0;

  chunks.forEach((chunk, index) => {
    const worker = new Worker(workerFile, {
      workerData: {
        ids: chunk,
        mongoUri: process.env.DB_URL!,
        dbName: process.env.DB_NAME!,
      },
    });

    job.logs.push(`🧩 Worker ${index + 1} started for ${chunk.length} questions`);

    // ---- Message handling ----
    worker.on('message', msg => {
      if (msg?.log) job.logs.push(`[Worker ${index + 1}] ${msg.log}`);
      if (msg?.processed !== undefined) {
        job.processed += msg.processed;
      }
      if (msg?.success) {
        completedWorkers++;
        job.logs.push(`✅ Worker ${index + 1} completed (${msg.processed} processed)`);
      }
    });

    // ---- Error handling ----
    worker.on('error', err => {
      failedWorkers++;
      job.logs.push(`❌ Worker ${index + 1} error: ${err.message}`);
    });

    worker.on('exit', code => {
      if (code !== 0) {
        failedWorkers++;
        job.logs.push(`⚠️ Worker ${index + 1} exited with code ${code}`);
      }

      // When all workers are done
      if (completedWorkers + failedWorkers === chunks.length) {
        job.finishedAt = new Date();
        job.status = failedWorkers === 0 ? 'completed' : 'failed';
        job.logs.push(
          `🏁 Job finished. Processed ${job.processed}/${job.total}. Failed workers: ${failedWorkers}`
        );
      }
    });
  });

  return jobId;
};

// ---- Utility: Fetch all jobs ----
export const getBackgroundJobs = () => {
  return Object.values(jobs).map(({ logs, ...rest }) => ({
    ...rest,
    logs: logs.slice(-10),
  }));
};

// ---- Utility: Fetch single job ----
export const getJobById = (jobId: string) => jobs[jobId];
