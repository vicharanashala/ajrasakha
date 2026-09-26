import 'reflect-metadata';
import { injectable, inject } from 'inversify';
import { MongoClient, ObjectId } from 'mongodb';
import { GLOBAL_TYPES } from '#root/types.js';
import { MongoDatabase } from '#root/shared/database/providers/mongo/MongoDatabase.js';
import { getFirebaseAuth } from '#root/config/firebaseAdmin.js';

export interface OverlapResult {
  collection: string;
  status: 'clean' | 'overlap';
  stagingCount: number;
  productionCount: number;
  overlappingCount: number;
  overlappingIds: ObjectId[];
  message: string;
}

export interface CheckOverlapsResponse {
  success: boolean;
  timestamp: string;
  results: OverlapResult[];
  summary: {
    totalCollections: number;
    cleanCollections: number;
    collectionsWithOverlaps: number;
  };
}

export interface MigrationResponse {
  success: boolean;
  timestamp: string;
  logs: string[];
  summary: {
    usersProcessed: number;
    questionsMigrated: number;
    answersMigrated: number;
    reviewsMigrated: number;
    submissionsMigrated: number;
  };
}

@injectable()
export class CheckOverlapsService {
  constructor(
    @inject(GLOBAL_TYPES.Database)
    private readonly db: MongoDatabase,
  ) {}

  /**
   * Check for overlapping document IDs between staging and production databases.
   * 
   * This checks documents that are NOT yet migrated:
   * - Staging documents where migratedToProd is false or not set
   * - Production documents where staging is false or not set
   * 
   * These are the documents that need to be checked for potential overlaps
   * before migration can proceed safely.
   */
  async checkOverlaps(): Promise<CheckOverlapsResponse> {
    const results: OverlapResult[] = [];
    const logs: string[] = [];

    const log = (message: string, ...args: any[]) => {
      const fullMessage = args.length > 0 ? `${message} ${args.map(a => JSON.stringify(a)).join(' ')}` : message;
      logs.push(fullMessage);
      console.log(fullMessage);
    };

    const collectionsToCheck = [
      'questions',
      'question_submissions',
      'answers',
      'reviews',
      'users'
    ];

    log('🚀 Starting overlap check for NON-MIGRATED documents...');
    log('Checking documents where:');
    log('  - Staging: migratedToProd is false or not set');
    log('  - Production: staging is false or not set');
    log(`Timestamp: ${new Date().toISOString()}`);

    try {
      // Get the production database connection
      const prodDb = await this.db.init();

      // For staging, we need to connect to a different database
      // The staging database name should be configured in environment variables
      const stagingDbName = process.env.STAGING_DB_NAME;
      const stagingUri = process.env.STAGING_DB_URI;

      if (!stagingDbName || !stagingUri) {
        log('⚠️ STAGING_DB_NAME or STAGING_DB_URI not configured. Using current database for both checks.');
        
        // Fallback: check within the same database
        // Check for documents that have neither migratedToProd nor staging flags set
        for (const collectionName of collectionsToCheck) {
          const result = await this.checkOverlapWithinDb(prodDb, collectionName, log);
          results.push(result);
        }
      } else {
        // Connect to staging database
        const stagingClient = new MongoClient(stagingUri, {
          ssl: true,
          tls: true,
          tlsAllowInvalidCertificates: false,
          tlsAllowInvalidHostnames: false,
          retryWrites: true,
          connectTimeoutMS: 30000,
          socketTimeoutMS: 30000
        });

        try {
          await stagingClient.connect();
          const stagingDb = stagingClient.db(stagingDbName);

          for (const collectionName of collectionsToCheck) {
            const result = await this.checkOverlapBetweenDbs(
              stagingDb,
              prodDb,
              collectionName,
              log
            );
            results.push(result);
          }
        } finally {
          await stagingClient.close();
          log('🔌 Disconnected from staging database.');
        }
      }

      // Calculate summary
      const cleanCollections = results.filter(r => r.status === 'clean').length;
      const collectionsWithOverlaps = results.filter(r => r.status === 'overlap').length;

      log('\n========================================');
      log('📊 SUMMARY');
      log('========================================');
      log(`Total collections checked: ${results.length}`);
      log(`Clean collections: ${cleanCollections}`);
      log(`Collections with overlaps: ${collectionsWithOverlaps}`);

      return {
        success: true,
        timestamp: new Date().toISOString(),
        results,
        summary: {
          totalCollections: results.length,
          cleanCollections,
          collectionsWithOverlaps,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log(`🔴 Error during overlap check: ${errorMessage}`);
      
      return {
        success: false,
        timestamp: new Date().toISOString(),
        results,
        summary: {
          totalCollections: results.length,
          cleanCollections: results.filter(r => r.status === 'clean').length,
          collectionsWithOverlaps: results.filter(r => r.status === 'overlap').length,
        },
      };
    }
  }

  /**
   * Check overlaps between staging and production databases
   * Only checks documents where migratedToProd/staging flags are NOT set (not yet migrated)
   */
  private async checkOverlapBetweenDbs(
    stagingDb: any,
    prodDb: any,
    collectionName: string,
    log: (message: string, ...args: any[]) => void
  ): Promise<OverlapResult> {
    log(`\nChecking collection: [${collectionName}]...`);

    try {
      // 1. Get staging documents that are NOT migrated
      // These are documents where migratedToProd is false or not set
      const stagingDocs = await stagingDb
        .collection(collectionName)
        .find(
          { $or: [{ migratedToProd: { $exists: false } }, { migratedToProd: false }] },
          { projection: { _id: 1 } }
        )
        .toArray();

      if (stagingDocs.length === 0) {
        log(`   ⚠️ No non-migrated staging documents found in [${collectionName}].`);
        return {
          collection: collectionName,
          status: 'clean',
          stagingCount: 0,
          productionCount: 0,
          overlappingCount: 0,
          overlappingIds: [],
          message: 'No non-migrated staging documents found.',
        };
      }

      const stagingIds = stagingDocs.map(doc => doc._id);
      log(`   📊 Found ${stagingIds.length} non-migrated staging documents (migratedToProd: false/not set)`);

      // 2. Get actual production count (documents where staging is false or not set)
      const productionCount = await prodDb
        .collection(collectionName)
        .countDocuments(
          { $or: [{ staging: { $exists: false } }, { staging: false }] }
        );

      // 3. Use $in operator to efficiently find overlapping documents in production
      // This pushes the filtering to MongoDB instead of fetching all and filtering in memory
      const overlappingDocs = await prodDb
        .collection(collectionName)
        .find(
          { 
            _id: { $in: stagingIds },
            $or: [{ staging: { $exists: false } }, { staging: false }]
          },
          { projection: { _id: 1 } }
        )
        .toArray();

      const overlappingIds = overlappingDocs.map(doc => doc._id);
      log(`   📊 Found ${overlappingDocs.length} overlapping documents in production`);
      log(`   📊 Production has ${productionCount} non-staging documents`);

      // 4. Report findings
      if (overlappingIds.length > 0) {
        log(`   ❌ FOUND OVERLAPS! Total overlapping _ids: ${overlappingIds.length}`);
        log(`   These documents exist in both staging and production with the same _id but are not marked as migrated.`);
        
        return {
          collection: collectionName,
          status: 'overlap',
          stagingCount: stagingIds.length,
          productionCount: productionCount,
          overlappingCount: overlappingIds.length,
          overlappingIds: overlappingIds,
          message: `Found ${overlappingIds.length} overlapping documents out of ${stagingIds.length} non-migrated staging documents. These need to be resolved before migration.`,
        };
      } else {
        log(`   ✅ Clean! Zero _id overlaps found.`);
        log(`   ${stagingIds.length} staging documents have no ID conflicts with production.`);
        
        return {
          collection: collectionName,
          status: 'clean',
          stagingCount: stagingIds.length,
          productionCount: productionCount,
          overlappingCount: 0,
          overlappingIds: [],
          message: `No overlaps found. ${stagingIds.length} staging documents are safe for migration.`,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log(`   🔴 Error checking [${collectionName}]: ${errorMessage}`);
      
      return {
        collection: collectionName,
        status: 'clean',
        stagingCount: 0,
        productionCount: 0,
        overlappingCount: 0,
        overlappingIds: [],
        message: `Error: ${errorMessage}`,
      };
    }
  }

  /**
   * Check overlaps within the same database (fallback when staging DB is not configured)
   * Checks for documents that have neither migratedToProd nor staging flags set
   */
  private async checkOverlapWithinDb(
    db: any,
    collectionName: string,
    log: (message: string, ...args: any[]) => void
  ): Promise<OverlapResult> {
    log(`\nChecking collection: [${collectionName}] (within same database)...`);

    try {
      // Find documents that have neither flag set (not yet migrated)
      const nonMigratedDocs = await db
        .collection(collectionName)
        .find({
          $and: [
            { $or: [{ migratedToProd: { $exists: false } }, { migratedToProd: false }] },
            { $or: [{ staging: { $exists: false } }, { staging: false }] }
          ]
        }, { projection: { _id: 1 } })
        .toArray();

      if (nonMigratedDocs.length === 0) {
        log(`   ⚠️ No non-migrated documents found in [${collectionName}].`);
        return {
          collection: collectionName,
          status: 'clean',
          stagingCount: 0,
          productionCount: 0,
          overlappingCount: 0,
          overlappingIds: [],
          message: 'No non-migrated documents found.',
        };
      }

      log(`   📊 Found ${nonMigratedDocs.length} non-migrated documents`);

      // Check for duplicate _ids within the same collection
      const idStrings = nonMigratedDocs.map(doc => doc._id.toString());
      const uniqueIds = new Set(idStrings);
      
      if (uniqueIds.size < idStrings.length) {
        const duplicates = idStrings.length - uniqueIds.size;
        log(`   ❌ FOUND ${duplicates} DUPLICATE _ids within the same collection!`);
        
        // Find the duplicate IDs
        const seen = new Set<string>();
        const duplicateIds: ObjectId[] = [];
        for (const doc of nonMigratedDocs) {
          const idStr = doc._id.toString();
          if (seen.has(idStr)) {
            duplicateIds.push(doc._id);
          } else {
            seen.add(idStr);
          }
        }
        
        return {
          collection: collectionName,
          status: 'overlap',
          stagingCount: nonMigratedDocs.length,
          productionCount: nonMigratedDocs.length,
          overlappingCount: duplicates,
          overlappingIds: duplicateIds,
          message: `Found ${duplicates} duplicate _ids within the collection.`,
        };
      }

      log(`   ✅ Clean! No duplicate _ids found within [${collectionName}].`);
      
      return {
        collection: collectionName,
        status: 'clean',
        stagingCount: nonMigratedDocs.length,
        productionCount: nonMigratedDocs.length,
        overlappingCount: 0,
        overlappingIds: [],
        message: `No overlaps found. ${nonMigratedDocs.length} documents are safe.`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log(`   🔴 Error checking [${collectionName}]: ${errorMessage}`);
      
      return {
        collection: collectionName,
        status: 'clean',
        stagingCount: 0,
        productionCount: 0,
        overlappingCount: 0,
        overlappingIds: [],
        message: `Error: ${errorMessage}`,
      };
    }
  }

  /**
   * Run the migration from staging to production database.
   * This replicates the logic from backend/scripts/migrate-data.mjs
   * Only migrates documents that are not yet migrated:
   * - Staging: migratedToProd is false or not set
   * - Production: staging is false or not set
   */
  async runMigration(): Promise<MigrationResponse> {
    const logs: string[] = [];

    const log = (message: string, ...args: any[]) => {
      const fullMessage = args.length > 0 ? `${message} ${args.map(a => JSON.stringify(a)).join(' ')}` : message;
      logs.push(fullMessage);
      console.log(fullMessage);
    };

    // Summary counters
    const summary = {
      usersProcessed: 0,
      questionsMigrated: 0,
      answersMigrated: 0,
      reviewsMigrated: 0,
      submissionsMigrated: 0,
    };

    // Identity Translation Maps (Old Staging ID String -> New Prod ObjectId)
    const maps = {
      users: new Map<string, ObjectId>(),
      questions: new Map<string, ObjectId>(),
      answers: new Map<string, ObjectId>(),
      question_submissions: new Map<string, ObjectId>(),
      reviews: new Map<string, ObjectId>(),
    };

    // Helper function to cleanly swap IDs using the generated map
    const mapId = (oldId: any, idMap: Map<string, ObjectId>): any => {
      if (!oldId) return oldId;
      const oldStr = oldId.toString();
      return idMap.has(oldStr) ? idMap.get(oldStr) : oldId;
    };

    // Get environment variables
    const stagingUri = process.env.STAGING_DB_URI;
    const stagingDbName = process.env.STAGING_DB_NAME;
    const prodDbName = process.env.DB_NAME;

    if (!stagingUri || !stagingDbName || !prodDbName) {
      log('🔴 CRITICAL ERROR: STAGING_DB_URI, STAGING_DB_NAME, or PROD_DB_NAME not configured.');
      return {
        success: false,
        timestamp: new Date().toISOString(),
        logs,
        summary,
      };
    }

    const stagingClient = new MongoClient(stagingUri, {
      ssl: true,
      tls: true,
      tlsAllowInvalidCertificates: false,
      tlsAllowInvalidHostnames: false,
      retryWrites: true,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 30000,
    });

    let prodSession: any = null;

    try {
      // Get production database from the injected MongoDatabase
      const prodDb = await this.db.init();

      // Connect to staging
      log('🔄 Connecting to Atlas clusters...');
      await stagingClient.connect();
      log('🚀 Connected successfully.\n');

      const stagingDb = stagingClient.db(stagingDbName);

      // Start the Production Transaction Session
      prodSession = prodDb.client.startSession();
      prodSession.startTransaction({
        readPreference: 'primary',
        readConcern: { level: 'local' },
        writeConcern: { w: 'majority' },
      });
      log('🛡️  Production database transaction started. Safeguards active.');

      // ==========================================
      // 1. USERS PHASE (Map existing or create new)
      // Only migrate users where migratedToProd is not true/not set in staging
      // and staging is not true/not set in production
      // ==========================================
      log('\n👥 Migrating Users (only non-migrated)...');
      
      // Get staging users that are NOT yet migrated
      const stagingUsers = await stagingDb
        .collection('users')
        .find({ $or: [{ migratedToProd: { $exists: false } }, { migratedToProd: false }] })
        .toArray();

      log(`   Found ${stagingUsers.length} non-migrated staging users`);

      for (const user of stagingUsers) {
        const oldIdStr = user._id.toString();
        let existingProdUser = null;

        if (user.email) {
          existingProdUser = await prodDb.collection('users').findOne({ email: user.email }, { session: prodSession });
        }

        if (existingProdUser) {
          maps.users.set(oldIdStr, existingProdUser._id);
        } else {
          const newId = new ObjectId();
          maps.users.set(oldIdStr, newId);
          // Set isBlocked: true for newly created users
          const migratedUser = { ...user, _id: newId, staging: true, isBlocked: true };
          await prodDb.collection('users').insertOne(migratedUser, { session: prodSession });
        }
      }
      summary.usersProcessed = maps.users.size;
      log(`✅ Users mapped/migrated: ${maps.users.size}`);

      // ==========================================
      // 2. QUESTIONS PHASE (CLOSED ONLY, NOT YET MIGRATED)
      // ==========================================
      log('❓ Migrating Questions (Targeting status: "closed" only, non-migrated)...');

      // Get closed questions that are NOT yet migrated (migratedToProd not true/not set)
      const stagingQuestions = await stagingDb
        .collection('questions')
        .find({ 
          status: 'closed',
          $or: [{ migratedToProd: { $exists: false } }, { migratedToProd: false }]
        })
        .toArray();

      if (stagingQuestions.length > 0) {
        const questionOps = stagingQuestions.map((q: any) => {
          const newId = new ObjectId();
          maps.questions.set(q._id.toString(), newId);

          q.userId = mapId(q.userId, maps.users);
          q.moderatorId = mapId(q.moderatorId, maps.users);
          q.passedBy = mapId(q.passedBy, maps.users);
          q.referenceQuestionId = mapId(q.referenceQuestionId, maps.questions);

          if (Array.isArray(q.authors_history)) {
            q.authors_history = q.authors_history.map((hist: any) => ({
              ...hist,
              authorId: mapId(hist.authorId, maps.users),
              newAuthorId: mapId(hist.newAuthorId, maps.users),
            }));
          }

          if (Array.isArray(q.referenceQuestionDetails)) {
            q.referenceQuestionDetails = q.referenceQuestionDetails.map((ref: any) => ({
              ...ref,
              _id: mapId(ref._id, maps.questions),
            }));
          }

          return { ...q, _id: newId, staging: true };
        });

        await prodDb.collection('questions').insertMany(questionOps, { session: prodSession });
      }
      summary.questionsMigrated = stagingQuestions.length;
      log(`✅ Questions migrated to Production: ${stagingQuestions.length}`);

      // ==========================================
      // 3. ANSWERS PHASE (CASCADING FILTER, NON-MIGRATED)
      // ==========================================
      log('💬 Migrating Answers (Cascading Filter, non-migrated)...');
      
      // Get answers that are NOT yet migrated
      const stagingAnswers = await stagingDb
        .collection('answers')
        .find({ $or: [{ migratedToProd: { $exists: false } }, { migratedToProd: false }] })
        .toArray();

      const filteredAnswers = stagingAnswers.filter(
        (ans: any) => ans.questionId && maps.questions.has(ans.questionId.toString())
      );

      if (filteredAnswers.length > 0) {
        const answerOps = filteredAnswers.map((ans: any) => {
          const newId = new ObjectId();
          maps.answers.set(ans._id.toString(), newId);

          ans.questionId = mapId(ans.questionId, maps.questions);
          ans.authorId = mapId(ans.authorId, maps.users);
          ans.approvedBy = mapId(ans.approvedBy, maps.users);

          if (Array.isArray(ans.modifications)) {
            ans.modifications = ans.modifications.map((mod: any) => ({
              ...mod,
              modifiedBy: mapId(mod.modifiedBy, maps.users),
            }));
          }

          return { ...ans, _id: newId, staging: true };
        });

        await prodDb.collection('answers').insertMany(answerOps, { session: prodSession });
      }
      summary.answersMigrated = filteredAnswers.length;
      log(`✅ Answers migrated to Production: ${filteredAnswers.length} (Skipped ${stagingAnswers.length - filteredAnswers.length})`);

      // ==========================================
      // 4. REVIEWS PHASE (CASCADING FILTER, NON-MIGRATED)
      // ==========================================
      log('⭐ Migrating Reviews (Cascading Filter, non-migrated)...');
      
      // Get reviews that are NOT yet migrated
      const stagingReviews = await stagingDb
        .collection('reviews')
        .find({ $or: [{ migratedToProd: { $exists: false } }, { migratedToProd: false }] })
        .toArray();

      const filteredReviews = stagingReviews.filter(
        (rev: any) => rev.questionId && maps.questions.has(rev.questionId.toString())
      );

      if (filteredReviews.length > 0) {
        const reviewOps = filteredReviews.map((rev: any) => {
          const newId = new ObjectId();
          maps.reviews.set(rev._id.toString(), newId);

          rev.questionId = mapId(rev.questionId, maps.questions);
          rev.answerId = mapId(rev.answerId, maps.answers);
          rev.reviewerId = mapId(rev.reviewerId, maps.users);

          return { ...rev, _id: newId, staging: true };
        });

        await prodDb.collection('reviews').insertMany(reviewOps, { session: prodSession });
      }
      summary.reviewsMigrated = filteredReviews.length;
      log(`✅ Reviews migrated to Production: ${filteredReviews.length} (Skipped ${stagingReviews.length - filteredReviews.length})`);

      // ==========================================
      // 5. QUESTION SUBMISSIONS PHASE (CASCADING FILTER, NON-MIGRATED)
      // ==========================================
      log('📝 Migrating Question Submissions (Cascading Filter, non-migrated)...');
      
      // Get question submissions that are NOT yet migrated
      const stagingSubmissions = await stagingDb
        .collection('question_submissions')
        .find({ $or: [{ migratedToProd: { $exists: false } }, { migratedToProd: false }] })
        .toArray();

      const filteredSubmissions = stagingSubmissions.filter(
        (sub: any) => sub.questionId && maps.questions.has(sub.questionId.toString())
      );

      if (filteredSubmissions.length > 0) {
        const submissionOps = filteredSubmissions.map((sub: any) => {
          const newId = new ObjectId();
          maps.question_submissions.set(sub._id.toString(), newId);

          sub.questionId = mapId(sub.questionId, maps.questions);
          sub.lastRespondedBy = mapId(sub.lastRespondedBy, maps.users);

          if (Array.isArray(sub.queue)) {
            sub.queue = sub.queue.map((queueUser: any) => mapId(queueUser, maps.users));
          }

          if (Array.isArray(sub.history)) {
            sub.history = sub.history.map((hist: any) => {
              hist.updatedBy = mapId(hist.updatedBy, maps.users);
              hist.answer = mapId(hist.answer, maps.answers);
              hist.reviewId = mapId(hist.reviewId, maps.reviews);
              hist.rejectedBy = mapId(hist.rejectedBy, maps.users);
              hist.rejectedAnswer = mapId(hist.rejectedAnswer, maps.answers);
              hist.lastModifiedBy = mapId(hist.lastModifiedBy, maps.users);
              hist.modifiedAnswer = mapId(hist.modifiedAnswer, maps.answers);
              hist.approvedAnswer = mapId(hist.approvedAnswer, maps.answers);

              if (Array.isArray(hist.previousAllocations)) {
                hist.previousAllocations = hist.previousAllocations.map((alloc: any) => ({
                  ...alloc,
                  reviewerId: mapId(alloc.reviewerId, maps.users),
                }));
              }
              return hist;
            });
          }

          return { ...sub, _id: newId, staging: true };
        });

        await prodDb.collection('question_submissions').insertMany(submissionOps, { session: prodSession });
      }
      summary.submissionsMigrated = filteredSubmissions.length;
      log(`✅ Submissions migrated to Production: ${filteredSubmissions.length} (Skipped ${stagingSubmissions.length - filteredSubmissions.length})`);

      // ==========================================
      // 6. COMMIT ALL PRODUCTION OPERATIONS
      // ==========================================
      log('\n🚀 Committing transaction to Production Atlas...');
      await prodSession.commitTransaction();
      log('🎉 MIGRATION SUCCESSFULLY COMPLETED & COMMITTED TO PRODUCTION!');

      // ==========================================
      // 7. MARK STAGING RECORDS AS MIGRATED
      // ==========================================
      log('\n🏷️  Marking successfully migrated documents in the Staging database...');

      const migratedQuestionIds = Array.from(maps.questions.keys()).map((id) => new ObjectId(id));
      const migratedAnswerIds = Array.from(maps.answers.keys()).map((id) => new ObjectId(id));
      const migratedReviewIds = Array.from(maps.reviews.keys()).map((id) => new ObjectId(id));
      const migratedSubmissionIds = Array.from(maps.question_submissions.keys()).map((id) => new ObjectId(id));

      if (migratedQuestionIds.length > 0) {
        await stagingDb
          .collection('questions')
          .updateMany({ _id: { $in: migratedQuestionIds } }, { $set: { migratedToProd: true } });
      }
      if (migratedAnswerIds.length > 0) {
        await stagingDb
          .collection('answers')
          .updateMany({ _id: { $in: migratedAnswerIds } }, { $set: { migratedToProd: true } });
      }
      if (migratedReviewIds.length > 0) {
        await stagingDb
          .collection('reviews')
          .updateMany({ _id: { $in: migratedReviewIds } }, { $set: { migratedToProd: true } });
      }
      if (migratedSubmissionIds.length > 0) {
        await stagingDb
          .collection('question_submissions')
          .updateMany({ _id: { $in: migratedSubmissionIds } }, { $set: { migratedToProd: true } });
      }

      log('✅ Staging database successfully tagged with `migratedToProd: true` state flags.');

      return {
        success: true,
        timestamp: new Date().toISOString(),
        logs,
        summary,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log('\n🔴 CRITICAL ERROR DURING MIGRATION:', errorMessage);
      if (prodSession) {
        log('🚨 Aborting transaction... Rolling back all writes on Production!');
        try {
          await prodSession.abortTransaction();
          log('🗑️  Rollback successful. Production database remains untouched.');
        } catch (abortError: any) {
          log('⚠️  Failed to cleanly abort:', abortError.message);
        }
      }

      return {
        success: false,
        timestamp: new Date().toISOString(),
        logs,
        summary,
      };
    } finally {
      if (prodSession) await prodSession.endSession();
      await stagingClient.close();
      log('🔌 Connections safely closed.');
    }
  }

  /**
   * Migrate Firebase users for staging users.
   * 
   * This creates Firebase users for all users where staging: true in the production database.
   * The temporary password is "TemporaryPass@123".
   * 
   * Handles the edge case where a user with the same email already exists in Firebase
   * (from the other application) by linking to the existing Firebase UID.
   */
  async migrateFirebaseUsers(): Promise<{
    success: boolean;
    timestamp: string;
    logs: string[];
    summary: {
      total: number;
      created: number;
      existing: number;
      failed: number;
      skipped: number;
    };
  }> {
    const logs: string[] = [];

    const log = (message: string, ...args: any[]) => {
      const fullMessage = args.length > 0 ? `${message} ${args.map(a => JSON.stringify(a)).join(' ')}` : message;
      logs.push(fullMessage);
      console.log(fullMessage);
    };

    // Counters
    const counters = {
      total: 0,
      created: 0,
      existing: 0,
      failed: 0,
      skipped: 0,
    };

    const TEMP_PASSWORD = 'TemporaryPass@123';

    log('🚀 Starting Firebase user migration for staging users...');
    log(`Timestamp: ${new Date().toISOString()}`);
    log(`Temporary password for all users: ${TEMP_PASSWORD}`);

    try {
      // Get the production database
      const db = await this.db.init();

      // Get all users where staging: true
      // Note: Staging users already have firebaseUid from the old Firebase, 
      // but we need to create new Firebase users in the new Firebase project
      const stagingUsers = await db
        .collection('users')
        .find({
          staging: true
        })
        .toArray();

      counters.total = stagingUsers.length;
      log(`📊 Found ${stagingUsers.length} staging users`);

      if (stagingUsers.length === 0) {
        log('⚠️ No staging users found that need Firebase migration.');
        return {
          success: true,
          timestamp: new Date().toISOString(),
          logs,
          summary: counters,
        };
      }

      // Get Firebase Auth instance
      const auth = getFirebaseAuth();

      for (const user of stagingUsers) {
        const userId = user._id.toString();
        const email = user.email;

        log(`\n👤 Processing user: ${email} (${userId})`);

        // Skip if no email
        if (!email) {
          log(`   ⚠️ Skipping user ${userId}: No email provided`);
          counters.skipped++;
          continue;
        }

        try {
          // Try to create a new Firebase user
          const firebaseUser = await auth.createUser({
            email: email,
            emailVerified: false,
            password: TEMP_PASSWORD,
            displayName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined,
            disabled: false,
          });

          log(`   ✅ Created Firebase user: ${firebaseUser.uid}`);

          // Update the user document with the new firebaseUid and firebaseMigrated flag
          await db.collection('users').updateOne(
            { _id: user._id },
            {
              $set: {
                firebaseUid: firebaseUser.uid,
                firebaseMigrated: true,
              },
            }
          );

          log(`   ✅ Updated user document with firebaseUid and firebaseMigrated: true`);
          counters.created++;
        } catch (error: any) {
          // Handle the case where the email already exists in Firebase
          if (error.code === 'auth/email-already-exists') {
            log(`   ⚠️ Email already exists in Firebase. Getting existing user...`);

            try {
              // Get the existing Firebase user by email
              const existingUser = await auth.getUserByEmail(email);
              log(`   ✅ Found existing Firebase user: ${existingUser.uid}`);

              // Update the user document with the existing firebaseUid and firebaseMigrated flag
              await db.collection('users').updateOne(
                { _id: user._id },
                {
                  $set: {
                    firebaseUid: existingUser.uid,
                    firebaseMigrated: true,
                  },
                }
              );

              log(`   ✅ Updated user document with existing firebaseUid and firebaseMigrated: true`);
              counters.existing++;
            } catch (getUserError: any) {
              log(`   🔴 Failed to get existing Firebase user: ${getUserError.message}`);
              counters.failed++;
            }
          } else {
            // Other errors
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            log(`   🔴 Failed to create Firebase user: ${errorMessage}`);
            counters.failed++;
          }
        }
      }

      // Print summary
      log('\n========================================');
      log('📊 FIREBASE MIGRATION SUMMARY');
      log('========================================');
      log(`Total users processed: ${counters.total}`);
      log(`Created: ${counters.created}`);
      log(`Existing (linked): ${counters.existing}`);
      log(`Failed: ${counters.failed}`);
      log(`Skipped: ${counters.skipped}`);
      log('========================================');

      return {
        success: true,
        timestamp: new Date().toISOString(),
        logs,
        summary: counters,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log(`🔴 Error during Firebase migration: ${errorMessage}`);

      return {
        success: false,
        timestamp: new Date().toISOString(),
        logs,
        summary: counters,
      };
    }
  }
}
