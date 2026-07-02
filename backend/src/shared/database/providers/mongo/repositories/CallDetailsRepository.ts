import { inject, injectable } from 'inversify';
import { Collection, ClientSession } from 'mongodb';
import { InternalServerError } from 'routing-controllers';
import { MongoDatabase } from '../MongoDatabase.js';
import { GLOBAL_TYPES } from '#root/types.js';
import type {
  ICallDetailsRepository,
  CallDetails,
} from '#root/shared/database/interfaces/ICallDetailsRepository.js';

@injectable()
export class CallDetailsRepository implements ICallDetailsRepository {
  private callDetailsCollection!: Collection<CallDetails>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) { }

  private async init() {
    this.callDetailsCollection = await this.db.getCollection<CallDetails>(
      'call_details',
    );
  }

  async create(
    details: CallDetails,
    session?: ClientSession,
  ): Promise<string> {
    try {
      await this.init();
      const now = new Date();
      const doc = {
        ...details,
        createdAt: now,
        updatedAt: now,
      };
      const result = await this.callDetailsCollection.insertOne(doc, { session });
      return result.insertedId.toString();
    } catch (error: any) {
      console.error(`[CALL_DETAILS_FLOW] CallDetailsRepository.create: Error creating call details record:`, error.stack || error);
      throw new InternalServerError(`Failed to create call details: ${error}`);
    }
  }

  async getByCallUuid(
    callUuid: string,
    session?: ClientSession,
  ): Promise<CallDetails | null> {
    try {
      await this.init();
      const result = await this.callDetailsCollection.findOne(
        { callUuid },
        { session },
      );
      return result;
    } catch (error: any) {
      console.error(`[CALL_DETAILS_FLOW] CallDetailsRepository.getByCallUuid: Error querying callUuid ${callUuid}:`, error.stack || error);
      throw new InternalServerError(
        `Failed to find call details by UUID: ${error}`,
      );
    }
  }

  async getAll(session?: ClientSession): Promise<CallDetails[]> {
    try {
      await this.init();
      const result = await this.callDetailsCollection
        .find({}, { session })
        .sort({ createdAt: -1 })
        .toArray();
      return result;
    } catch (error: any) {
      console.error(`[CALL_DETAILS_FLOW] CallDetailsRepository.getAll: Error retrieving all records:`, error.stack || error);
      throw new InternalServerError(`Failed to get all call details: ${error}`);
    }
  }
}
