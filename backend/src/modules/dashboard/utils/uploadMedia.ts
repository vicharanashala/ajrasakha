import {randomUUID} from 'node:crypto';
import {Storage} from '@google-cloud/storage';
import {BadRequestError, InternalServerError} from 'routing-controllers';
import {appConfig} from '#root/config/app.js';

/** Lazily-created GCS client. Uses Application Default Credentials (or
 *  GOOGLE_APPLICATION_CREDENTIALS on a VM), same as the backup util. */
let storage: Storage | null = null;
const getStorage = (): Storage => (storage ??= new Storage());

/**
 * Upload an outreach media file (image/video) to the public-dashboard media bucket and
 * return its public URL. Objects are namespaced by kind under `public-dashboard/`.
 */
export async function uploadPublicDashboardMedia(
  file: Express.Multer.File,
  kind: 'image' | 'video',
): Promise<string> {
  const bucketName = appConfig.GCP_MEDIA_BUCKET;
  if (!bucketName) {
    throw new InternalServerError(
      'GCP_MEDIA_BUCKET is not configured — cannot upload media.',
    );
  }
  if (!file?.buffer) {
    throw new BadRequestError('No file provided');
  }

  const ext = (file.originalname.split('.').pop() || '').toLowerCase();
  const objectName = `public-dashboard/${kind}s/${randomUUID()}${
    ext ? `.${ext}` : ''
  }`;

  const bucket = getStorage().bucket(bucketName);
  const gcsFile = bucket.file(objectName);

  try {
    await gcsFile.save(file.buffer, {
      contentType: file.mimetype,
      resumable: false,
      metadata: {cacheControl: 'public, max-age=31536000'},
    });

    // Best-effort public read. Buckets with uniform bucket-level access reject
    // per-object ACLs — in that case the bucket must grant allUsers read via IAM,
    // and the standard public URL below still works.
    try {
      await gcsFile.makePublic();
    } catch {
      /* uniform bucket-level access — rely on bucket-level public IAM */
    }

    return `https://storage.googleapis.com/${bucketName}/${objectName}`;
  } catch (error) {
    throw new InternalServerError(
      `Failed to upload media to bucket ${bucketName}: ${error}`,
    );
  }
}
