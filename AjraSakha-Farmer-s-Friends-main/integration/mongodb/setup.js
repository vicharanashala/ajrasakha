/**
 * MongoDB Setup Script for Feedback System
 *
 * Run this script to create the necessary collections and indexes:
 *   node mongodb/setup.js
 *
 * Or import directly into your existing MongoDB database.
 */

const mongoose = require('mongoose');

const MONGODB_URI = process.env.DB_URL || 'mongodb://localhost:27017/ajrasakha';

async function setupFeedbackCollections() {
  console.log('🔄 Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected!\n');

  const db = mongoose.connection.db;

  // Create feedback collection with validation
  console.log('📦 Creating feedback collection...');
  try {
    await db.createCollection('feedbacks', {
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['gdb_entry_id', 'farmer_id', 'response'],
          properties: {
            gdb_entry_id: { bsonType: 'string' },
            farmer_id: { bsonType: 'string' },
            message_id: { bsonType: 'string' },
            response: { enum: ['1', '2'] },
            state: { bsonType: 'string' },
            language: { bsonType: 'string' },
            domain: { bsonType: 'string' },
            source: { enum: ['web', 'whatsapp', 'chat'] },
            timestamp: { bsonType: 'date' },
            status: { enum: ['captured', 'flagged', 'reviewed'] }
          }
        }
      }
    });
    console.log('✅ feedbacks collection created');
  } catch (error) {
    if (error.code === 48) {
      console.log('⚠️  feedbacks collection already exists');
    } else {
      throw error;
    }
  }

  // Create indexes
  console.log('\n📇 Creating indexes...');

  const indexes = [
    { collection: 'feedbacks', fields: { gdb_entry_id: 1 }, name: 'idx_gdb_entry_id' },
    { collection: 'feedbacks', fields: { farmer_id: 1 }, name: 'idx_farmer_id' },
    { collection: 'feedbacks', fields: { timestamp: -1 }, name: 'idx_timestamp' },
    { collection: 'feedbacks', fields: { domain: 1 }, name: 'idx_domain' },
    { collection: 'feedbacks', fields: { language: 1 }, name: 'idx_language' },
    { collection: 'feedbacks', fields: { state: 1 }, name: 'idx_state' },
    { collection: 'feedbacks', fields: { response: 1 }, name: 'idx_response' },
    { collection: 'feedbacks', fields: { source: 1 }, name: 'idx_source' },
    { collection: 'feedbacks', fields: { status: 1 }, name: 'idx_status' },
  ];

  for (const idx of indexes) {
    try {
      await db.collection(idx.collection).createIndex(idx.fields, { name: idx.name });
      console.log(`✅ Index ${idx.name} created`);
    } catch (error) {
      if (error.code === 85 || error.code === 86) {
        console.log(`⚠️  Index ${idx.name} already exists with different options`);
      } else {
        console.log(`❌ Index ${idx.name} failed:`, error.message);
      }
    }
  }

  // Create WhatsApp feedback tracking collection
  console.log('\n📦 Creating whatsapp_feedback_tracking collection...');
  try {
    await db.createCollection('whatsapp_feedback_tracking');
    console.log('✅ whatsapp_feedback_tracking collection created');
  } catch (error) {
    if (error.code === 48) {
      console.log('⚠️  whatsapp_feedback_tracking collection already exists');
    } else {
      throw error;
    }
  }

  // Create indexes for WhatsApp tracking
  const waIndexes = [
    { fields: { message_id: 1 }, name: 'idx_message_id' },
    { fields: { farmer_phone: 1 }, name: 'idx_farmer_phone' },
    { fields: { feedback_received: 1, expires_at: 1 }, name: 'idx_pending_feedback' },
  ];

  for (const idx of waIndexes) {
    try {
      await db.collection('whatsapp_feedback_tracking').createIndex(idx.fields, { name: idx.name });
      console.log(`✅ Index ${idx.name} created`);
    } catch (error) {
      if (error.code === 85 || error.code === 86) {
        console.log(`⚠️  Index ${idx.name} already exists`);
      } else {
        console.log(`❌ Index ${idx.name} failed:`, error.message);
      }
    }
  }

  console.log('\n📊 Creating views for analytics...');

  // Create helpfulness_by_entry view
  try {
    await db.createCollection('feedback_helpfulness_by_entry', {
      viewOn: 'feedbacks',
      pipeline: [
        {
          $group: {
            _id: '$gdb_entry_id',
            total_responses: { $sum: 1 },
            helpful_count: { $sum: { $cond: [{ $eq: ['$response', '1'] }, 1, 0] } },
            not_helpful_count: { $sum: { $cond: [{ $eq: ['$response', '2'] }, 1, 0] } },
            domain: { $first: '$domain' },
            language: { $first: '$language' },
            last_feedback_at: { $max: '$timestamp' }
          }
        },
        {
          $addFields: {
            helpfulness_score: {
              $cond: [
                { $gt: ['$total_responses', 0] },
                { $multiply: [{ $divide: ['$helpful_count', '$total_responses'] }, 100] },
                0
              ]
            }
          }
        }
      ]
    });
    console.log('✅ View feedback_helpfulness_by_entry created');
  } catch (error) {
    console.log('⚠️  View creation:', error.message);
  }

  console.log('\n🎉 MongoDB setup complete!');
  console.log('\nCollections created:');
  console.log('  - feedbacks');
  console.log('  - whatsapp_feedback_tracking');
  console.log('\nViews created:');
  console.log('  - feedback_helpfulness_by_entry');

  await mongoose.disconnect();
  console.log('\n👋 Disconnected from MongoDB');
}

// Run if called directly
if (require.main === module) {
  setupFeedbackCollections().catch((error) => {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  });
}

module.exports = { setupFeedbackCollections };