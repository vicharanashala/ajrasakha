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
  const last10 = digits.length >= 10 ? digits.slice(-10) : (digits.length > 0 ? digits : '');
  if (last10) {
    variations.add(last10);
    variations.add(`+91${last10}`);
    variations.add(`91${last10}`);
    variations.add(`0${last10}`);
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
      const digits = phoneNo.replace(/\D/g, '');
      const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
      const phoneRegex = last10 ? new RegExp(last10 + '$') : null;

      const orConditions: any[] = [
        { phoneNo: { $in: phoneVariants } },
        { "profile.phoneNo": { $in: phoneVariants } },
        { phoneNumber: { $in: phoneVariants } },
        { "profile.phoneNumber": { $in: phoneVariants } },
        { phone: { $in: phoneVariants } },
        { "profile.phone": { $in: phoneVariants } },
        { mobile: { $in: phoneVariants } },
        { "profile.mobile": { $in: phoneVariants } }
      ];
      if (phoneRegex) {
        orConditions.push(
          { phoneNo: phoneRegex },
          { "profile.phoneNo": phoneRegex },
          { phoneNumber: phoneRegex },
          { "profile.phoneNumber": phoneRegex },
          { phone: phoneRegex },
          { "profile.phone": phoneRegex }
        );
      }

      const queryMatch = { $or: orConditions };

      let rawDoc = await this.callFarmersCollection.findOne(queryMatch, { session }) as any;

      if (!rawDoc) {
        try {
          const fallbackColl = await this.db.getCollection('farmer_details');
          rawDoc = await fallbackColl.findOne(queryMatch, { session }) as any;
        } catch {
          // ignore fallback error
        }
      }

      if (!rawDoc) {
        return null;
      }
      const profile = rawDoc.profile || rawDoc;
      const farmerName = profile.farmerName || profile.extracted_name || profile.name || profile.fullName || profile.FarmerName || rawDoc.farmerName || rawDoc.name || rawDoc.fullName || rawDoc.FarmerName || '';
      const blockName = profile.blockName || profile.block || profile.extracted_block || profile.address?.block || rawDoc.blockName || rawDoc.block || '';
      const villageName = profile.villageName || profile.village || profile.extracted_village || profile.address?.village || rawDoc.villageName || rawDoc.village || '';
      const districtName = profile.district || profile.extracted_district || profile.address?.district || rawDoc.district || '';
      const stateName = profile.state || profile.extracted_state || profile.address?.state || rawDoc.state || '';
      const cropName = profile.primaryCrop || profile.crop || profile.extracted_primary_crop || rawDoc.primaryCrop || rawDoc.crop || '';

      return {
        _id: rawDoc._id?.toString(),
        phoneNo: rawDoc.phoneNo || phoneNo,
        profile: {
          farmerName,
          phoneNo: rawDoc.phoneNo || phoneNo,
          age: profile.age !== undefined && profile.age !== null ? Number(profile.age) : undefined,
          gender: profile.gender || '',
          villageName,
          blockName,
          district: districtName,
          state: stateName,
          primaryCrop: cropName,
          secondaryCrop: profile.secondaryCrop || (Array.isArray(profile.extracted_secondary_crops) ? profile.extracted_secondary_crops.join(', ') : (profile.extracted_secondary_crops || profile.extracted_secondary_crop || (Array.isArray(profile.cropsCultivated) ? profile.cropsCultivated.filter((c: string) => c !== cropName).join(', ') : ''))),
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
