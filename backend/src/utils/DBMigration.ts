import 'reflect-metadata';
import fs from 'fs';
import path from 'path';
import {Container} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {MongoDatabase} from '#root/shared/index.js';
import {dbConfig} from '#root/config/db.js';
import {EJSON} from 'bson';

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
