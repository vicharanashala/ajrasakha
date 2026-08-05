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

  async getNextAgentNumber(session?: ClientSession): Promise<string> {
    const creds = await this.getAllAgentCredentials(session);
    let maxNum = 0;
    for (const cred of creds) {
      if (cred.agentNumber && cred.agentNumber.startsWith('agent_')) {
        const num = parseInt(cred.agentNumber.replace('agent_', ''), 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }
    return `agent_${maxNum + 1}`;
  }

  async upsertAgentCredential(
    agentNumberInput: string,
    usernameInput: string,
    password: string,
    session?: ClientSession,
  ): Promise<IPlivoAgentCredential> {
    await this.init();
    const now = new Date();
    
    let agentNumber = agentNumberInput ? agentNumberInput.trim() : '';
    if (!agentNumber) {
      agentNumber = await this.getNextAgentNumber(session);
    }

    // Sanitize username input (extract clean username if SIP URI is provided)
    let cleanUsername = usernameInput.trim();
    if (cleanUsername.startsWith('sip:')) {
      cleanUsername = cleanUsername.substring(4);
    }
    if (cleanUsername.includes('@')) {
      cleanUsername = cleanUsername.split('@')[0];
    }

    const sipUri = `sip:${cleanUsername}@phone.plivo.com`;

    await this.collection.updateOne(
      { agentNumber },
      {
        $set: {
          username: cleanUsername,
          sipUri,
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

  async deleteCredential(
    agentNumber: string,
    session?: ClientSession,
  ): Promise<boolean> {
    await this.init();
    const result = await this.collection.deleteOne({ agentNumber }, { session });
    return result.deletedCount > 0;
  }
}
