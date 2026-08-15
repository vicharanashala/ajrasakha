import { env } from '#root/utils/env.js';
import path from 'path';

export const storageConfig = {
  googleCloud: {
    projectId: env('GCLOUD_PROJECT'),
    anomalyBucketName: env('GOOGLE_ANOMALY_BUCKET') || 'vibe-anomaly-data',
    facesBucketName: env('GOOGLE_FACES_BUCKET') || 'vibe-faces-data',
    aiServerBucketName: env('GOOGLE_AI_SERVER_BUCKET') || 'vibe-aiserver-data',
    documentsBucketName:
      env('GOOGLE_DOCUMENTS_BUCKET') || 'vibe-documents-data',
  },
  documents: {
    /** Local directory used when GCS is not configured. */
    localDir: env('DOCUMENTS_STORAGE_DIR') || path.resolve('uploads/documents'),
  },
  encryption: {
    mediaEncryptionKey: env('MEDIA_ENCRYPTION_KEY'),
  },
};
