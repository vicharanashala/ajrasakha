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

function getPhoneVariations(raw: string): string[] {
  if (!raw) return [];
  const clean = raw.trim();
  const digits = clean.replace(/\D/g, '');
  const variations = new Set<string>();
  variations.add(clean);
  if (digits) variations.add(digits);
  if (digits.length === 10) {
    variations.add(`+91${digits}`);
    variations.add(`91${digits}`);
    variations.add(`0${digits}`);
  } else if (digits.length === 12 && digits.startsWith('91')) {
    const core = digits.slice(2);
    variations.add(core);
    variations.add(`+${digits}`);
    variations.add(`0${core}`);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    const core = digits.slice(1);
    variations.add(core);
    variations.add(`+91${core}`);
    variations.add(`91${core}`);
  }
  return [...variations].filter(Boolean);
}

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
      const phoneVariants = getPhoneVariations(phoneNo);
      const rawDoc = await this.callFarmersCollection.findOne(
        {
          $or: [
            { phoneNo: { $in: phoneVariants } },
            { "profile.phoneNo": { $in: phoneVariants } }
          ]
        },
        { session },
      ) as any;
      if (!rawDoc) {
        return null;
      }
      const profile = rawDoc.profile || rawDoc;
      return {
        _id: rawDoc._id?.toString(),
        phoneNo: rawDoc.phoneNo || phoneNo,
        profile: {
          farmerName: profile.farmerName || profile.extracted_name || profile.name || '',
          phoneNo: profile.phoneNo || phoneNo,
          age: profile.age !== undefined && profile.age !== null ? Number(profile.age) : undefined,
          gender: profile.gender || '',
          villageName: profile.villageName || profile.village || '',
          blockName: profile.blockName || profile.block || '',
          district: profile.district || '',
          state: profile.state || '',
          primaryCrop: profile.primaryCrop || profile.extracted_primary_crop || profile.crop || '',
          secondaryCrop: profile.secondaryCrop || (Array.isArray(profile.extracted_secondary_crops) ? profile.extracted_secondary_crops.join(', ') : (profile.extracted_secondary_crops || profile.extracted_secondary_crop || (Array.isArray(profile.cropsCultivated) ? profile.cropsCultivated.filter((c: string) => c !== (profile.primaryCrop || profile.extracted_primary_crop || profile.crop)).join(', ') : ''))),
          languagePreference: profile.languagePreference || profile.extracted_language_preference || profile.extracted_language || profile.language || '',
          yearsOfExperience: profile.yearsOfExperience !== undefined && profile.yearsOfExperience !== null ? Number(profile.yearsOfExperience) : (profile.extracted_years_of_experience !== undefined && profile.extracted_years_of_experience !== null ? Number(profile.extracted_years_of_experience) : undefined),
          highestEducatedPerson: profile.highestEducatedPerson || profile.extracted_highest_education || profile.extracted_highest_educated || '',
          numberOfSmartphones: profile.numberOfSmartphones !== undefined && profile.numberOfSmartphones !== null ? Number(profile.numberOfSmartphones) : (profile.extracted_smartphones_at_home !== undefined && profile.extracted_smartphones_at_home !== null ? Number(profile.extracted_smartphones_at_home) : undefined),
          location: profile.location,
        },
        createdAt: rawDoc.createdAt || new Date(),
        updatedAt: rawDoc.updatedAt || new Date(),
      };
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
      const phoneVariants = getPhoneVariations(farmer.phoneNo);
      const result = await this.callFarmersCollection.updateOne(
        {
          $or: [
            { phoneNo: { $in: phoneVariants } },
            { "profile.phoneNo": { $in: phoneVariants } }
          ]
        },
        {
          $set: {
            profile: farmer.profile,
            updatedAt: now,
          },
          $setOnInsert: {
            phoneNo: farmer.phoneNo,
            createdAt: now,
          },
        },
        { upsert: true, session }
      );
      return result.upsertedId ? result.upsertedId.toString() : farmer.phoneNo;
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
      const now = new Date();
      const phoneVariants = getPhoneVariations(phoneNo);
      const result = await this.callFarmersCollection.updateOne(
        {
          $or: [
            { phoneNo: { $in: phoneVariants } },
            { "profile.phoneNo": { $in: phoneVariants } }
          ]
        },
        {
          $set: {
            profile,
            updatedAt: now,
          },
          $setOnInsert: {
            phoneNo,
            createdAt: now,
          },
        },
        { upsert: true, session },
      );
      return (result.modifiedCount > 0 || result.upsertedCount > 0 || result.matchedCount > 0);
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
      const phoneVariants = getPhoneVariations(phoneNo);
      const result = await this.callFarmersCollection.deleteMany(
        {
          $or: [
            { phoneNo: { $in: phoneVariants } },
            { "profile.phoneNo": { $in: phoneVariants } }
          ]
        },
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
      const docs = await this.callFarmersCollection
        .find({}, { session })
        .sort({ createdAt: -1 })
        .toArray() as any[];

      return docs.map((doc) => {
        const profile = doc.profile || doc;
        return {
          _id: doc._id?.toString(),
          phoneNo: doc.phoneNo,
          profile: {
            farmerName: profile.farmerName || profile.extracted_name || profile.name || '',
            phoneNo: profile.phoneNo || doc.phoneNo || '',
            age: profile.age !== undefined && profile.age !== null ? Number(profile.age) : undefined,
            gender: profile.gender || '',
            villageName: profile.villageName || profile.village || '',
            blockName: profile.blockName || profile.block || '',
            district: profile.district || '',
            state: profile.state || '',
            primaryCrop: profile.primaryCrop || profile.extracted_primary_crop || profile.crop || '',
            secondaryCrop: profile.secondaryCrop || (Array.isArray(profile.extracted_secondary_crops) ? profile.extracted_secondary_crops.join(', ') : (profile.extracted_secondary_crops || profile.extracted_secondary_crop || (Array.isArray(profile.cropsCultivated) ? profile.cropsCultivated.filter((c: string) => c !== (profile.primaryCrop || profile.crop)).join(', ') : ''))),
            languagePreference: profile.languagePreference || profile.extracted_language_preference || profile.extracted_language || profile.language || '',
            yearsOfExperience: profile.yearsOfExperience !== undefined && profile.yearsOfExperience !== null ? Number(profile.yearsOfExperience) : (profile.extracted_years_of_experience !== undefined && profile.extracted_years_of_experience !== null ? Number(profile.extracted_years_of_experience) : undefined),
            highestEducatedPerson: profile.highestEducatedPerson || profile.extracted_highest_education || profile.extracted_highest_educated || '',
            numberOfSmartphones: profile.numberOfSmartphones !== undefined && profile.numberOfSmartphones !== null ? Number(profile.numberOfSmartphones) : (profile.extracted_smartphones_at_home !== undefined && profile.extracted_smartphones_at_home !== null ? Number(profile.extracted_smartphones_at_home) : undefined),
            location: profile.location,
          },
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        };
      });
    } catch (error: any) {
      console.error(`[FARMER_FLOW] CallFarmerRepository.getAll: Error retrieving all records:`, error.stack || error);
      throw new InternalServerError(`Failed to get all farmers: ${error}`);
    }
  }
}
