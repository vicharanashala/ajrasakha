import 'reflect-metadata';
import {inject, injectable} from 'inversify';
import {BadRequestError} from 'routing-controllers';
import {MongoDatabase} from '#shared/database/providers/mongo/MongoDatabase.js';
import {GLOBAL_TYPES} from '#root/types.js';
import type {
  ILocationService,
  ILocationState,
  ILocationDistrict,
  ILocationBlock,
  ILocationVillage,
} from '../interfaces/ILocationService.js';

@injectable()
export class LocationService implements ILocationService {
  constructor(
    @inject(GLOBAL_TYPES.Database)
    private readonly db: MongoDatabase,
  ) {}

  public async getStates(): Promise<ILocationState[]> {
    const collection = await this.db.getCollection<any>('states');
    const records = await collection.find({}).sort({ stateCode: 1 }).toArray();

    return records.map((record: any) => ({
      stateCode: record.stateCode,
      stateNameEnglish: record.stateNameEnglish,
    }));
  }

  public async getDistricts(stateCode: number): Promise<ILocationDistrict[]> {
    if (!stateCode) {
      throw new BadRequestError('stateCode is required');
    }

    const collection = await this.db.getCollection<any>('districts');
    const records = await collection
      .find({ stateCode: Number(stateCode) })
      .sort({ districtCode: 1 })
      .toArray();

    return records.map((record: any) => ({
      districtCode: record.districtCode,
      districtNameEnglish: record.districtNameEnglish,
      stateCode: record.stateCode,
    }));
  }

  public async getBlocks(districtCode: number): Promise<ILocationBlock[]> {
    if (!districtCode) {
      throw new BadRequestError('districtCode is required');
    }

    const collection = await this.db.getCollection<any>('blocks');
    const records = await collection
      .find({ districtCode: Number(districtCode) })
      .sort({ blockCode: 1 })
      .toArray();

    return records.map((record: any) => ({
      blockCode: record.blockCode,
      blockNameEnglish: record.blockNameEnglish,
      districtCode: record.districtCode,
    }));
  }

  public async getVillages(blockCode: number): Promise<ILocationVillage[]> {
    if (!blockCode) {
      throw new BadRequestError('blockCode is required');
    }

    const collection = await this.db.getCollection<any>('villages');
    const records = await collection
      .find({ blockCode: Number(blockCode) })
      .sort({ villageCode: 1 })
      .toArray();

    return records.map((record: any) => ({
      villageCode: record.villageCode,
      villageNameEnglish: record.villageNameEnglish,
      blockCode: record.blockCode,
      pincode: record.pincode || 0, // Fallback since it might not be in DB
    }));
  }
}
