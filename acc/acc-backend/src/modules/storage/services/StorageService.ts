import { injectable } from 'inversify';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { appConfig } from '#root/config/app.js';
import { getFirebaseStorage } from '#root/config/firebaseAdmin.js';

export interface UploadResult {
  storagePath: string;
  size: number;
}

/**
 * Downloads a media stream from a remote URL using native Node 20 web fetch
 * matching browser HTTP behaviors and automatically following cross-origin CDN redirects.
 */
async function fetchRemoteStream(
  url: string,
  auth?: { user: string; pass: string }
): Promise<Readable> {
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,audio/mpeg,audio/*,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
  };

  if (auth && auth.user && auth.pass && url.includes('plivo.com')) {
    const basicAuth = Buffer.from(`${auth.user}:${auth.pass}`).toString('base64');
    headers['Authorization'] = `Basic ${basicAuth}`;
  }

  const res = await fetch(url, {
    method: 'GET',
    headers,
    redirect: 'follow',
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${bodyText.slice(0, 300)}`);
  }

  if (!res.body) {
    throw new Error('Empty response body received from server');
  }

  return Readable.fromWeb(res.body as any);
}

@injectable()
export class StorageService {
  private bucketName: string;

  constructor() {
    this.bucketName = appConfig.firebase.storageBucket || 'annam-call-recordings';
  }

  private getBucket() {
    const storage = getFirebaseStorage();
    return storage.bucket(this.bucketName);
  }

  /**
   * Streams audio/media directly from a remote URL (e.g. Plivo RecordUrl)
   * into Google Cloud Storage or Firebase Storage Emulator.
   * Zero memory buffering using Node.js stream pipeline.
   */
  async uploadStreamFromUrl(
    sourceUrl: string,
    destinationPath: string,
    auth?: { user: string; pass: string },
    contentType: string = 'audio/mpeg'
  ): Promise<UploadResult> {
    console.log(`[STORAGE-SERVICE] Initiating media download from ${sourceUrl}`);

    const candidateUrls: { url: string; auth?: { user: string; pass: string } }[] = [];

    // Candidate 1: Direct URL without Auth (same as browser navigation)
    candidateUrls.push({ url: sourceUrl });

    // Candidate 2: Direct URL with Auth
    if (auth && auth.user && auth.pass) {
      candidateUrls.push({ url: sourceUrl, auth });
    }

    // Candidate 3: Alternative media.plivo.com domain
    if (sourceUrl.includes('aps1.media.plivo.com')) {
      const globalMediaUrl = sourceUrl.replace('aps1.media.plivo.com', 'media.plivo.com');
      candidateUrls.push({ url: globalMediaUrl });
      if (auth && auth.user && auth.pass) {
        candidateUrls.push({ url: globalMediaUrl, auth });
      }
    }

    let stream: Readable | null = null;
    let lastError: any = null;

    // 3 attempts strictly after call ends with 10-second gap between each attempt
    const MAX_ATTEMPTS = 3;
    const RETRY_DELAY_MS = 10000; // 10 seconds

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      console.log(`⏳ [STORAGE-SERVICE] Attempt ${attempt}/${MAX_ATTEMPTS}: Waiting 10 seconds after call ends for Plivo MP3 transcoding...`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));

      for (const candidate of candidateUrls) {
        try {
          console.log(`[STORAGE-SERVICE] Attempt ${attempt}/${MAX_ATTEMPTS} trying candidate: ${candidate.url} (auth: ${Boolean(candidate.auth)})`);
          stream = await fetchRemoteStream(candidate.url, candidate.auth);
          if (stream) {
            console.log(`✅ [STORAGE-SERVICE] Media stream connected successfully on attempt ${attempt}.`);
            break;
          }
        } catch (err: any) {
          lastError = err;
          console.warn(`⚠️ [STORAGE-SERVICE] Attempt ${attempt} candidate failed: ${err.message}.`);
        }
      }

      if (stream) break;
      if (attempt < MAX_ATTEMPTS) {
        console.log(`⚠️ [STORAGE-SERVICE] Attempt ${attempt} failed. Retrying in 10 seconds (attempt ${attempt + 1}/${MAX_ATTEMPTS})...`);
      }
    }

    if (!stream) {
      console.error(`❌ [STORAGE-SERVICE] All 3 download attempts (with 10s intervals) failed for ${sourceUrl}:`, lastError?.message || lastError);
      throw lastError || new Error('Failed to stream audio from remote URL after 3 attempts');
    }





    // Try uploading to GCS Bucket / Firebase Storage Emulator
    try {
      const bucket = this.getBucket();
      const file = bucket.file(destinationPath);

      const writeStream = file.createWriteStream({
        metadata: {
          contentType,
          metadata: {
            uploadedAt: new Date().toISOString(),
            sourceUrl,
          },
        },
        resumable: false,
      });

      await pipeline(stream, writeStream);

      const [metadata] = await file.getMetadata();
      const size = Number(metadata.size) || 0;

      console.log(`✅ [STORAGE-SERVICE] Successfully uploaded ${destinationPath} (${size} bytes) to storage bucket.`);

      return {
        storagePath: destinationPath,
        size,
      };
    } catch (gcsError: any) {
      console.warn(`⚠️ [STORAGE-SERVICE] Storage bucket upload failed (${gcsError.message}). Saving to local uploads folder fallback...`);

      // Fallback: Save to local filesystem in development
      const fs = await import('fs');
      const path = await import('path');
      const localFilePath = path.join(process.cwd(), 'uploads', destinationPath);
      const localDir = path.dirname(localFilePath);
      fs.mkdirSync(localDir, { recursive: true });

      const localWriteStream = fs.createWriteStream(localFilePath);
      await pipeline(stream, localWriteStream);


      const stats = fs.statSync(localFilePath);
      console.log(`✅ [STORAGE-SERVICE] Saved ${destinationPath} (${stats.size} bytes) to local uploads fallback.`);

      return {
        storagePath: destinationPath,
        size: stats.size,
      };
    }
  }

  /**
   * Uploads a Buffer directly to GCS/Emulator
   */
  async uploadBuffer(
    buffer: Buffer,
    destinationPath: string,
    contentType: string = 'audio/mpeg'
  ): Promise<UploadResult> {
    try {
      const bucket = this.getBucket();
      const file = bucket.file(destinationPath);

      await file.save(buffer, {
        metadata: {
          contentType,
          metadata: {
            uploadedAt: new Date().toISOString(),
          },
        },
        resumable: false,
      });

      return {
        storagePath: destinationPath,
        size: buffer.length,
      };
    } catch (err: any) {
      const fs = await import('fs');
      const path = await import('path');
      const localFilePath = path.join(process.cwd(), 'uploads', destinationPath);
      const localDir = path.dirname(localFilePath);
      fs.mkdirSync(localDir, { recursive: true });
      fs.writeFileSync(localFilePath, buffer);

      return {
        storagePath: destinationPath,
        size: buffer.length,
      };
    }
  }

  /**
   * Generates a temporary, authenticated playback URL.
   * In local fallback/emulator mode: returns direct HTTP media endpoint.
   * In production mode: returns 15-minute V4 Signed URL.
   */
  async getSignedPlaybackUrl(storagePath: string, expiresInMinutes: number = 15): Promise<string> {
    const fs = await import('fs');
    const path = await import('path');
    const localFilePath = path.join(process.cwd(), 'uploads', storagePath);

    // If file exists in local uploads directory fallback, serve from backend endpoint
    if (fs.existsSync(localFilePath)) {
      const backendUrl = appConfig.url || `http://localhost:${appConfig.port}`;
      return `${backendUrl}/api/plivo/recordings/local?path=${encodeURIComponent(storagePath)}`;
    }

    const emulatorHost =
      process.env.FIREBASE_STORAGE_EMULATOR_HOST ||
      process.env.STORAGE_EMULATOR_HOST;

    if (emulatorHost) {
      const cleanHost = emulatorHost.replace(/^http:\/\//, '');
      const encodedPath = encodeURIComponent(storagePath);
      return `http://${cleanHost}/v0/b/${this.bucketName}/o/${encodedPath}?alt=media`;
    }

    try {
      const bucket = this.getBucket();
      const file = bucket.file(storagePath);
      const expiresAt = Date.now() + expiresInMinutes * 60 * 1000;
      const [signedUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: expiresAt,
      });
      return signedUrl;
    } catch (err) {
      const backendUrl = appConfig.url || `http://localhost:${appConfig.port}`;
      return `${backendUrl}/api/plivo/recordings/local?path=${encodeURIComponent(storagePath)}`;
    }

  }


  /**
   * Deletes a file from the bucket
   */
  async deleteFile(storagePath: string): Promise<boolean> {
    try {
      const bucket = this.getBucket();
      const file = bucket.file(storagePath);
      await file.delete({ ignoreNotFound: true });
      console.log(`🗑️ [STORAGE-SERVICE] Deleted file: gs://${this.bucketName}/${storagePath}`);
      return true;
    } catch (err: any) {
      console.error(`❌ [STORAGE-SERVICE] Failed to delete ${storagePath}:`, err.message || err);
      return false;
    }
  }

  /**
   * Checks if a file exists in the bucket and returns its size
   */
  async fileExists(storagePath: string): Promise<{ exists: boolean; size?: number }> {
    try {
      const bucket = this.getBucket();
      const file = bucket.file(storagePath);
      const [exists] = await file.exists();
      if (!exists) return { exists: false };

      const [metadata] = await file.getMetadata();
      return {
        exists: true,
        size: Number(metadata.size) || 0,
      };
    } catch (err) {
      return { exists: false };
    }
  }
}
