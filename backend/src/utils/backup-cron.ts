import {spawn} from 'child_process';
import archiver from 'archiver';
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
    // Return the REAL database names — used as the mongoexport/mongodump `--db` target, so
    // they must match what actually exists. The display rename (agriai → ajrasakha) is
    // applied only to the output filename.
    return result.databases
      .map(db => db.name)
      .filter(name => !['admin', 'local', 'config'].includes(name));
  } finally {
    await client.close();
  }
};

const getCollectionsFromDB = async (mongoUri: string, dbName: string) => {
  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    const collections = await client.db(dbName).listCollections().toArray();
    return collections.map(c => c.name);
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
 * Append one collection's `mongoexport` (extended-JSON array) into the zip as a streamed
 * entry, and resolve only when that collection has been fully written. Sequential per
 * collection (the caller awaits this) so only ONE mongoexport runs at a time — keeping
 * memory ~constant. mongoexport streams to stdout, archiver deflates on the fly, and GCS
 * back-pressures the whole chain, so nothing is buffered on disk/tmpfs.
 */
const appendCollectionJson = (
  archive: archiver.Archiver,
  mongoUri: string,
  dbName: string,
  col: string,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const proc = spawn('mongoexport', [
      `--uri=${mongoUri}`,
      `--db=${dbName}`,
      `--collection=${col}`,
      '--jsonArray',
    ]);

    let stderr = '';
    proc.stderr.on('data', d => {
      stderr += d.toString();
    });
    proc.once('error', reject); // mongoexport binary missing, etc.
    proc.once('close', code =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `mongoexport ${dbName}.${col} exited ${code}: ${stderr.trim().slice(-500)}`,
            ),
          ),
    );

    // Stream stdout straight into the zip as json_backup/<collection>.json.
    archive.append(proc.stdout, {name: `json_backup/${col}.json`});
  });

/**
 * Build a browsable ZIP for one database — a `json_backup/<collection>.json` file per
 * collection — and stream it directly into a GCS object. Nothing is written to local
 * disk/tmpfs (which on Cloud Run is in-memory), so memory stays ~constant regardless of
 * database size. On any failure the partial object is removed.
 */
const streamZipToGcs = async (
  mongoUri: string,
  dbName: string,
  bucket: Bucket,
  destName: string,
): Promise<void> => {
  const gcsFile = bucket.file(destName);
  const gcsStream = gcsFile.createWriteStream({
    resumable: true,
    contentType: 'application/zip',
    metadata: {cacheControl: 'no-cache'},
  });
  const archive = archiver('zip', {zlib: {level: 6}});

  // Resolve when the whole zip has been flushed to GCS; reject on any stream error.
  const done = new Promise<void>((resolve, reject) => {
    gcsStream.once('finish', resolve);
    gcsStream.once('error', reject);
    archive.once('error', reject);
    archive.once('warning', w =>
      (w as any)?.code === 'ENOENT' ? undefined : reject(w),
    );
  });

  archive.pipe(gcsStream);

  try {
    const collections = await getCollectionsFromDB(mongoUri, dbName);
    // Sequential: one collection's mongoexport at a time (bounded memory).
    for (const col of collections) {
      console.log(`  📄 Exporting ${col} ...`);
      await appendCollectionJson(archive, mongoUri, dbName, col);
    }
    await archive.finalize();
    await done;
  } catch (err) {
    try {
      archive.abort();
    } catch {
      /* already ended */
    }
    // Remove any partial/incomplete object.
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

        // Real DB name (dbName) is the export target; only the output filename uses the
        // display name (agriai → ajrasakha).
        const displayName = dbName === 'agriai' ? 'ajrasakha' : dbName;
        const fileName = `${displayName}__${timestamp}.zip`;

        // Skip if already exists (a run on the same day won't overwrite).
        if (await doesBackupExist(bucket, fileName)) {
          console.log(`⚠️ Backup already exists for ${dbName}, skipping...`);
          results.push({db: dbName, status: 'Already exists', timestamp});
          continue;
        }

        console.log(`🔄 Streaming ZIP → gs://${bucketName}/${fileName} ...`);
        await streamZipToGcs(mongoUri, dbName, bucket, fileName);

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
        r.publicUrl = `https://console.cloud.google.com/storage/browser/_details/${bucketName}/${displayName}__${timestamp}.zip`;
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
