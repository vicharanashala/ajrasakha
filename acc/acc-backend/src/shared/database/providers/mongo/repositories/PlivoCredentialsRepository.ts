import { injectable, inject } from 'inversify';
import { Collection, ObjectId, ClientSession } from 'mongodb';
import { GLOBAL_TYPES } from '#root/types.js';
import { MongoDatabase } from '../MongoDatabase.js';
import {
  IPlivoCredentialsRepository,
  IPlivoAgentCredential,
} from '#shared/database/interfaces/IPlivoCredentialsRepository.js';

@injectable()
export class PlivoCredentialsRepository implements IPlivoCredentialsRepository {
  private collection!: Collection<any>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private readonly database: MongoDatabase,
  ) {}

  private async init() {
    if (!this.collection) {
      const db = await this.database.init();
      this.collection = db.collection('call_credentials');
    }
  }

  async findByAgentNumber(
    agentNumber: string,
    session?: ClientSession,
  ): Promise<IPlivoAgentCredential | null> {
    await this.init();
    const doc = await this.collection.findOne({ agentNumber }, { session });
    if (!doc) return null;
    return {
      ...doc,
      _id: doc._id.toString(),
    } as IPlivoAgentCredential;
  }

  async upsertAgentCredential(
    agentNumber: string,
    username: string,
    password: string,
    session?: ClientSession,
  ): Promise<IPlivoAgentCredential> {
    await this.init();
    const now = new Date();
    await this.collection.updateOne(
      { agentNumber },
      {
        $set: {
          username,
          password,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      { upsert: true, session },
    );

    const updatedDoc = await this.collection.findOne({ agentNumber }, { session });
    return {
      ...updatedDoc,
      _id: updatedDoc._id.toString(),
    } as IPlivoAgentCredential;
  }

  async getAllAgentCredentials(
    session?: ClientSession,
  ): Promise<IPlivoAgentCredential[]> {
    await this.init();
    const docs = await this.collection.find({}, { session }).toArray();
    return docs.map((doc: any) => ({
      ...doc,
      _id: doc._id.toString(),
    })) as IPlivoAgentCredential[];
  }
}
