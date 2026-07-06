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
  /** When true the previous expert is NOT reputation-penalised (only freed from the
   *  question). Used for opened-but-idle reallocations. */
  skipPenalty?: boolean;
}

export interface BalanceWorkloadResult {
  /** Total jobs the workers reported persisting. */
  processed: number;
  /** Number of worker threads that errored or exited non-zero. */
  failedWorkers: number;
}

/**
 * Spawns the balance-workload worker threads and resolves once every worker has
 * exited. Awaiting the returned promise keeps the caller's run open until the DB
 * writes have actually landed — important for the time-bound reallocation cron,
 * where the next tick must not start before in-flight assignments are persisted
 * (otherwise a reserved expert still looks "free" and gets double-allocated).
 */
export const startBalanceWorkloadWorkers = (
  assignments: AssignmentJob[],
  inactiveExpertIds: string[] = [],
): Promise<BalanceWorkloadResult> => {
  if (!assignments.length) return Promise.resolve({ processed: 0, failedWorkers: 0 });

  const cpuCount = os.cpus().length;
  const MAX_WORKERS = Math.min(6, Math.max(2, Math.floor(cpuCount / 2)));
  const CHUNK_SIZE = Math.ceil(assignments.length / MAX_WORKERS);

  const chunks: AssignmentJob[][] = [];
  for (let i = 0; i < assignments.length; i += CHUNK_SIZE) {
    chunks.push(assignments.slice(i, i + CHUNK_SIZE));
  }

  const workerFile = path.join(__dirname, 'balanceWorkload.worker.js');

  let processed = 0;
  let failedWorkers = 0;

  const workerPromises = chunks.map((chunk, index) => {
    return new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      const worker = new Worker(workerFile, {
        workerData: {
          assignments: chunk,
          mongoUri: process.env.DB_URL!,
          dbName: process.env.DB_NAME!,
          inactiveExpertIds,
        },
      });

      console.log(`🧩 Balance Worker ${index + 1} started (${chunk.length} jobs)`);

      worker.on('message', (msg: any) => {
        if (msg?.success && typeof msg.processed === 'number') processed += msg.processed;
      });
      worker.on('error', (err: any) => {
        failedWorkers++;
        console.error(`❌ Balance Worker ${index + 1} errored:`, err?.message ?? err);
        done();
      });
      worker.on('exit', (code: number) => {
        if (code !== 0) console.error(`❌ Balance Worker ${index + 1} exited with code ${code}`);
        done();
      });
    });
  });

  return Promise.all(workerPromises).then(() => ({ processed, failedWorkers }));
};
