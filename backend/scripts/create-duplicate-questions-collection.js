/**
 * MongoDB Script to Create duplicate_questions Collection
 * 
 * Run this script using:
 * mongosh "your-mongodb-uri" < scripts/create-duplicate-questions-collection.js
 * 
 * Or in mongosh:
 * load('scripts/create-duplicate-questions-collection.js')
 */

// Switch to your database (update with your actual database name)
const dbName = 'prod_copy_db'; // Change this to your database name
db = db.getSiblingDB(dbName);

print('━'.repeat(80));
print('Creating duplicate_questions Collection');
print('━'.repeat(80));

// ============================================================================
// STEP 1: Create Collection with Validation
// ============================================================================

print('\n📦 Step 1: Creating collection with schema validation...');

try {
  db.createCollection('duplicate_questions', {
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: [
          'question',
          'matched_question_id',
          'matched_question_text',
          'similarity_score',
          'embedding',
          'details',
          'priority',
          'source',
          'createdAt',
          'updatedAt'
        ],
        properties: {
          question: {
            bsonType: 'string',
            description: 'The duplicate question text - required'
          },
          text: {
            bsonType: 'string',
            description: 'Formatted question text - optional'
          },
          matched_question_id: {
            bsonType: 'objectId',
            description: 'Reference to original question in questions collection - required'
          },
          matched_question_text: {
            bsonType: 'string',
            description: 'Text of the original question - required'
          },
          similarity_score: {
            bsonType: 'double',
            minimum: 0.85,
            maximum: 1.0,
            description: 'Cosine similarity score (0.85-1.0) - required'
          },
          embedding: {
            bsonType: 'array',
            items: {
              bsonType: 'double'
            },
            description: 'Vector embedding array (768 dimensions) - required'
          },
          details: {
            bsonType: 'object',
            required: ['state', 'district', 'crop', 'season', 'domain'],
            properties: {
              state: { bsonType: 'string' },
              district: { bsonType: 'string' },
              crop: { bsonType: 'string' },
              season: { bsonType: 'string' },
              domain: { bsonType: 'string' }
            }
          },
          priority: {
            bsonType: 'string',
            enum: ['low', 'medium', 'high'],
            description: 'Priority level - required'
          },
          source: {
            bsonType: 'string',
            enum: ['AJRASAKHA', 'AGRI_EXPERT'],
            description: 'Source of the question - required'
          },
          status: {
            bsonType: 'string',
            description: 'Question status - optional'
          },
          userId: {
            bsonType: 'objectId',
            description: 'User who submitted the question - optional'
          },
          contextId: {
            bsonType: ['objectId', 'null'],
            description: 'Context ID - optional'
          },
          totalAnswersCount: {
            bsonType: 'int',
            minimum: 0,
            description: 'Number of answers - optional'
          },
          isAutoAllocate: {
            bsonType: 'bool',
            description: 'Auto-allocation flag - optional'
          },
          createdAt: {
            bsonType: 'date',
            description: 'Creation timestamp - required'
          },
          updatedAt: {
            bsonType: 'date',
            description: 'Last update timestamp - required'
          }
        }
      }
    },
    validationLevel: 'moderate',
    validationAction: 'warn'
  });
  
  print('✅ Collection created successfully');
} catch (e) {
  if (e.code === 48) {
    print('⚠️  Collection already exists, skipping creation');
  } else {
    print('❌ Error creating collection:', e.message);
    throw e;
  }
}

// ============================================================================
// STEP 2: Create Indexes
// ============================================================================

print('\n📑 Step 2: Creating indexes...');

const indexes = [
  {
    name: 'matched_question_id_1',
    keys: { matched_question_id: 1 },
    description: 'Fast lookup of all duplicates for a specific original question'
  },
  {
    name: 'similarity_score_-1',
    keys: { similarity_score: -1 },
    description: 'Find highest similarity duplicates'
  },
  {
    name: 'crop_domain_1',
    keys: { 'details.crop': 1, 'details.domain': 1 },
    description: 'Fast filtering by crop and domain'
  },
  {
    name: 'createdAt_-1',
    keys: { createdAt: -1 },
    description: 'Sort by detection time (newest first)'
  },
  {
    name: 'userId_1',
    keys: { userId: 1 },
    description: 'Find all duplicates submitted by a user'
  },
  {
    name: 'source_1',
    keys: { source: 1 },
    description: 'Filter by source (AJRASAKHA/AGRI_EXPERT)'
  }
];

let indexCount = 0;
for (const index of indexes) {
  try {
    db.duplicate_questions.createIndex(index.keys, { name: index.name });
    print(`✅ Created index: ${index.name}`);
    print(`   ${index.description}`);
    indexCount++;
  } catch (e) {
    if (e.code === 85 || e.code === 86) {
      print(`⚠️  Index ${index.name} already exists, skipping`);
    } else {
      print(`❌ Error creating index ${index.name}:`, e.message);
    }
  }
}

print(`\n📊 Created ${indexCount} new indexes`);

// ============================================================================
// STEP 3: Verify Collection
// ============================================================================

print('\n🔍 Step 3: Verifying collection...');

const collectionInfo = db.getCollectionInfos({ name: 'duplicate_questions' })[0];
if (collectionInfo) {
  print('✅ Collection exists');
  print(`   Validation level: ${collectionInfo.options.validationLevel || 'none'}`);
  print(`   Validation action: ${collectionInfo.options.validationAction || 'none'}`);
} else {
  print('❌ Collection not found');
}

const indexList = db.duplicate_questions.getIndexes();
print(`\n📑 Total indexes: ${indexList.length}`);
indexList.forEach(idx => {
  print(`   - ${idx.name}`);
});

// ============================================================================
// STEP 4: Collection Statistics
// ============================================================================

print('\n📊 Step 4: Collection statistics...');

const stats = db.duplicate_questions.stats();
print(`   Documents: ${stats.count || 0}`);
print(`   Storage size: ${(stats.storageSize || 0) / 1024} KB`);
print(`   Average document size: ${stats.avgObjSize || 0} bytes`);

// ============================================================================
// STEP 5: Insert Sample Document (Optional)
// ============================================================================

print('\n📝 Step 5: Inserting sample document for testing...');

const sampleDoc = {
  question: 'Sample duplicate question for testing',
  text: 'Question: Sample duplicate question for testing',
  matched_question_id: new ObjectId(),
  matched_question_text: 'Sample original question',
  similarity_score: 0.92,
  embedding: Array(768).fill(0).map(() => Math.random()),
  details: {
    state: 'Test State',
    district: 'Test District',
    crop: 'Test Crop',
    season: 'Kharif',
    domain: 'Test Domain'
  },
  priority: 'medium',
  source: 'AJRASAKHA',
  status: 'open',
  totalAnswersCount: 0,
  isAutoAllocate: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

try {
  const result = db.duplicate_questions.insertOne(sampleDoc);
  print(`✅ Sample document inserted with ID: ${result.insertedId}`);
  print('   You can delete it with:');
  print(`   db.duplicate_questions.deleteOne({ _id: ObjectId("${result.insertedId}") })`);
} catch (e) {
  print('❌ Error inserting sample document:', e.message);
}

// ============================================================================
// STEP 6: Test Queries
// ============================================================================

print('\n🧪 Step 6: Testing queries...');

print('\n   Query 1: Count all duplicates');
const count = db.duplicate_questions.countDocuments();
print(`   Result: ${count} documents`);

print('\n   Query 2: Find high-confidence duplicates (>90%)');
const highConfidence = db.duplicate_questions.countDocuments({
  similarity_score: { $gte: 0.90 }
});
print(`   Result: ${highConfidence} documents`);

print('\n   Query 3: Group by matched question');
const grouped = db.duplicate_questions.aggregate([
  {
    $group: {
      _id: '$matched_question_id',
      count: { $sum: 1 },
      avgSimilarity: { $avg: '$similarity_score' }
    }
  },
  { $limit: 5 }
]).toArray();
print(`   Result: ${grouped.length} groups found`);

// ============================================================================
// Summary
// ============================================================================

print('\n━'.repeat(80));
print('✅ Setup Complete!');
print('━'.repeat(80));
print('\nCollection: duplicate_questions');
print('Database: ' + dbName);
print('Status: Ready for use');
print('\nUseful Commands:');
print('  - View all duplicates: db.duplicate_questions.find().pretty()');
print('  - Count duplicates: db.duplicate_questions.countDocuments()');
print('  - View indexes: db.duplicate_questions.getIndexes()');
print('  - Drop collection: db.duplicate_questions.drop()');
print('\n━'.repeat(80));
