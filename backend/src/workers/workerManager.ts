// import { Worker } from 'worker_threads';
// import path from 'path';
// import os from 'os';

// const MAX_WORKERS = Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2)));
// function chunkArray<T>(arr: T[], size: number): T[][] {
//   const out: T[][] = [];
//   for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
//   return out;
// }

// export async function startBackgroundProcessing(questionIds: string[]): Promise<void> {
//   if (!Array.isArray(questionIds) || questionIds.length === 0) return;
//   const chunkSize = Math.max(5, Math.ceil(questionIds.length / MAX_WORKERS));
//   const chunks = chunkArray(questionIds, chunkSize);
//   const workerFile = process.env.QUESTION_WORKER_PATH || path.join(__dirname, 'questionProcessor.worker.js');

//   await Promise.all(
//     chunks.map(chunk => {
//       return new Promise<void>((resolve) => {
//         const worker = new Worker(workerFile, { workerData: { ids: chunk } });

//         worker.on('message', (msg) => {
//           resolve();
//         });

//         worker.on('error', (err) => {
//           resolve();
//         });

//         worker.on('exit', (code) => {
//           resolve();
//         });
//       });
//     }),
//   );
// }



// import { Worker } from 'worker_threads';
// import path from 'path';
// import { fileURLToPath } from 'url';
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);
// // In-memory job tracker
// interface JobStatus {
//   id: string;
//   total: number;
//   processed: number;
//   status: 'running' | 'completed' | 'failed';
//   startedAt: Date;
//   finishedAt?: Date;
//   logs: string[];
// }

// const jobs: Record<string, JobStatus> = {};



// export const startBackgroundProcessing = (questionIds: string[]) => {
//   console.log("reached here start background ")
//   if (!questionIds?.length) return;

//   const jobId = Date.now().toString();
//   const total = questionIds.length;

//   const job: JobStatus = {
//     id: jobId,
//     total,
//     processed: 0,
//     status: 'running',
//     startedAt: new Date(),
//     logs: [`🚀 Job ${jobId} started with ${total} questions`],
//   };

//   jobs[jobId] = job;
//   console.log("here also ")
//   // const workerPath = path.resolve('/backend/build/workers/questionProcessor.worker.js');
//   const workerPath = path.join(__dirname, 'questionProcessor.worker.js')
//   console.log("logger ")
//   const worker = new Worker(workerPath, {
//     workerData: { ids: questionIds ,mongoUri: process.env.DB_URL!,dbName:process.env.DB_NAME!},
//   });

//   // Receive messages from worker
//   worker.on('message', msg => {
//     if (msg?.log) {
//       job.logs.push(`[${new Date().toISOString()}] ${msg.log}`);
//     }
//     if (msg?.processed !== undefined) {
//       job.processed = msg.processed;
//     }
//     if (msg?.success) {
//       job.status = 'completed';
//       job.finishedAt = new Date();
//       job.logs.push('✅ Job completed successfully');
//     }
//   });

//   worker.on('error', err => {
//     job.status = 'failed';
//     job.finishedAt = new Date();
//     job.logs.push(`❌ Worker error: ${err.message}`);
//     console.error('Worker error:', err);
//   });

//   worker.on('exit', code => {
//     if (code !== 0 && job.status !== 'failed') {
//       job.status = 'failed';
//       job.finishedAt = new Date();
//       job.logs.push(`❌ Worker exited with code ${code}`);
//     }
//   });

//   return jobId;
// };

// export const getBackgroundJobs = () => {
//   return Object.values(jobs).map(({ logs, ...rest }) => ({
//     ...rest,
//     logs: logs.slice(-10), // only last 10 logs for brevity
//   }));
// };

// export const getJobById = (jobId: string) => jobs[jobId];













import { Worker } from 'worker_threads';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Job status tracker ----
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

// ---- Helper: Split into chunks ----
function chunkArray<T>(arr: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    chunks.push(arr.slice(i, i + chunkSize));
  }
  return chunks;
}

// ---- Core: Background processor ----
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
  const MAX_WORKERS = Math.min(8, Math.max(2, Math.floor(cpuCount / 2))); // Cap at 8 workers for safety
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
