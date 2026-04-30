import { Worker } from 'worker_threads';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { IAuditTrailsService } from '#root/modules/auditTrails/interfaces/IAuditTrailsService.js';
import { AuditAction, AuditCategory, OutComeStatus } from '#root/modules/auditTrails/interfaces/IAuditTrails.js';

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
  for (let i = arr.length; i > 0; i -= chunkSize) {
    const start = Math.max(i - chunkSize, 0);
    const end = i;
    chunks.push(arr.slice(start, end)); // push last slice first
  }
  return chunks;
}


export const startBackgroundProcessing = (
  actor: any,
  auditService: IAuditTrailsService,
  isRequiredAiInitialAnswer: boolean,
  isOutreachQuestion: boolean = false,
  payload: any[],
) => {  if (!payload?.length) return;

  const jobId = Date.now().toString();
  const total = payload.length;
  const job: JobStatus = {
    id: jobId,
    total,
    processed: 0,
    status: 'running',
    startedAt: new Date(),
    logs: [`🚀 Job ${jobId} started with ${total} questions`],
  };
  jobs[jobId] = job;


  const aggregateResults = {
    successIds: [] as string[],
    duplicateCount: 0,
    errors: [] as any[],
  };

  // Determine optimal concurrency
  const cpuCount = os.cpus().length;
  const MAX_WORKERS = Math.min(8, Math.max(2, Math.floor(cpuCount / 2))); // Cap at 8 
  const CHUNK_SIZE = Math.ceil(payload.length / MAX_WORKERS);

  const chunks = chunkArray(payload, CHUNK_SIZE);
  const workerFile = path.join(__dirname, 'questionProcessor.worker.js');

  job.logs.push(
    `🧠 Using ${MAX_WORKERS} workers (chunk size ~${CHUNK_SIZE})`
  );

  let finishedWorkers = 0;
  let isJobFinalized = false;
  let failedWorkers = 0;

  chunks.forEach((chunk, index) => {
    const worker = new Worker(workerFile, {
      workerData: {
        questions: chunk,
        userId: actor.id,
        mongoUri: process.env.DB_URL!,
        dbName: process.env.DB_NAME!,
        isRequiredAiInitialAnswer,
        isOutreachQuestion
      },
    });

    job.logs.push(`🧩 Worker ${index + 1} started for ${chunk.length} questions`);

    // ---- Message handling ----
    worker.on('message', msg => {
      if (msg?.log) job.logs.push(`[Worker ${index + 1}] ${msg.log}`);
      if (msg?.processed !== undefined) {
        job.processed += msg.processed;
      }
      if (msg?.successIds) {
        aggregateResults.successIds.push(...msg.successIds);
      }
      if (msg?.duplicateCount) {
        aggregateResults.duplicateCount += msg.duplicateCount;
      }
      if (msg?.error) {
        aggregateResults.errors.push(msg.error);
      }
    });

    // ---- Error handling ----
    worker.on('error', err => {
      failedWorkers++;
      job.logs.push(`❌ Worker ${index + 1} error: ${err.message}`);
    });

    worker.on('exit', code => {
      finishedWorkers++
      if (code !== 0) {
        failedWorkers++;
        job.logs.push(`⚠️ Worker ${index + 1} exited with code ${code}`);
      } else {
        job.logs.push(`✅ Worker ${index + 1} completed`);
      }

      // When all workers are done
      if (finishedWorkers === chunks.length && !isJobFinalized) {
        isJobFinalized = true; 
        job.finishedAt = new Date();
        job.status = failedWorkers === 0 ? 'completed' : 'failed';
        job.logs.push(
          `🏁 Job finished. Processed ${job.processed}/${job.total}. Failed workers: ${failedWorkers}`
        );
        
        // Create Final Audit Trail
        const auditPayload = {
          category: AuditCategory.QUESTION,
          action: AuditAction.QUESTION_BULK_CREATE,
          actor: actor,
          context: {
            totalUploaded: total,
            createdCount: aggregateResults.successIds.length,
            duplicateCount: aggregateResults.duplicateCount,
            questionId: aggregateResults.successIds, 
            errors: aggregateResults.errors, 
          },
          outcome: {
            status:
              failedWorkers === 0
                ? OutComeStatus.SUCCESS
                : OutComeStatus.PARTIAL,
          },
          createdAt: new Date(),
        };

        auditService.createAuditTrail(auditPayload).catch(err => {
          console.error('Failed to create audit trail for bulk upload:', err);
        });
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
