import { GLOBAL_TYPES } from '#root/types.js';
import { IDatabase } from '#shared/database/interfaces/IDatabase.js';
import { injectable, inject } from 'inversify';
import { Db, MongoClient, Document, Collection } from 'mongodb';

@injectable()
export class MongoDatabase implements IDatabase<Db> {
  private client: MongoClient | null;
  public database: Db | null;
  private connectingPromise: Promise<Db> | null = null;

  constructor(
    @inject(GLOBAL_TYPES.uri)
    private readonly uri: string,
    @inject(GLOBAL_TYPES.dbName)
    private readonly dbName: string,
    protected readonly dbIdentifier: string = 'acc-center',
  ) {
    if (process.env.SKIP_DB_CONNECTION === 'true') {
      this.client = null;
      this.database = null;
      console.log(
        `[${this.dbIdentifier}] Database connection skipped due to SKIP_DB_CONNECTION environment variable`,
      );
      return;
    }

    console.log(`[${this.dbIdentifier}] Initializing database connection...`);

    // Extracting SSL config or using regular client depending on URL
    const isSsl = uri.includes('ssl=true') || uri.includes('tls=true') || uri.includes('+srv');
    const options: any = {
      retryWrites: true,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 30000
    };
    if (isSsl) {
      options.ssl = true;
      options.tls = true;
      options.tlsAllowInvalidCertificates = false;
      options.tlsAllowInvalidHostnames = false;
    }

    this.client = new MongoClient(uri, options);
  }

  private async connect(): Promise<Db> {
    if (this.database) {
      return this.database;
    }

    if (!this.connectingPromise) {
      this.connectingPromise = (async () => {
        try {
          await this.client?.connect();
          this.database = this.client?.db(this.dbName);
          if (this.database) {
            const db = this.database;
            db.collection('call_details').createIndex({ callUuid: 1 }, { unique: true }).catch(async (err) => {
              if (err.message && err.message.includes('E11000')) {
                console.warn(`[${this.dbIdentifier}] Legacy duplicate callUuid found in call_details. Deduplicating...`);
                try {
                  const col = db.collection('call_details');
                  const duplicates = await col.aggregate([
                    { $group: { _id: "$callUuid", count: { $sum: 1 }, ids: { $push: "$_id" } } },
                    { $match: { count: { $gt: 1 }, _id: { $ne: null } } }
                  ]).toArray();

                  for (const dup of duplicates) {
                    const docs = await col.find({ _id: { $in: dup.ids } }).sort({ updatedAt: -1, createdAt: -1 }).toArray();
                    if (docs.length > 1) {
                      const keepDoc = docs[0];
                      const deleteIds = docs.slice(1).map(d => d._id);
                      const mergedQueryIds = Array.from(new Set(docs.flatMap(d => d.queryIds || [])));

                      await col.updateOne(
                        { _id: keepDoc._id },
                        { $set: { queryIds: mergedQueryIds } }
                      );
                      await col.deleteMany({ _id: { $in: deleteIds } });
                      console.log(`Safely merged & cleaned up ${deleteIds.length} legacy duplicate call_details for callUuid: ${dup._id}`);
                    }
                  }
                  await col.createIndex({ callUuid: 1 }, { unique: true });
                  console.log(`[${this.dbIdentifier}] Unique index callUuid_1 created on call_details after deduplication.`);
                } catch (dedupErr: any) {
                  console.warn(`[${this.dbIdentifier}] Deduplication warning:`, dedupErr.message);
                }
              } else {
                console.warn(`[${this.dbIdentifier}] Index create warning for call_details:`, err.message);
              }
            });
            db.collection('call_queries').createIndex({ callUuid: 1 }).catch((err) => {
              console.warn(`[${this.dbIdentifier}] Index create warning for call_queries:`, err.message);
            });
          }
          return this.database!;
        } catch (err) {
          this.connectingPromise = null;
          throw err;
        }
      })();
    }

    return this.connectingPromise;
  }

  public async disconnect(): Promise<Db | null> {
    if (this.client) {
      await this.client.close();
      this.database = null;
    }
    return this.database;
  }

  public async init(): Promise<Db> {
    if (!this.database) {
      await this.connect();
    }
    return this.database;
  }

  public isConnected(): boolean {
    return this.database !== null;
  }

  public async getClient(): Promise<MongoClient> {
    return this.client;
  }

  public async getCollection<T extends Document>(
    name: string,
  ): Promise<Collection<T>> {
    if (!this.database) {
      await this.connect();
    }
    return this.database.collection<T>(name);
  }
}
