import { Worker } from 'worker_threads';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface AssignmentJob {
  submissionId: string;
  expertId: string;
  /** When true the worker appends the new expert to queue/history instead of replacing the stuck one. */
  appendExpert?: boolean;
}

export const startBalanceWorkloadWorkers = (assignments: AssignmentJob[], inactiveExpertIds: string[] = []) => {
  if (!assignments.length) return;

  const cpuCount = os.cpus().length;
  const MAX_WORKERS = Math.min(6, Math.max(2, Math.floor(cpuCount / 2)));
  const CHUNK_SIZE = Math.ceil(assignments.length / MAX_WORKERS);

  const chunks: AssignmentJob[][] = [];
  for (let i = 0; i < assignments.length; i += CHUNK_SIZE) {
    chunks.push(assignments.slice(i, i + CHUNK_SIZE));
  }

  const workerFile = path.join(__dirname, 'balanceWorkload.worker.js');

  chunks.forEach((chunk, index) => {
    const worker = new Worker(workerFile, {
      workerData: {
        assignments: chunk,
        mongoUri: process.env.DB_URL!,
        dbName: process.env.DB_NAME!,
        inactiveExpertIds,
      },
    });

    console.log(`🧩 Balance Worker ${index + 1} started (${chunk.length} jobs)`);
  });
};
