import { MongoClient } from "mongodb";
import { dbConfig } from "#root/config/db.js";

export const getBackupSnapshotData = async () => {
  const client = new MongoClient(dbConfig.url);
  await client.connect();

  const db = client.db(dbConfig.dbName);
  const collections = await db.listCollections().toArray();

  const result = [];

  for (const col of collections) {
    const count = await db.collection(col.name).countDocuments();
    result.push({
      collectionName: col.name,
      documentCount: count,
    });
  }

  await client.close();

  return {
    database: dbConfig.dbName,
    generatedAt: new Date(),
    collections: result,
    totalCollections: result.length,
  };
};
