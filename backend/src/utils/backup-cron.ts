import {exec} from 'child_process';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import {MongoClient} from 'mongodb';

const getCollectionsFromDB = async (mongoUri: string, dbName: string) => {
  const client = new MongoClient(mongoUri);
  await client.connect();
  const collections = await client.db(dbName).listCollections().toArray();
  await client.close();
  return collections.map(c => c.name);
};

export const createLocalBackup = async (mongoUri: string, dbName: string) => {
  const timestamp = (() => {
    const now = new Date();
    return (
      `${String(now.getDate()).padStart(2, '0')}-` +
      `${String(now.getMonth() + 1).padStart(2, '0')}-` +
      `${now.getFullYear()}_` +
      `${String(now.getHours()).padStart(2, '0')}-` +
      `${String(now.getMinutes()).padStart(2, '0')}-` +
      `${String(now.getSeconds()).padStart(2, '0')}`
    );
  })();
  const tempDir = path.join(process.cwd(), 'temp_db_backup');
  const dumpFolder = path.join(tempDir, dbName);
  const jsonFolder = path.join(tempDir, `${dbName}_json`);
  const zipFileName = `review_system_backup_${timestamp}.zip`;
  // const zipFileName = `${dbName}_review_system_backup_${timestamp}.zip`;
  const zipFilePath = path.join(process.cwd(), zipFileName);

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

  console.log('Fetching collection list (Node.js)...');

  // ----------------------------------------------------------
  // 2. Get collections
  // ----------------------------------------------------------
  const collections = await getCollectionsFromDB(mongoUri, dbName);

  // ----------------------------------------------------------
  // 3. Export JSON for each collection using mongoexport
  // ----------------------------------------------------------
  for (const col of collections) {
    console.log(`Exporting ${col}.json ...`);
    await new Promise((resolve, reject) => {
      exec(
        `mongoexport --uri="${mongoUri}" --db="${dbName}" --collection="${col}" --out="${path.join(
          jsonFolder,
          col + '.json',
        )}"`,
        err => {
          if (err) return reject(err);
          resolve(true);
        },
      );
    });
  }

  console.log('📦 Compressing database backup...');

  // ----------------------------------------------------------
  // 4. ZIP both BSON & JSON
  // ----------------------------------------------------------
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver('zip', {zlib: {level: 6}});

    output.on('close', () => {
      fs.rmSync(tempDir, {recursive: true, force: true});
      resolve();
    });

    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(dumpFolder, `bson_backup`);
    archive.directory(jsonFolder, `json_backup`);

    archive.finalize();
  });

  console.log('✅ Backup created:', zipFilePath);
};
