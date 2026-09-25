import {spawn} from 'child_process';
import {pipeline} from 'stream/promises';
import {MongoClient} from 'mongodb';
import {Bucket, Storage} from '@google-cloud/storage';
// GCS client uses Application Default Credentials (ADC).
// - On Cloud Run Jobs: resolves to the Job's service account automatically.
// - On a VM (legacy): set GOOGLE_APPLICATION_CREDENTIALS env to a key file path.
import {appConfig} from '#root/config/app.js';
import {
  sendBackupFailureEmail,
  sendBackupSuccessEmail,
  sendStatsEmail,
} from './backupEmailService.js';

const getTimestamp = () => {
  const now = new Date();
  return (
    `${String(now.getDate()).padStart(2, '0')}-` +
    `${String(now.getMonth() + 1).padStart(2, '0')}-` +
    `${now.getFullYear()}`
  );
};

const getAllDatabases = async (mongoUri: string) => {
  const client = new MongoClient(mongoUri);

  try {
    await client.connect();

    const admin = client.db().admin();
    const result = await admin.listDatabases();

    await client.close();
    // Return the REAL database names — these are used as the mongodump `--db` target, so
    // they must match what actually exists in the cluster. The display rename
    // (agriai → ajrasakha) is applied only to the output filename.
    return result.databases
      .map(db => db.name)
      .filter(name => !['admin', 'local', 'config'].includes(name));
  } finally {
    await client.close();
  }
};

const doesBackupExist = async (
  bucket: Bucket,
  fileName: string,
): Promise<boolean> => {
  const file = bucket.file(fileName);
  const [exists] = await file.exists();
  return exists;
};

/**
 * Stream `mongodump --archive --gzip` for one database straight into a GCS object.
 *
 * The gzipped archive is piped directly from mongodump's stdout to the bucket's write
 * stream, so nothing is buffered on local disk/tmpfs. This keeps memory ~constant
 * regardless of database size — Cloud Run's /tmp is an in-memory tmpfs, and the previous
 * dump→export→zip-to-/tmp approach filled it and crashed the container with SIGBUS
 * ("Container terminated on signal 7") once the real dataset was large.
 *
 * On any failure the child is killed and the partial object is removed.
 */
const streamDumpToGcs = async (
  mongoUri: string,
  dbName: string,
  bucket: Bucket,
  destName: string,
): Promise<void> => {
  const gcsFile = bucket.file(destName);

  // spawn (no shell) with an args array — avoids shell-injection from the URI and keeps
  // the pipe clean.
  const dump = spawn('mongodump', [
    `--uri=${mongoUri}`,
    `--db=${dbName}`,
    '--archive',
    '--gzip',
  ]);

  let stderr = '';
  dump.stderr.on('data', d => {
    stderr += d.toString();
  });

  // mongodump can exit non-zero AFTER its stdout ends, so track the exit code separately
  // and require it to be 0 — otherwise we'd accept a truncated archive.
  const dumpExit = new Promise<void>((resolve, reject) => {
    dump.once('error', reject); // e.g. mongodump binary not found
    dump.once('close', code =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `mongodump exited with code ${code}: ${stderr.trim().slice(-1000)}`,
            ),
          ),
    );
  });

  try {
    const gcsStream = gcsFile.createWriteStream({
      resumable: true,
      contentType: 'application/gzip',
      metadata: {cacheControl: 'no-cache'},
    });
    // pipeline rejects (and tears down both streams) if either side errors.
    await pipeline(dump.stdout, gcsStream);
    await dumpExit;
  } catch (err) {
    try {
      dump.kill('SIGKILL');
    } catch {
      /* already exited */
    }
    // Remove any partial/incomplete object so a failed run never leaves a truncated backup.
    await gcsFile.delete({ignoreNotFound: true}).catch(() => {});
    throw err;
  }
};

export const createClusterBackup = async (mongoUri: string) => {
  try {
    // Fail fast with a clear message when the connection string is missing. Without this,
    // `new MongoClient(null)` throws the cryptic "Cannot read properties of null (reading
    // 'startsWith')" from the driver's URI parser — which is what a missing DB_URL env var
    // on the backup Cloud Run Job produces.
    if (!mongoUri || typeof mongoUri !== 'string') {
      throw new Error(
        'DB_URL is not set for the backup job — the MongoDB connection string is missing. ' +
          'Set DB_URL on the backup-db Cloud Run Job environment.',
      );
    }
    if (!appConfig.GCP_BACKUP_BUCKET) {
      throw new Error(
        'GCP_BACKUP_BUCKET is not set for the backup job — cannot upload backups. ' +
          'Set GCP_BACKUP_BUCKET on the backup-db Cloud Run Job environment.',
      );
    }

    const timestamp = getTimestamp();

    // No args: GCS client uses Application Default Credentials.
    // On Cloud Run Jobs → resolves to the Job's service account.
    // On a VM → picks up GOOGLE_APPLICATION_CREDENTIALS env var if set.
    const storage = new Storage();

    const bucketName = appConfig.GCP_BACKUP_BUCKET;
    const bucket = storage.bucket(bucketName);

    console.log('🔍 Fetching all databases...');
    const ALL_DBS = await getAllDatabases(mongoUri);
    console.log('📦 Databases found:', ALL_DBS);

    const results: any[] = [];

    for (const dbName of ALL_DBS) {
      try {
        console.log(`\n➡️ Processing DB: ${dbName}`);

        // Real DB name (dbName) is the dump target; only the output filename uses the
        // display name (agriai → ajrasakha).
        const displayName = dbName === 'agriai' ? 'ajrasakha' : dbName;
        const fileName = `${displayName}__${timestamp}.archive.gz`;

        // Skip if already exists (a run on the same day won't overwrite).
        if (await doesBackupExist(bucket, fileName)) {
          console.log(`⚠️ Backup already exists for ${dbName}, skipping...`);
          results.push({db: dbName, status: 'Already exists', timestamp});
          continue;
        }

        console.log(
          `🔄 Streaming mongodump --archive --gzip → gs://${bucketName}/${fileName} ...`,
        );
        await streamDumpToGcs(mongoUri, dbName, bucket, fileName);

        const publicUrl = `https://console.cloud.google.com/storage/browser/_details/${bucketName}/${fileName}`;
        console.log(`☁️ Backup uploaded to: gs://${bucketName}/${fileName}`);
        results.push({db: dbName, publicUrl, status: 'success', timestamp});
      } catch (err) {
        console.error(`❌ Failed DB: ${dbName}`, err);
        results.push({
          db: dbName,
          publicUrl: null,
          status: 'failed',
          timestamp,
          error: err,
        });
        continue;
      }
    }

    console.log('\n📊 Backup Summary:', results);
    results.forEach(r => {
      if (r.status === 'Already exists') {
        const displayName = r.db === 'agriai' ? 'ajrasakha' : r.db;
        r.publicUrl = `https://console.cloud.google.com/storage/browser/_details/${bucketName}/${displayName}__${timestamp}.archive.gz`;
      }
    });
    const hour = new Date().getHours();
    if (hour > 12) {
      await sendBackupSuccessEmail(results);
    }
    console.log('📧 Sending daily stats email...');
    await sendStatsEmail();
  } catch (err) {
    await sendBackupFailureEmail('Cluster Backup', err);
    console.error('Unexpected error in backup process:', err);
    throw err;
  }
};
