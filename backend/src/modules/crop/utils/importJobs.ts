import {randomUUID} from 'crypto';
import {CropImportResult} from './importAliases.js';

export interface CropImportSummary {
  results: CropImportResult[];
  created: number;
  updated: number;
  skipped: number;
  failed: number;
}

export interface CropImportJob {
  id: string;
  /** Who started it; only they (or an admin) may read its status. */
  userId: string;
  status: 'running' | 'completed' | 'failed';
  total: number;
  processed: number;
  startedAt: Date;
  finishedAt?: Date;
  result?: CropImportSummary;
  error?: string;
}

/** Finished jobs are kept this long so the client can still collect the result. */
const FINISHED_JOB_TTL_MS = 60 * 60 * 1000;

/**
 * In-memory store for sheet-import jobs, like the existing CSV bulk jobs. Imports run in
 * the background so a large sheet is not cut off by the client's request timeout.
 */
const jobs = new Map<string, CropImportJob>();

/** Drops finished jobs older than the TTL so the map does not grow without bound. */
const pruneFinishedJobs = () => {
  const cutoff = Date.now() - FINISHED_JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.finishedAt && job.finishedAt.getTime() < cutoff) jobs.delete(id);
  }
};

export const createImportJob = (userId: string, total: number): CropImportJob => {
  pruneFinishedJobs();
  const job: CropImportJob = {
    id: randomUUID(),
    userId,
    status: 'running',
    total,
    processed: 0,
    startedAt: new Date(),
  };
  jobs.set(job.id, job);
  return job;
};

export const getImportJob = (id: string): CropImportJob | undefined => jobs.get(id);
