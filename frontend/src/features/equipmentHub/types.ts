export type EquipmentCategory =
  | "all"
  | "tractors"
  | "tillage"
  | "sowing"
  | "spraying"
  | "harvesting"
  | "irrigation";

export interface IFarmingEquipment {
  id: string;
  name: string;
  nameHi: string;
  category: EquipmentCategory;
  categoryLabelEn: string;
  categoryLabelHi: string;
  mrpPrice: number;
  subsidyPercentage: number;
  subsidyScheme: string;
  effectivePrice: number;
  hourlyRentalRate: number; // ₹ per hour
  perAcreRentalRate: number; // ₹ per acre
  includesFuelAndDriver: boolean;
  powerRating: string;
  workCapacity: string;
  fuelConsumption: string;
  suitableCrops: string[];
  suitableCropsHi: string[];
  keyFeatures: string[];
  keyFeaturesHi: string[];
  statesAvailable: string[];
  iconType: "tractor" | "rotavator" | "seeder" | "drone" | "harvester" | "pump" | "plough" | "sprayer";
  badge?: string;
  popularityScore: number;
}

export interface IEquipmentFilterState {
  category: EquipmentCategory;
  state: string;
  search: string;
  sortBy: "popular" | "price-asc" | "price-desc" | "rent-asc" | "subsidy-desc";
  rentOrBuyView: "all" | "rental" | "purchase";
}
