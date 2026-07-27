import 'reflect-metadata';
import { injectable, inject } from 'inversify';
import { MongoClient, ObjectId } from 'mongodb';
import { GLOBAL_TYPES } from '#root/types.js';
import { MongoDatabase } from '#root/shared/database/providers/mongo/MongoDatabase.js';

export interface OverlapResult {
  collection: string;
  status: 'clean' | 'overlap';
  stagingCount: number;
  productionCount: number;
  overlappingCount: number;
  sampleOverlappingIds?: ObjectId[];
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
          message: 'No non-migrated staging documents found.',
        };
      }

      const stagingIds = stagingDocs.map(doc => doc._id);
      log(`   📊 Found ${stagingIds.length} non-migrated staging documents (migratedToProd: false/not set)`);

      // 2. Use $in operator to efficiently find overlapping documents in production
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

      // 4. Report findings
      if (overlappingIds.length > 0) {
        log(`   ❌ FOUND OVERLAPS! Total overlapping _ids: ${overlappingIds.length}`);
        log(`   These documents exist in both staging and production with the same _id but are not marked as migrated.`);
        log(`   Sample overlapping IDs:`, overlappingIds.slice(0, 5).map(id => id.toString()));
        
        return {
          collection: collectionName,
          status: 'overlap',
          stagingCount: stagingIds.length,
          productionCount: overlappingIds.length,
          overlappingCount: overlappingIds.length,
          sampleOverlappingIds: overlappingIds.slice(0, 5),
          message: `Found ${overlappingIds.length} overlapping documents out of ${stagingIds.length} non-migrated staging documents. These need to be resolved before migration.`,
        };
      } else {
        log(`   ✅ Clean! Zero _id overlaps found.`);
        log(`   ${stagingIds.length} staging documents have no ID conflicts with production.`);
        
        return {
          collection: collectionName,
          status: 'clean',
          stagingCount: stagingIds.length,
          productionCount: 0,
          overlappingCount: 0,
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
        
        return {
          collection: collectionName,
          status: 'overlap',
          stagingCount: nonMigratedDocs.length,
          productionCount: nonMigratedDocs.length,
          overlappingCount: duplicates,
          sampleOverlappingIds: nonMigratedDocs.slice(0, 5).map(d => d._id),
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
        message: `Error: ${errorMessage}`,
      };
    }
  }
}