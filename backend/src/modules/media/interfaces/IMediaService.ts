import { IMedia, MediaKind } from '#root/shared/interfaces/models.js';

export interface IMediaService {
  /** Public list, optionally filtered by kind. */
  list(kind?: MediaKind): Promise<IMedia[]>;

  /** Small files only (≤31 MB): upload through the API and record it. */
  upload(params: {
    kind: MediaKind;
    file: Express.Multer.File;
    title?: string;
    caption?: string;
    userId: string;
  }): Promise<IMedia>;

  /**
   * Large files (e.g. 40 MB+ outreach videos): mint a short-lived signed PUT URL so the
   * browser uploads straight to the bucket, bypassing the API's request-size limit.
   */
  createUploadUrl(params: {
    kind: MediaKind;
    filename: string;
    contentType: string;
  }): Promise<{ uploadUrl: string; storagePath: string; publicUrl: string }>;

  /** Called after a direct upload finishes — verifies the object and records it. */
  completeUpload(params: {
    kind: MediaKind;
    storagePath: string;
    title?: string;
    caption?: string;
    userId: string;
  }): Promise<IMedia>;

  /** Register a YouTube video as an outreach item (no file — just the URL). */
  addYoutube(params: {
    url: string;
    title?: string;
    caption?: string;
    userId: string;
  }): Promise<IMedia>;

  /** Register an external image by URL (carousel / outreach image — no file). */
  addImageLink(params: {
    kind: MediaKind;
    url: string;
    title?: string;
    caption?: string;
    userId: string;
  }): Promise<IMedia>;

  /** Delete the object from the bucket (if any) AND its metadata. */
  remove(id: string): Promise<boolean>;
}
