import {Readable} from 'stream';
import {IPendingPopUpload} from '#root/shared/interfaces/models.js';

export interface IPendingPopUploadRepository {
  /** Streams `buffer` into GridFS and inserts the tracking doc as `status: 'received'`,
   *  returning the inserted doc. */
  create(
    doc: Omit<IPendingPopUpload, '_id' | 'gridfsFileId' | 'status' | 'attempts' | 'createdAt' | 'updatedAt'>,
    buffer: Buffer,
  ): Promise<IPendingPopUpload>;

  /** All of this uploader's pending/recent uploads, newest first. */
  findByUploader(uploaderId: string): Promise<IPendingPopUpload[]>;

  /** Same-sha256 pre-check against OUR OWN queue, any status — mirrors PoP's own
   *  no-status-filter dedup check, scoped to this uploader only (not a global lock). */
  findByUploaderAndSha256(uploaderId: string, sha256: string): Promise<IPendingPopUpload | null>;

  /** Atomically claims the oldest `received` doc (FIFO), flipping it to `processing` so no
   *  other instance picks it up too. Null when the queue is empty. */
  claimNext(): Promise<IPendingPopUpload | null>;

  /** Reads the claimed file's bytes back out of GridFS. */
  readFile(gridfsFileId: IPendingPopUpload['gridfsFileId']): Promise<Readable>;

  markSucceeded(id: string): Promise<void>;

  markFailed(id: string, error: string): Promise<void>;

  incrementAttempts(id: string): Promise<void>;

  /** Deletes the GridFS bytes once they're no longer needed (succeeded, or permanently failed). */
  deleteFile(gridfsFileId: IPendingPopUpload['gridfsFileId']): Promise<void>;

  /** Boot-time recovery: anything left `processing` (an instance died mid-work) goes back to
   *  `received` so a fresh claim can pick it up. */
  resetStuckProcessing(): Promise<void>;
}
