import { inject, injectable } from 'inversify';
import { Collection, ClientSession } from 'mongodb';
import { InternalServerError } from 'routing-controllers';
import { MongoDatabase } from '../MongoDatabase.js';
import { GLOBAL_TYPES } from '#root/types.js';
import type {
  ICallFarmerRepository,
  CallFarmer,
  FarmerProfile,
} from '#shared/database/interfaces/IFarmerRepository.js';

@injectable()
export class CallFarmerRepository implements ICallFarmerRepository {
  private callFarmersCollection!: Collection<CallFarmer>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) { }

  private async init() {
    this.callFarmersCollection = await this.db.getCollection<CallFarmer>(
      'Farmers_info',
    );
  }

  async findByPhoneNo(
    phoneNo: string,
    session?: ClientSession,
  ): Promise<CallFarmer | null> {
    try {
      await this.init();
      const result = await this.callFarmersCollection.findOne(
        { phoneNo },
        { session },
      );
      return result;
    } catch (error: any) {
      console.error(`[FARMER_FLOW] CallFarmerRepository.findByPhoneNo: Error querying phoneNo ${phoneNo}:`, error.stack || error);
      throw new InternalServerError(
        `Failed to find farmer by phone number: ${error}`,
      );
    }
  }

  async create(
    farmer: CallFarmer,
    session?: ClientSession,
  ): Promise<string> {
    try {
      await this.init();
      const now = new Date();
      const doc = {
        ...farmer,
        createdAt: now,
        updatedAt: now,
      };
      const result = await this.callFarmersCollection.insertOne(doc, { session });
      return result.insertedId.toString();
    } catch (error: any) {
      console.error(`[FARMER_FLOW] CallFarmerRepository.create: Error creating farmer record:`, error.stack || error);
      throw new InternalServerError(`Failed to create farmer: ${error}`);
    }
  }

  async update(
    phoneNo: string,
    profile: FarmerProfile,
    session?: ClientSession,
  ): Promise<boolean> {
    try {
      await this.init();
      const result = await this.callFarmersCollection.updateOne(
        { phoneNo },
        {
          $set: {
            profile,
            updatedAt: new Date(),
          },
        },
        { session },
      );
      return result.modifiedCount > 0;
    } catch (error: any) {
      console.error(`[FARMER_FLOW] CallFarmerRepository.update: Error updating farmer record for phoneNo ${phoneNo}:`, error.stack || error);
      throw new InternalServerError(`Failed to update farmer: ${error}`);
    }
  }

  async delete(
    phoneNo: string,
    session?: ClientSession,
  ): Promise<boolean> {
    try {
      await this.init();
      const result = await this.callFarmersCollection.deleteOne(
        { phoneNo },
        { session },
      );
      return result.deletedCount > 0;
    } catch (error: any) {
      console.error(`[FARMER_FLOW] CallFarmerRepository.delete: Error deleting farmer record for phoneNo ${phoneNo}:`, error.stack || error);
      throw new InternalServerError(`Failed to delete farmer: ${error}`);
    }
  }

  async getAll(session?: ClientSession): Promise<CallFarmer[]> {
    try {
      await this.init();
      const result = await this.callFarmersCollection
        .find({}, { session })
        .sort({ createdAt: -1 })
        .toArray();
      return result;
    } catch (error: any) {
      console.error(`[FARMER_FLOW] CallFarmerRepository.getAll: Error retrieving all records:`, error.stack || error);
      throw new InternalServerError(`Failed to get all farmers: ${error}`);
    }
  }
}
