import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import { IAuditTrailsService } from '#root/modules/auditTrails/interfaces/IAuditTrailsService.js';
import { AuditAction, AuditCategory, OutComeStatus } from '#root/modules/auditTrails/interfaces/IAuditTrails.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface CropJobStatus {
  id: string;
  totalRows: number;
  totalCrops: number; // unique crop groups after deduplication
  processed: number;
  created: number;
  updated: number;
  status: 'running' | 'completed' | 'failed';
  startedAt: Date;
  finishedAt?: Date;
  logs: string[];
  errors: string[];
}

const cropJobs: Record<string, CropJobStatus> = {};

export const startCropBulkProcessing = (
  rows: any[],
  userId: string,
  actor: any,
  auditService: IAuditTrailsService,
): string => {
  const jobId = Date.now().toString();

  const job: CropJobStatus = {
    id: jobId,
    totalRows: rows.length,
    totalCrops: 0,
    processed: 0,
    created: 0,
    updated: 0,
    status: 'running',
    startedAt: new Date(),
    logs: [`🚀 Crop bulk job started with ${rows.length} CSV rows`],
    errors: [],
  };
  cropJobs[jobId] = job;

  const workerFile = path.join(__dirname, 'cropBulkProcessor.worker.js');

  const worker = new Worker(workerFile, {
    workerData: {
      rows,
      userId,
      mongoUri: process.env.DB_URL!,
      dbName: process.env.DB_NAME!,
    },
  });

  worker.on('message', msg => {
    if (msg?.processed !== undefined) {
      job.processed += msg.processed;
    }
    if (msg?.error) {
      job.errors.push(msg.error);
    }
    if (msg?.log) {
      job.logs.push(msg.log);
    }
    if (msg?.success === true) {
      job.created = msg.created ?? 0;
      job.updated = msg.updated ?? 0;
      job.logs.push(
        `✅ Done: ${msg.created} crops created, ${msg.updated} updated, ${msg.errors?.length ?? 0} errors`,
      );
    }
  });

  worker.on('error', err => {
    job.logs.push(`❌ Worker error: ${err.message}`);
    job.status = 'failed';
    job.finishedAt = new Date();
  });

  worker.on('exit', code => {
    job.finishedAt = new Date();
    job.status = code === 0 ? 'completed' : 'failed';
    job.logs.push(`🏁 Job finished with exit code ${code}`);

    auditService
      .createAuditTrail({
        category: AuditCategory.CROP_MANAGEMENT,
        action: AuditAction.CROP_BULK_CREATE,
        actor,
        context: {
          totalRows: rows.length,
          created: job.created,
          updated: job.updated,
          errors: job.errors,
        },
        outcome: {
          status: code === 0 ? OutComeStatus.SUCCESS : OutComeStatus.FAILED,
        },
        createdAt: new Date(),
      })
      .catch(err => console.error('Failed to create audit trail for crop bulk upload:', err));
  });

  return jobId;
};

export const getCropBulkJobById = (jobId: string): CropJobStatus | undefined =>
  cropJobs[jobId];

export const getCropBulkJobs = (): CropJobStatus[] => Object.values(cropJobs);

// ── Chemical bulk processing ──────────────────────────────────────────────────

export const startChemicalBulkProcessing = (
  rows: any[],
  userId: string,
  actor: any,
  auditService: IAuditTrailsService,
): string => {
  const jobId = Date.now().toString();

  const job: CropJobStatus = {
    id: jobId,
    totalRows: rows.length,
    totalCrops: 0,
    processed: 0,
    created: 0,
    updated: 0,
    status: 'running',
    startedAt: new Date(),
    logs: [`🚀 Chemical bulk job started with ${rows.length} CSV rows`],
    errors: [],
  };
  cropJobs[jobId] = job;

  const workerFile = path.join(__dirname, 'chemicalBulkProcessor.worker.js');

  const worker = new Worker(workerFile, {
    workerData: {
      rows,
      userId,
      mongoUri: process.env.DB_URL!,
      dbName: process.env.DB_NAME!,
    },
  });

  worker.on('message', msg => {
    if (msg?.processed !== undefined) job.processed += msg.processed;
    if (msg?.error) job.errors.push(msg.error);
    if (msg?.log) job.logs.push(msg.log);
    if (msg?.success === true) {
      job.created = msg.created ?? 0;
      job.updated = msg.updated ?? 0;
      job.logs.push(
        `✅ Done: ${msg.created} chemicals created, ${msg.updated} updated, ${msg.errors?.length ?? 0} errors`,
      );
    }
  });

  worker.on('error', err => {
    job.logs.push(`❌ Worker error: ${err.message}`);
    job.status = 'failed';
    job.finishedAt = new Date();
  });

  worker.on('exit', code => {
    job.finishedAt = new Date();
    job.status = code === 0 ? 'completed' : 'failed';
    job.logs.push(`🏁 Chemical bulk job finished with exit code ${code}`);

    auditService
      .createAuditTrail({
        category: AuditCategory.CROP_MANAGEMENT,
        action: AuditAction.CROP_BULK_CREATE,
        actor,
        context: {
          type: 'chemical',
          totalRows: rows.length,
          created: job.created,
          updated: job.updated,
          errors: job.errors,
        },
        outcome: {
          status: code === 0 ? OutComeStatus.SUCCESS : OutComeStatus.FAILED,
        },
        createdAt: new Date(),
      })
      .catch(err => console.error('Failed to create audit trail for chemical bulk upload:', err));
  });

  return jobId;
};
