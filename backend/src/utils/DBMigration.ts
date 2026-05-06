import 'reflect-metadata';
import fs from 'fs';
import path from 'path';
import {Container} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {MongoDatabase} from '#root/shared/index.js';
import {dbConfig} from '#root/config/db.js';
import {EJSON} from 'bson';
import {exec} from 'child_process';
import {appConfig} from '#root/config/index.js';
import { Storage} from '@google-cloud/storage';
import os from 'os';
import * as unzipper from 'unzipper';

/**
 * Connect to MongoDB via Inversify
 */
const connectMongo = async () => {
  const container = new Container();
  container.bind(GLOBAL_TYPES.uri).toConstantValue(dbConfig.url);
  container.bind(GLOBAL_TYPES.dbName).toConstantValue(dbConfig.dbName);
  container.bind(MongoDatabase).toSelf();

  const mongoDatabase = container.get(MongoDatabase);
  return mongoDatabase;
};

/**
 * Backup documents from a specific collection based on a filter
 */
export const backupCollection = async ({
  collectionName,
  filter = {},
  backupDir = './backups',
}) => {
  const mongoDatabase = await connectMongo();
  const collection = await mongoDatabase.getCollection(collectionName);

  console.log(
    `🔗 Connected to MongoDB Atlas for collection: ${collectionName}`,
  );

  const docs = await collection.find(filter).toArray();

  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, {recursive: true});

  const backupFile = path.join(
    backupDir,
    `backup_${collectionName}_${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );

  fs.writeFileSync(backupFile, EJSON.stringify(docs, null, 2));
  console.log(`✅ Backup created: ${backupFile} (${docs.length} documents)`);

  await mongoDatabase.disconnect();
  return backupFile;
};

/**
 * Restore documents from a backup JSON file
 */
export const restoreCollection = async ({collectionName, backupFile}) => {
  const mongoDatabase = await connectMongo();
  const collection = await mongoDatabase.getCollection(collectionName);

  console.log(`🔗 Restoring data into ${collectionName} from ${backupFile}`);

  const fileContent = fs.readFileSync(backupFile, 'utf-8');
  const data = EJSON.parse(fileContent);

  let restored = 0;
  for (const doc of data) {
    await collection.updateOne({_id: doc._id}, {$set: doc}, {upsert: true});
    restored++;
  }

  console.log(`✅ Restored ${restored} documents into ${collectionName}`);
  await mongoDatabase.disconnect();
};

const restoreCollectionBSON = async ({
  collectionName,
  bsonFolderPath,
  dbName,
  mongoUri,
}: {
  collectionName: string;
  bsonFolderPath: string;
  dbName: string;
  mongoUri: string;
}) => {
  const bsonFilePath = path.join(bsonFolderPath, `${collectionName}.bson`);

  console.log(
    `🔗 Restoring collection "${collectionName}" from ${bsonFilePath}`,
  );

  const command = `mongorestore --uri="${mongoUri}" --db="${dbName}" --collection="${collectionName}" "${bsonFilePath}"`;

  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      console.log('STDOUT:', stdout);
      console.log('STDERR:', stderr);

      if (error) {
        console.error('❌ mongorestore failed:', error);
        return reject(error);
      }

      if (stderr) {
        console.error('⚠️ mongorestore stderr:', stderr);
      }

      console.log(`✅ Restored collection: ${collectionName}`);
      resolve(true);
    });
  });
};

export const restoreBackupBson = async ({
  fileName,
  collectionName,
}: {
  fileName: string;
  collectionName: string;
}) => {
  const tempDir = path.join(os.tmpdir(), `restore_${Date.now()}`);
  const zipPath = path.join(tempDir, fileName);

  try {
    fs.mkdirSync(tempDir, {recursive: true});

    // ---------------------------
    // 1. Download ZIP from GCS
    // ---------------------------
    const storage = new Storage({
      keyFilename: appConfig.GOOGLE_APPLICATION_CREDENTIALS,
    });

    const bucket = storage.bucket(appConfig.GCP_BACKUP_BUCKET);

    console.log(`☁️ Downloading ${fileName}...`);
    await bucket.file(fileName).download({destination: zipPath});

    // ---------------------------
    // 2. Extract ZIP
    // ---------------------------
    console.log('📦 Extracting ZIP...');
    await fs
      .createReadStream(zipPath)
      .pipe(unzipper.Extract({path: tempDir}))
      .promise();

    // ---------------------------
    // 3. Locate BSON folder
    // ---------------------------
    const bsonFolderPath = path.join(tempDir, 'bson_backup');

    if (!fs.existsSync(bsonFolderPath)) {
      throw new Error(`❌ BSON folder not found: ${bsonFolderPath}`);
    }

    console.log(`📁 Found BSON folder: ${bsonFolderPath}`);

    // ---------------------------
    // 4. Call restore logic
    // ---------------------------
    await restoreCollectionBSON({
      collectionName,
      bsonFolderPath,
      dbName: process.env.DB_NAME as string,
      mongoUri: process.env.DB_URL as string,
    });

    return {
      success: true,
      collection: collectionName,
    };
  } catch (err: any) {
    console.error('❌ Restore failed:', err);
    throw new Error(err?.message || 'Restore failed');
  } finally {
    // cleanup temp files
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
};
