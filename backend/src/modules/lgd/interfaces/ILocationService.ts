export interface ILgdLocation {
  stateCode: number;
  stateNameEnglish: string;
  districtCode: number;
  districtNameEnglish: string;
  subdistrictCode: number;
  subdistrictNameEnglish: string;
  villageCode: number;
  villageNameEnglish: string;
  pincode: number;
  [key: string]: unknown;
}

export interface ILocationState {
  stateCode: number;
  stateNameEnglish: string;
}

export interface ILocationDistrict {
  districtCode: number;
  districtNameEnglish: string;
  stateCode: number;
}

export interface ILocationBlock {
  blockCode: number;
  blockNameEnglish: string;
  districtCode: number;
}

export interface ILocationVillage {
  villageCode: number;
  villageNameEnglish: string;
  blockCode: number;
}

export interface IKvk {
  kvkId: string;
  kvkName: string;
  kvkAddress?: string;
  districtCode?: number;
  stateCode?: number;
  latitude?: number;
  longitude?: number;
}

export interface IKvkSyncResult {
  success: boolean;
  message: string;
}

export interface ILocationService {
  getStates(): Promise<ILocationState[]>;
  getDistricts(stateCode: number): Promise<ILocationDistrict[]>;
  getBlocks(districtCode: number): Promise<ILocationBlock[]>;
  getVillages(blockCode: number): Promise<ILocationVillage[]>;
  getKvks(districtCode: number): Promise<IKvk[]>;
  syncKvks(): Promise<IKvkSyncResult>;
}
