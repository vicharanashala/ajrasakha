import { injectable, inject } from 'inversify';
import { InternalServerError } from 'routing-controllers';
import type { ICallFarmerRepository, CallFarmer, FarmerProfile } from '#root/shared/database/interfaces/IFarmerRepository.js';
import { PLIVO_TYPES } from '../types.js';

export interface IFarmerService {
  getFarmerByPhoneNo(phoneNo: string): Promise<CallFarmer | null>;
  createFarmer(phoneNo: string, profile: FarmerProfile): Promise<string>;
  updateFarmer(phoneNo: string, profile: FarmerProfile): Promise<boolean>;
  deleteFarmer(phoneNo: string): Promise<boolean>;
  getAllFarmers(): Promise<CallFarmer[]>;
}

@injectable()
export class FarmerService implements IFarmerService {
  constructor(
    @inject(PLIVO_TYPES.CallFarmerRepository)
    private readonly callFarmerRepository: ICallFarmerRepository,
  ) { }

  async getFarmerByPhoneNo(phoneNo: string): Promise<CallFarmer | null> {
    try {
      const result = await this.callFarmerRepository.findByPhoneNo(phoneNo);
      return result;
    } catch (error: any) {
      console.error(`[FARMER_FLOW] FarmerService.getFarmerByPhoneNo: Error for phoneNo ${phoneNo}:`, error.stack || error);
      throw new InternalServerError(
        `Failed to get farmer by phone number: ${error}`,
      );
    }
  }

  async createFarmer(
    phoneNo: string,
    profile: FarmerProfile,
  ): Promise<string> {
    try {
      const farmer: CallFarmer = {
        phoneNo,
        profile,
      };
      const newId = await this.callFarmerRepository.create(farmer);
      return newId;
    } catch (error: any) {
      console.error(`[FARMER_FLOW] FarmerService.createFarmer: Error for phoneNo ${phoneNo}:`, error.stack || error);
      throw new InternalServerError(`Failed to create farmer: ${error}`);
    }
  }

  async updateFarmer(
    phoneNo: string,
    profile: FarmerProfile,
  ): Promise<boolean> {
    try {
      const result = await this.callFarmerRepository.update(phoneNo, profile);
      return result;
    } catch (error: any) {
      console.error(`[FARMER_FLOW] FarmerService.updateFarmer: Error for phoneNo ${phoneNo}:`, error.stack || error);
      throw new InternalServerError(`Failed to update farmer: ${error}`);
    }
  }

  async deleteFarmer(phoneNo: string): Promise<boolean> {
    try {
      const result = await this.callFarmerRepository.delete(phoneNo);
      return result;
    } catch (error: any) {
      console.error(`[FARMER_FLOW] FarmerService.deleteFarmer: Error for phoneNo ${phoneNo}:`, error.stack || error);
      throw new InternalServerError(`Failed to delete farmer: ${error}`);
    }
  }

  async getAllFarmers(): Promise<CallFarmer[]> {
    try {
      const result = await this.callFarmerRepository.getAll();
      // console.log(`[FARMER_FLOW] FarmerService.getAllFarmers: Success. Count: ${result.length}`);
      return result;
    } catch (error: any) {
      console.error(`[FARMER_FLOW] FarmerService.getAllFarmers: Error:`, error.stack || error);
      throw new InternalServerError(`Failed to get all farmers: ${error}`);
    }
  }
}
