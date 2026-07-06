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
