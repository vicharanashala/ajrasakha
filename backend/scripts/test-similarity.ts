/**
 * Test Script for Semantic Similarity Detection
 * 
 * This script verifies the duplicate detection functionality by:
 * 1. Checking questions and duplicate_questions collections
 * 2. Analyzing similarity scores
 * 3. Validating embeddings
 * 4. Generating test report
 */

import { MongoClient, Db } from 'mongodb';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

interface DuplicateQuestion {
  _id: any;
  question: string;
  matched_question_id: any;
  matched_question_text: string;
  similarity_score: number;
  details: {
    crop: string;
    domain: string;
    state: string;
  };
  createdAt: Date;
}

interface TestResults {
  totalQuestions: number;
  questionsWithEmbeddings: number;
  totalDuplicates: number;
  highSimilarityDuplicates: number;
  averageSimilarityScore: number;
  duplicatesByCrop: Record<string, number>;
  duplicatesByDomain: Record<string, number>;
}

async function testSimilarityDetection() {
  console.log('🧪 Testing Semantic Similarity Detection System\n');
  console.log('━'.repeat(60));

  const mongoUri = process.env.DB_URL;
  const dbName = process.env.DB_NAME;

  if (!mongoUri || !dbName) {
    console.error('❌ Missing DB_URL or DB_NAME in environment variables');
    process.exit(1);
  }

  let client: MongoClient;

  try {
    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    client = await MongoClient.connect(mongoUri);
    const db: Db = client.db(dbName);
    console.log('✅ Connected successfully\n');

    // Initialize results
    const results: TestResults = {
      totalQuestions: 0,
      questionsWithEmbeddings: 0,
      totalDuplicates: 0,
      highSimilarityDuplicates: 0,
      averageSimilarityScore: 0,
      duplicatesByCrop: {},
      duplicatesByDomain: {},
    };

    // Test 1: Check questions collection
    console.log('📊 Test 1: Analyzing Questions Collection');
    console.log('─'.repeat(60));
    
    results.totalQuestions = await db.collection('questions').countDocuments();
    console.log(`   Total questions: ${results.totalQuestions}`);

    results.questionsWithEmbeddings = await db.collection('questions').countDocuments({
      embedding: { $exists: true, $ne: [], $type: 'array' }
    });
    console.log(`   Questions with embeddings: ${results.questionsWithEmbeddings}`);
    
    const embeddingPercentage = results.totalQuestions > 0 
      ? ((results.questionsWithEmbeddings / results.totalQuestions) * 100).toFixed(2)
      : '0';
    console.log(`   Embedding coverage: ${embeddingPercentage}%`);

    // Sample question with embedding
    const sampleQuestion = await db.collection('questions').findOne({
      embedding: { $exists: true, $ne: [] }
    });
    
    if (sampleQuestion) {
      console.log(`   Sample embedding dimension: ${sampleQuestion.embedding?.length || 0}`);
    }
    console.log();

    // Test 2: Check duplicate_questions collection
    console.log('🔁 Test 2: Analyzing Duplicate Questions Collection');
    console.log('─'.repeat(60));
    
    results.totalDuplicates = await db.collection('duplicate_questions').countDocuments();
    console.log(`   Total duplicates detected: ${results.totalDuplicates}`);

    if (results.totalDuplicates > 0) {
      // Get all duplicates
      const duplicates = await db.collection('duplicate_questions')
        .find<DuplicateQuestion>({})
        .toArray();

      // Calculate average similarity score
      const totalScore = duplicates.reduce((sum, dup) => sum + dup.similarity_score, 0);
      results.averageSimilarityScore = totalScore / duplicates.length;
      console.log(`   Average similarity score: ${(results.averageSimilarityScore * 100).toFixed(2)}%`);

      // Count high similarity duplicates (>0.85)
      results.highSimilarityDuplicates = duplicates.filter(
        dup => dup.similarity_score > 0.85
      ).length;
      console.log(`   High similarity (>85%): ${results.highSimilarityDuplicates}`);

      // Group by crop
      duplicates.forEach(dup => {
        const crop = dup.details?.crop || 'Unknown';
        results.duplicatesByCrop[crop] = (results.duplicatesByCrop[crop] || 0) + 1;
      });

      // Group by domain
      duplicates.forEach(dup => {
        const domain = dup.details?.domain || 'Unknown';
        results.duplicatesByDomain[domain] = (results.duplicatesByDomain[domain] || 0) + 1;
      });

      console.log('\n   Duplicates by Crop:');
      Object.entries(results.duplicatesByCrop).forEach(([crop, count]) => {
        console.log(`      ${crop}: ${count}`);
      });

      console.log('\n   Duplicates by Domain:');
      Object.entries(results.duplicatesByDomain).forEach(([domain, count]) => {
        console.log(`      ${domain}: ${count}`);
      });

      // Test 3: Show sample duplicates
      console.log('\n📝 Test 3: Sample Duplicate Pairs');
      console.log('─'.repeat(60));
      
      const sampleDuplicates = duplicates.slice(0, 3);
      sampleDuplicates.forEach((dup, index) => {
        console.log(`\n   Pair ${index + 1}:`);
        console.log(`   Similarity: ${(dup.similarity_score * 100).toFixed(2)}%`);
        console.log(`   Original:  "${dup.matched_question_text}"`);
        console.log(`   Duplicate: "${dup.question}"`);
        console.log(`   Crop: ${dup.details?.crop}, Domain: ${dup.details?.domain}`);
      });
    } else {
      console.log('   ⚠️  No duplicates found. Upload test questions to see detection in action.');
    }
    console.log();

    // Test 4: Validate data integrity
    console.log('🔍 Test 4: Data Integrity Validation');
    console.log('─'.repeat(60));

    // Check for orphaned duplicates (matched question doesn't exist)
    if (results.totalDuplicates > 0) {
      const duplicates = await db.collection('duplicate_questions').find({}).toArray();
      let orphanedCount = 0;

      for (const dup of duplicates) {
        const matchedExists = await db.collection('questions').findOne({
          _id: dup.matched_question_id
        });
        if (!matchedExists) {
          orphanedCount++;
        }
      }

      console.log(`   Orphaned duplicates: ${orphanedCount}`);
      if (orphanedCount > 0) {
        console.log('   ⚠️  Some duplicates reference deleted questions');
      } else {
        console.log('   ✅ All duplicates have valid references');
      }
    }

    // Check for questions without embeddings
    const questionsWithoutEmbeddings = results.totalQuestions - results.questionsWithEmbeddings;
    if (questionsWithoutEmbeddings > 0) {
      console.log(`   ⚠️  ${questionsWithoutEmbeddings} questions missing embeddings`);
    } else {
      console.log('   ✅ All questions have embeddings');
    }
    console.log();

    // Test 5: Performance metrics
    console.log('⚡ Test 5: Performance Metrics');
    console.log('─'.repeat(60));

    if (results.totalQuestions > 0) {
      const duplicateRate = ((results.totalDuplicates / (results.totalQuestions + results.totalDuplicates)) * 100).toFixed(2);
      console.log(`   Duplicate detection rate: ${duplicateRate}%`);
      
      const uniqueRate = (100 - parseFloat(duplicateRate)).toFixed(2);
      console.log(`   Unique question rate: ${uniqueRate}%`);
    }
    console.log();

    // Final Summary
    console.log('━'.repeat(60));
    console.log('📋 Test Summary');
    console.log('━'.repeat(60));
    console.log(`✅ Questions in main collection: ${results.totalQuestions}`);
    console.log(`🧠 Questions with embeddings: ${results.questionsWithEmbeddings}`);
    console.log(`🔁 Duplicates detected: ${results.totalDuplicates}`);
    console.log(`⚡ High similarity duplicates: ${results.highSimilarityDuplicates}`);
    
    if (results.totalDuplicates > 0) {
      console.log(`📊 Average similarity: ${(results.averageSimilarityScore * 100).toFixed(2)}%`);
    }
    
    console.log('━'.repeat(60));

    // Recommendations
    console.log('\n💡 Recommendations:');
    if (results.totalQuestions === 0) {
      console.log('   • Upload test questions using the API');
      console.log('   • Use test-data/sample-questions.json for testing');
    }
    if (results.questionsWithEmbeddings < results.totalQuestions) {
      console.log('   • Some questions are missing embeddings');
      console.log('   • Check if ENABLE_AI_SERVER is true');
      console.log('   • Verify AI service is running');
    }
    if (results.totalDuplicates === 0 && results.totalQuestions > 5) {
      console.log('   • No duplicates detected yet');
      console.log('   • Try uploading similar questions to test detection');
    }
    if (results.highSimilarityDuplicates > 0) {
      console.log(`   ✅ System successfully detected ${results.highSimilarityDuplicates} high-confidence duplicates`);
    }

    console.log('\n✅ Testing completed successfully!\n');

    await client.close();
    process.exit(0);

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
testSimilarityDetection();
