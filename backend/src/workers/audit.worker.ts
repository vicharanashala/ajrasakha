import { parentPort, workerData } from 'worker_threads';
import { MongoClient } from 'mongodb';

let client: MongoClient;
let collection: any;

async function initDB() {
  if (collection) return;

  client = new MongoClient(workerData.mongoUri);
  await client.connect();

  const db = client.db(workerData.dbName);
  collection = db.collection('moderatorAuditTrails');
}

parentPort?.on('message', async (audit) => {
  try {
    await initDB();

    await collection.insertOne(audit);

    parentPort?.postMessage({ success: true });
  } catch (err: any) {
    parentPort?.postMessage({
      success: false,
      error: err.message,
    });
  }
});
