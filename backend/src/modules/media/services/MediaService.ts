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
  // How long a served read URL stays valid. 7 days is the v4 maximum — long-lived so a
  // dashboard tab left open, or a browser-cached list, doesn't end up with dead image links
  // before the next fetch re-signs them.
  private static readonly READ_URL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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
    const items = await this.repo.list(kind);

    // The public dashboard is unauthenticated, so it can only load an image if the object is
    // reachable without a login. Rather than depend on the bucket being world-readable
    // (which Public Access Prevention / Uniform Bucket-Level Access can forbid), each object's
    // `url` is swapped for a short-lived v4 signed READ url that anyone can fetch. The stored
    // `url` in Mongo is left as-is; this only affects what we hand out.
    return Promise.all(
      items.map(async item => {
        // YouTube items have no GCS object — keep their watch URL untouched.
        // External items (YouTube, image links) carry their URL directly — nothing to sign.
        if (item.source === 'youtube' || item.source === 'link' || !item.storagePath) {
          return item;
        }
        return {
          ...item,
          url: await this.signReadUrl(item.storagePath).catch(() => item.url),
        };
      }),
    );
  }

  /** A v4 signed URL that grants anonymous read of one object for READ_URL_TTL_MS. */
  private async signReadUrl(storagePath: string): Promise<string> {
    const { bucket } = this.getBucket();
    const [url] = await bucket.file(storagePath).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + MediaService.READ_URL_TTL_MS,
    });
    return url;
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
   * `content-type` is deliberately NOT signed. Signing it forces the browser's PUT to send
   * a byte-identical Content-Type, and any discrepancy — a file with an empty MIME type, or
   * a CORS/redirect hop that drops the header — makes GCS reject the upload with
   * "MalformedSecurityHeader: content-type was included in signedheaders, but not in the
   * request." We still validate the declared type here (assertTypeMatchesKind), and finalise
   * re-reads the actual content type from the stored object, so nothing is lost by leaving
   * it out of the signature.
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

  /**
   * Register a YouTube video as an outreach item. No file/GCS — we store the watch URL and
   * the parsed video id, which the frontend turns into an embed.
   */
  async addYoutube({
    url,
    title,
    caption,
    userId,
  }: {
    url: string;
    title?: string;
    caption?: string;
    userId: string;
  }): Promise<IMedia> {
    const youtubeId = parseYoutubeId(url);
    if (!youtubeId) {
      throw new BadRequestError('Not a valid YouTube URL.');
    }

    const order = await this.repo.nextOrder('outreach_video');

    return this.repo.create({
      kind: 'outreach_video',
      source: 'youtube',
      url: `https://www.youtube.com/watch?v=${youtubeId}`,
      youtubeId,
      title: title?.trim() || undefined,
      caption: caption?.trim() || undefined,
      order,
      uploadedBy: userId || null,
      createdAt: new Date(),
    });
  }

  /**
   * Register an EXTERNAL image by URL — for carousel and outreach images, the counterpart to
   * addYoutube. No file/GCS: we store the link as-is (the frontend renders it directly).
   */
  async addImageLink({
    kind,
    url,
    title,
    caption,
    userId,
  }: {
    kind: MediaKind;
    url: string;
    title?: string;
    caption?: string;
    userId: string;
  }): Promise<IMedia> {
    if (kind === 'outreach_video') {
      throw new BadRequestError('Image links apply to carousel and outreach images only.');
    }
    const trimmed = (url || '').trim();
    if (!isHttpUrl(trimmed)) {
      throw new BadRequestError('Provide a valid http(s) image URL.');
    }

    const order = await this.repo.nextOrder(kind);

    return this.repo.create({
      kind,
      source: 'link',
      url: trimmed,
      title: title?.trim() || undefined,
      caption: caption?.trim() || undefined,
      order,
      uploadedBy: userId || null,
      createdAt: new Date(),
    });
  }

  async remove(id: string): Promise<boolean> {
    const doc = await this.repo.getById(id);
    if (!doc) throw new NotFoundError('Media not found.');

    // Uploaded files have a GCS object to remove; YouTube items don't. Best-effort — if the
    // object is already gone we still drop the record.
    if (doc.storagePath) {
      try {
        const { bucket } = this.getBucket();
        await bucket.file(doc.storagePath).delete({ ignoreNotFound: true });
      } catch (err: any) {
        console.error(`[Media] Failed to delete object ${doc.storagePath}:`, err?.message);
      }
    }

    return this.repo.delete(id);
  }
}

/** True for a well-formed http(s) URL — used to validate external image links. */
function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Extract the 11-char video id from any common YouTube URL form:
 * youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID, /shorts/ID, or a bare id.
 */
function parseYoutubeId(input: string): string | null {
  const s = (input || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s; // already a bare id

  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      const id = u.pathname.slice(1);
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host.endsWith('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
      const m = u.pathname.match(/\/(embed|shorts|v)\/([A-Za-z0-9_-]{11})/);
      if (m) return m[2];
    }
  } catch {
    // not a URL
  }
  return null;
}
