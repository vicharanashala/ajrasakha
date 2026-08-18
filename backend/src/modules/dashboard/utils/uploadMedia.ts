import {randomUUID} from 'node:crypto';
import {Storage} from '@google-cloud/storage';
import {BadRequestError, InternalServerError} from 'routing-controllers';
import {appConfig} from '#root/config/app.js';

/**
 * Storage backend is environment-based, with the SAME upload/download code in both:
 *   • local development → Firebase Storage emulator (default http://127.0.0.1:9199)
 *   • staging / production → real Google Cloud Storage bucket
 *
 * The emulator is used whenever we are NOT in production/staging. Its host defaults to
 * 127.0.0.1:9199 but can be overridden with STORAGE_EMULATOR_HOST. The
 * @google-cloud/storage client understands this env var natively, so we also export it
 * to process.env so the SDK skips real credentials and talks to the emulator.
 */
const useEmulator = !appConfig.isProduction && !appConfig.isStaging;
const emulatorHost = useEmulator
  ? (process.env.STORAGE_EMULATOR_HOST || 'http://127.0.0.1:9199').replace(/\/$/, '')
  : undefined;
if (emulatorHost) {
  // Ensure the GCS client enters emulator mode (skips ADC) even if the env var
  // wasn't set explicitly in .env.
  process.env.STORAGE_EMULATOR_HOST = emulatorHost;
}

/** Lazily-created GCS client. In production it uses Application Default Credentials
 *  (or GOOGLE_APPLICATION_CREDENTIALS on a VM). Against the emulator it needs no real
 *  credentials — just a projectId — and talks to the emulator's API endpoint. */
let storage: Storage | null = null;
const getStorage = (): Storage =>
  (storage ??= new Storage(
    emulatorHost
      ? {
          apiEndpoint: emulatorHost,
          projectId:
            process.env.GCLOUD_PROJECT ||
            appConfig.firebase.projectId ||
            'demo-ajrasakha',
        }
      : {},
  ));

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
    // and the standard public URL below still works. The emulator ignores ACLs
    // (access is governed by storage.rules), so this is a harmless no-op there.
    try {
      await gcsFile.makePublic();
    } catch {
      /* uniform bucket-level access / emulator — rely on bucket-level public IAM */
    }

    // Development → Firebase Storage emulator download URL; production → the public
    // GCS URL. Both point at the object we just wrote.
    if (emulatorHost) {
      return `${emulatorHost}/v0/b/${bucketName}/o/${encodeURIComponent(
        objectName,
      )}?alt=media`;
    }
    return `https://storage.googleapis.com/${bucketName}/${objectName}`;
  } catch (error) {
    throw new InternalServerError(
      `Failed to upload media to bucket ${bucketName}: ${error}`,
    );
  }
}
