import {MongoDatabase} from '#root/shared/index.js';
import {Container} from 'inversify';
import 'reflect-metadata';
import {GLOBAL_TYPES} from '#root/types.js';
import {dbConfig} from '#root/config/db.js';
import {backupCollection, restoreCollection} from '#root/utils/DBMigration.js';
// import path from 'path';

const migrateStringArraySources = async () => {
  const backupFile = await backupCollection({
    collectionName: 'answers',
  });

  console.log(`📦 Backup saved at: ${backupFile}`);

  // const backupFile = path.resolve(
  //   './backups/backup_answers_2025-11-06T07-13-22-604Z.json',
  // );
  // restoreCollection({
  //   collectionName: 'answers',
  //   backupFile,
  // });

  const container = new Container();

  // Setup Inversify container
  container.bind(GLOBAL_TYPES.uri).toConstantValue(dbConfig.url);
  container.bind(GLOBAL_TYPES.dbName).toConstantValue(dbConfig.dbName);
  container.bind(MongoDatabase).toSelf();

  // Connect to MongoDB
  const mongoDatabase = container.get(MongoDatabase);
  const answers = await mongoDatabase.getCollection('answers');
  console.log('🔗 Connected to MongoDB Atlas');

  // Find only documents where "sources" is an array of strings
  const cursor = answers.find({
    sources: {$type: 'array'},
  });

  let updatedCount = 0;

  while (await cursor.hasNext()) {
    const doc = await cursor.next();

    // Validate array contains only strings
    if (
      !Array.isArray(doc.sources) ||
      !doc.sources.every(s => typeof s === 'string')
    ) {
      console.warn(
        `⚠️ Skipping doc ${doc._id}: invalid or mixed types in sources`,
      );
      continue;
    }

    // Transform each string into an object
    const newSources = doc.sources.map(src => ({
      source: src,
    }));

    await answers.updateOne({_id: doc._id}, {$set: {sources: newSources}});

    updatedCount++;
    console.log(`✅ Updated document ${doc._id}`);
  }

  console.log(`✅ Migration complete. Updated ${updatedCount} documents.`);
  await mongoDatabase.disconnect();
  process.exit(0);
};

migrateStringArraySources().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
