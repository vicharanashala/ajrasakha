import { inject, injectable } from 'inversify';
import { randomUUID } from 'crypto';
import { Storage } from '@google-cloud/storage';
import { BadRequestError, InternalServerError, NotFoundError } from 'routing-controllers';
import { GLOBAL_TYPES } from '#root/types.js';
import { appConfig } from '#root/config/app.js';
import { IMedia, MediaKind } from '#root/shared/interfaces/models.js';
import { IMediaRepository } from '#root/shared/database/interfaces/IMediaRepository.js';
import { IMediaService } from '../interfaces/IMediaService.js';

/**
 * Admin-uploaded public media (carousel images, outreach images, outreach videos).
 *
 * Files live in a dedicated GCS bucket (GCP_MEDIA_BUCKET) — same client/credentials
 * pattern as the DB backup cron (`new Storage({ keyFilename: GOOGLE_APPLICATION_CREDENTIALS })`).
 * Mongo only stores the metadata + the object's `storagePath`, which is what lets an
 * admin delete/replace a file later.
 */
@injectable()
export class MediaService implements IMediaService {
  constructor(
    @inject(GLOBAL_TYPES.MediaRepository)
    private repo: IMediaRepository,
  ) {}

  /** Lazily build the bucket handle so a missing config fails loudly at call time. */
  private getBucket() {
    const bucketName = appConfig.GCP_MEDIA_BUCKET;
    if (!bucketName) {
      throw new InternalServerError(
        'GCP_MEDIA_BUCKET is not configured — set it to the media bucket name.',
      );
    }
    const storage = new Storage({
      // When unset, falls back to Application Default Credentials (e.g. on Cloud Run).
      ...(appConfig.GOOGLE_APPLICATION_CREDENTIALS
        ? { keyFilename: appConfig.GOOGLE_APPLICATION_CREDENTIALS }
        : {}),
    });
    return { bucket: storage.bucket(bucketName), bucketName };
  }

  async list(kind?: MediaKind): Promise<IMedia[]> {
    return this.repo.list(kind);
  }

  async upload({
    kind,
    file,
    title,
    caption,
    userId,
  }: {
    kind: MediaKind;
    file: Express.Multer.File;
    title?: string;
    caption?: string;
    userId: string;
  }): Promise<IMedia> {
    if (!file) throw new BadRequestError('No file provided.');

    const isVideo = file.mimetype.startsWith('video/');
    const isImage = file.mimetype.startsWith('image/');

    // Enforce the right media type per category.
    if (kind === 'outreach_video' && !isVideo) {
      throw new BadRequestError('Outreach video must be a video file.');
    }
    if ((kind === 'carousel' || kind === 'outreach_image') && !isImage) {
      throw new BadRequestError(`${kind} must be an image file.`);
    }

    const { bucket, bucketName } = this.getBucket();

    // Keep the extension so the browser gets a sensible content type / filename.
    const ext = (file.originalname.split('.').pop() || '').toLowerCase();
    const storagePath = `${kind}/${randomUUID()}${ext ? `.${ext}` : ''}`;

    try {
      await bucket.file(storagePath).save(file.buffer, {
        contentType: file.mimetype,
        resumable: false,
        metadata: { cacheControl: 'public, max-age=31536000' },
      });
    } catch (err: any) {
      throw new InternalServerError(`Failed to upload media: ${err?.message}`);
    }

    const url = `https://storage.googleapis.com/${bucketName}/${storagePath}`;
    const order = await this.repo.nextOrder(kind);

    return this.repo.create({
      kind,
      url,
      storagePath,
      mimeType: file.mimetype,
      size: file.size,
      title: title?.trim() || undefined,
      caption: caption?.trim() || undefined,
      order,
      uploadedBy: userId || null,
      createdAt: new Date(),
    });
  }

  /**
   * Mint a v4 signed PUT URL so the browser can upload straight to the bucket. Used for
   * files that exceed the API's request limit (Cloud Run caps inbound requests at 32 MiB,
   * and outreach videos are routinely larger).
   *
   * The client must PUT the bytes with the SAME `Content-Type` header it declared here,
   * or the signature won't match.
   */
  async createUploadUrl({
    kind,
    filename,
    contentType,
  }: {
    kind: MediaKind;
    filename: string;
    contentType: string;
  }): Promise<{ uploadUrl: string; storagePath: string; publicUrl: string }> {
    this.assertTypeMatchesKind(kind, contentType);

    const { bucket, bucketName } = this.getBucket();
    const ext = (filename.split('.').pop() || '').toLowerCase();
    const storagePath = `${kind}/${randomUUID()}${ext ? `.${ext}` : ''}`;

    try {
      const [uploadUrl] = await bucket.file(storagePath).getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        contentType,
      });
      return {
        uploadUrl,
        storagePath,
        publicUrl: `https://storage.googleapis.com/${bucketName}/${storagePath}`,
      };
    } catch (err: any) {
      throw new InternalServerError(`Failed to create upload URL: ${err?.message}`);
    }
  }

  /**
   * Finalise a direct upload: confirm the object really landed in the bucket, then record
   * it using the bucket's own metadata (size/contentType) rather than trusting the client.
   */
  async completeUpload({
    kind,
    storagePath,
    title,
    caption,
    userId,
  }: {
    kind: MediaKind;
    storagePath: string;
    title?: string;
    caption?: string;
    userId: string;
  }): Promise<IMedia> {
    // Never let a client point this at another kind's folder.
    if (!storagePath.startsWith(`${kind}/`)) {
      throw new BadRequestError('storagePath does not belong to this media kind.');
    }

    const { bucket, bucketName } = this.getBucket();
    const file = bucket.file(storagePath);

    const [exists] = await file.exists();
    if (!exists) {
      throw new BadRequestError('Upload not found in the bucket — did the upload finish?');
    }

    const [meta] = await file.getMetadata();
    const mimeType = String(meta.contentType || 'application/octet-stream');
    this.assertTypeMatchesKind(kind, mimeType);

    const order = await this.repo.nextOrder(kind);

    return this.repo.create({
      kind,
      url: `https://storage.googleapis.com/${bucketName}/${storagePath}`,
      storagePath,
      mimeType,
      size: Number(meta.size ?? 0),
      title: title?.trim() || undefined,
      caption: caption?.trim() || undefined,
      order,
      uploadedBy: userId || null,
      createdAt: new Date(),
    });
  }

  /** carousel/outreach_image must be images; outreach_video must be a video. */
  private assertTypeMatchesKind(kind: MediaKind, mimeType: string): void {
    const isVideo = mimeType.startsWith('video/');
    const isImage = mimeType.startsWith('image/');
    if (kind === 'outreach_video' && !isVideo) {
      throw new BadRequestError('Outreach video must be a video file.');
    }
    if ((kind === 'carousel' || kind === 'outreach_image') && !isImage) {
      throw new BadRequestError(`${kind} must be an image file.`);
    }
  }

  async remove(id: string): Promise<boolean> {
    const doc = await this.repo.getById(id);
    if (!doc) throw new NotFoundError('Media not found.');

    // Best-effort object delete — if the file is already gone we still drop the record.
    try {
      const { bucket } = this.getBucket();
      await bucket.file(doc.storagePath).delete({ ignoreNotFound: true });
    } catch (err: any) {
      console.error(`[Media] Failed to delete object ${doc.storagePath}:`, err?.message);
    }

    return this.repo.delete(id);
  }
}
