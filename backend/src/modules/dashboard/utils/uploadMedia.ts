import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
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
} else {
  // Production / staging: the @google-cloud/storage SDK reads STORAGE_EMULATOR_HOST
  // NATIVELY from the environment. If it is set here (e.g. inherited from a dev config),
  // the SDK dials a non-existent emulator and the upload request is destroyed — surfacing
  // as "Cannot call write after a stream was destroyed". Clear it so we talk to real GCS.
  delete process.env.STORAGE_EMULATOR_HOST;
  delete process.env.FIREBASE_STORAGE_EMULATOR_HOST;

  // On Cloud Run the runtime already has an attached service account, so the GCS SDK can
  // use Application Default Credentials with no key file. If GOOGLE_APPLICATION_CREDENTIALS
  // points at a key file that isn't actually present (e.g. a secret mount that didn't
  // happen — "/run/secrets/gcp-service-account.json does not exist"), the SDK throws ENOENT
  // before it ever tries ADC. Drop the dangling path so it falls back to the attached
  // service account's credentials instead of failing every upload.
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (keyPath && !existsSync(keyPath)) {
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }
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
 * Upload any media file to the media bucket under the given object prefix and return its
 * public URL. Works against the Firebase Storage emulator locally and real GCS in
 * staging/production with the SAME code. Reused across verticals (dashboard media, crop
 * images, …) so upload/emulator handling lives in one place.
 */
export async function uploadMediaFile(
  file: Express.Multer.File,
  objectPrefix: string,
  baseName?: string,
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
  const prefix = objectPrefix.replace(/^\/+|\/+$/g, '');
  // Prefix the object with a URL-safe slug of the entry's name (e.g. "tomato-<uuid>.jpg")
  // so the URL is human-readable. The UUID stays for uniqueness — same-named entries never
  // collide or overwrite each other.
  const slug = (baseName || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const objectName = `${prefix}/${slug ? `${slug}-` : ''}${randomUUID()}${ext ? `.${ext}` : ''}`;

  const bucket = getStorage().bucket(bucketName);
  const gcsFile = bucket.file(objectName);

  try {
    // Pipe a Readable built from the buffer into the GCS write stream. This manages the
    // stream lifecycle/backpressure correctly and, on a transport failure (e.g. the storage
    // emulator not running, or an auth/permission error), surfaces the REAL error via
    // pipeline() instead of the misleading "Cannot call write after a stream was destroyed"
    // that gcsFile.save(buffer) / a manual .end(buffer) throw when the request is destroyed.
    const writeStream = gcsFile.createWriteStream({
      contentType: file.mimetype,
      resumable: false,
      metadata: {cacheControl: 'public, max-age=31536000'},
    });
    await pipeline(Readable.from(file.buffer), writeStream);

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

/**
 * Delete a previously-uploaded object from the media bucket, given the public URL that
 * `uploadMediaFile` returned. Handles both URL shapes (real GCS and the Firebase Storage
 * emulator). Best-effort: never throws — a failed cleanup must not fail the caller's update.
 */
export async function deleteMediaByUrl(url: string): Promise<void> {
  const bucketName = appConfig.GCP_MEDIA_BUCKET;
  if (!bucketName || !url) return;
  try {
    let objectName: string | undefined;
    // Emulator: <host>/v0/b/<bucket>/o/<url-encoded object path>?alt=media
    const emuMatch = url.match(/\/o\/([^?]+)/);
    if (emuMatch) {
      objectName = decodeURIComponent(emuMatch[1]);
    } else {
      // Production: https://storage.googleapis.com/<bucket>/<object path>
      const marker = `/${bucketName}/`;
      const idx = url.indexOf(marker);
      if (idx >= 0) objectName = url.slice(idx + marker.length);
    }
    if (!objectName) return;
    await getStorage()
      .bucket(bucketName)
      .file(objectName)
      .delete({ignoreNotFound: true});
  } catch {
    /* best-effort cleanup — orphaned object is preferable to a failed update */
  }
}

/**
 * Upload an outreach media file (image/video) to the public-dashboard media bucket and
 * return its public URL. Objects are namespaced by kind under `public-dashboard/`.
 */
export async function uploadPublicDashboardMedia(
  file: Express.Multer.File,
  kind: 'image' | 'video',
): Promise<string> {
  return uploadMediaFile(file, `public-dashboard/${kind}s`);
}
