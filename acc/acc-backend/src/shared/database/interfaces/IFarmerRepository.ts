import type { ClientSession } from 'mongodb';

export interface FarmerProfile {
  farmerName?: string;
  age?: number;
  gender?: string;
  villageName?: string;
  blockName?: string;
  district?: string;
  state?: string;
  phoneNo?: string;
  languagePreference?: string;
  yearsOfExperience?: number;
  cropsCultivated?: string[];
  primaryCrop?: string;
  secondaryCrop?: string;
  awarenessOfKCC?: boolean;
  usesAgriApps?: boolean;
  highestEducatedPerson?: string;
  numberOfSmartphones?: number;
  location?: {
    latitude: number;
    longitude: number;
  };
}

export interface CallFarmer {
  _id?: string;
  phoneNo: string;
  profile: FarmerProfile;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICallFarmerRepository {
  findByPhoneNo(phoneNo: string, session?: ClientSession): Promise<CallFarmer | null>;
  create(farmer: CallFarmer, session?: ClientSession): Promise<string>;
  update(phoneNo: string, profile: FarmerProfile, session?: ClientSession): Promise<boolean>;
  delete(phoneNo: string, session?: ClientSession): Promise<boolean>;
  getAll(session?: ClientSession): Promise<CallFarmer[]>;
}
