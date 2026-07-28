import { MongoClient } from 'mongodb';

// Connection URIs - Update these with your actual credentials/URIs
const STAGING_URI = '';
const PROD_URI = '';

// Explicit Database Names
const STAGING_DB_NAME = '';
const PROD_DB_NAME = '';

const COLLECTIONS_TO_CHECK = [
  'questions',
  'question_submissions',
  'answers',
  'reviews',
  'users'
];

async function checkIdOverlaps() {
  const stagingClient = new MongoClient(STAGING_URI);
  const prodClient = new MongoClient(PROD_URI);

  try {
    await stagingClient.connect();
    await prodClient.connect();

    console.log('🚀 Connected to both database instances successfully.\n');
    
    // Explicitly targeting the databases by name
    const stagingDb = stagingClient.db(STAGING_DB_NAME);
    const prodDb = prodClient.db(PROD_DB_NAME);

    for (const collectionName of COLLECTIONS_TO_CHECK) {
      console.log(`Checking collection: [${collectionName}]...`);

      // 1. Fetch all _ids from the staging collection
      const stagingIds = await stagingDb
        .collection(collectionName)
        .find({}, { projection: { _id: 1 } })
        .toArray();

      if (stagingIds.length === 0) {
        console.log(`   ⚠️ Staging collection [${collectionName}] is empty.\n`);
        continue;
      }

      // Extract the raw IDs into an array
      const idArray = stagingIds.map(doc => doc._id);

      // 2. Query Production to find any matching _ids
      const overlappingDocs = await prodDb
        .collection(collectionName)
        .find({ _id: { $in: idArray } }, { projection: { _id: 1 } })
        .toArray();

      // 3. Report the findings
      if (overlappingDocs.length > 0) {
        console.log(`   ❌ FOUND OVERLAPS! Total overlapping _ids: ${overlappingDocs.length}`);
        console.log(`   Sample overlapping IDs:`, overlappingDocs.slice(0, 5).map(d => d._id));
      } else {
        console.log(`   ✅ Clean! Zero _id overlaps found out of ${stagingIds.length} staging documents.`);
      }
      console.log('--------------------------------------------------');
    }

  } catch (error) {
    console.error('🔴 Error checking for overlaps:', error);
  } finally {
    await stagingClient.close();
    await prodClient.close();
    console.log('\n🔌 Disconnected from databases.');
  }
}

checkIdOverlaps();