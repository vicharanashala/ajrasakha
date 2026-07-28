import {exec} from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
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

export const createClusterBackup = async (mongoUri: string) => {
  try {
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

        const zipFileName = `${dbName}__${timestamp}.zip`;

        // Skip if already exists
        if (await doesBackupExist(bucket, zipFileName)) {
          console.log(`⚠️ Backup already exists for ${dbName}, skipping...`);
          results.push({db: dbName, status: 'Already exists', timestamp});
          continue;
        }

        const baseTempDir = path.join(os.tmpdir(), 'mongo_backups');
        const tempDir = path.join(baseTempDir, `temp_${dbName}`);
        const dumpFolder = path.join(tempDir, dbName);
        const jsonFolder = path.join(tempDir, `${dbName}_json`);
        const zipFilePath = path.join(baseTempDir, zipFileName);

        fs.mkdirSync(tempDir, {recursive: true});
        fs.mkdirSync(jsonFolder, {recursive: true});

        console.log('Running mongodump...');
        // ----------------------------------------------------------
        // 1. BSON BACKUP
        // ----------------------------------------------------------
        await new Promise((resolve, reject) => {
          exec(
            `mongodump --uri="${mongoUri}" --db="${dbName}" --out="${tempDir}"`,
            (err, stdout, stderr) => {
              if (err) return reject(stderr);
              resolve(stdout);
            },
          );
        });

        console.log('Fetching collections...');
        const collections = await getCollectionsFromDB(mongoUri, dbName);

        // ----------------------------------------------------------
        // 3. Export JSON for each collection using mongoexport
        // ----------------------------------------------------------
        for (const col of collections) {
          console.log(`Exporting ${col}.json ...`);
          await new Promise((resolve, reject) => {
            exec(
              `mongoexport --uri="${mongoUri}" --db="${dbName}" --collection="${col}" --out="${path.join(jsonFolder, col + '.json',)}" --jsonArray`,
              err => {
                if (err) return reject(err);
                resolve(true);
              },
            );
          });
        }

        console.log('📦 Compressing...');

        // ----------------------------------------------------------
        // 4. ZIP both BSON & JSON
        // ----------------------------------------------------------
        await new Promise<void>((resolve, reject) => {
          const output = fs.createWriteStream(zipFilePath);
          const archive = archiver('zip', {zlib: {level: 6}});

          output.on('close', async () => {
            try {
              console.log(`🔄 Uploading ZIP backup to Google Cloud Storage...`);
              await bucket.upload(zipFilePath, {
                destination: `${zipFileName}`,
                gzip: false,
              });

              const publicUrl = `https://console.cloud.google.com/storage/browser/_details/${bucketName}/${zipFileName}`;

              console.log(
                `☁️ Backup uploaded to: gs://${bucketName}/${zipFileName}`,
              );
              results.push({
                db: dbName,
                publicUrl,
                status: 'success',
                timestamp,
              });
            } catch (err) {
              console.error('❌ Error uploading ZIP:', err);
              results.push({
                db: dbName,
                publicUrl: null,
                status: 'failed',
                timestamp,
                error: err,
              });
            }

            // cleanup
            fs.rmSync(tempDir, {recursive: true, force: true});
            fs.unlinkSync(zipFilePath);

            resolve();
          });

          archive.on('error', reject);

          archive.pipe(output);
          archive.directory(dumpFolder, `bson_backup`);
          archive.directory(jsonFolder, `json_backup`);

          archive.finalize();
        });
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
        r.publicUrl = `https://console.cloud.google.com/storage/browser/_details/${bucketName}/${r.db}__${timestamp}.zip`;
      }
    });
    const hour = new Date().getHours();
    if(hour > 12) {
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
