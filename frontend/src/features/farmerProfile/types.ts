export type FarmerCategory = "small" | "marginal" | "medium" | "large";
export type SoilType = "alluvial" | "black" | "sandy" | "loam" | "clay" | "red";
export type IrrigationSource = "borewell" | "canal" | "drip" | "sprinkler" | "rainfed";
export type FarmingType = "chemical" | "organic" | "mixed" | "natural";

export interface IFarmerProfile {
  id: string; // e.g. "KID-2026-9824"
  farmerName: string;
  phoneNo: string;
  gender: "male" | "female" | "other";
  age?: number;
  
  // Location
  state: string;
  district: string;
  blockOrTehsil: string;
  villageName: string;
  pincode?: string;

  // Farm Details
  landSizeAcres: number;
  farmerCategory: FarmerCategory;
  soilType: SoilType;
  irrigationSource: IrrigationSource;
  
  // Crops & Farming Practices
  primaryCrop: string;
  secondaryCrops: string[];
  farmingType: FarmingType;

  // Livestock & Machinery
  livestock: string[];
  machineryOwned: string[];

  // Meta
  preferredLanguage: "hi" | "en" | "hinglish";
  registeredAt: string;
  isVerified: boolean;
}

export interface IStateDistrictData {
  state: string;
  stateHi: string;
  districts: string[];
}
