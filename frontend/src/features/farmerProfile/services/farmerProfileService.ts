import type { IFarmerProfile, FarmerCategory } from "../types";

export const FARMER_PROFILE_STORAGE_KEY = "ajrasakha_farmer_profile_v1";
export const USER_ROLE_STORAGE_KEY = "ajrasakha_user_role_v1";

export type UserRole = "owner" | "farmer";

export const calculateFarmerCategory = (acres: number): FarmerCategory => {
  if (acres <= 2.5) return "marginal";
  if (acres <= 5.0) return "small";
  if (acres <= 10.0) return "medium";
  return "large";
};

export const getCategoryBadgeLabel = (category: FarmerCategory, lang: "hi" | "en" | "hinglish"): string => {
  switch (category) {
    case "marginal":
      return lang === "en" ? "Marginal Farmer (0-2.5 Acres)" : "सीमांत किसान (0-2.5 एकड़)";
    case "small":
      return lang === "en" ? "Small Farmer (2.5-5 Acres)" : "लघु किसान (2.5-5 एकड़)";
    case "medium":
      return lang === "en" ? "Medium Farmer (5-10 Acres)" : "मध्यम किसान (5-10 एकड़)";
    case "large":
      return lang === "en" ? "Large Farmer (10+ Acres)" : "वृहद / बड़े किसान (10+ एकड़)";
  }
};

export const generateKisanCardId = (state: string, phone: string): string => {
  const stateCode = (state || "IN").substring(0, 2).toUpperCase();
  const phoneSuffix = (phone || "1234").slice(-4);
  const randomSalt = Math.floor(1000 + Math.random() * 9000);
  return `KID-2026-${stateCode}${phoneSuffix}-${randomSalt}`;
};

export const getOwnerMasterProfile = (): IFarmerProfile => {
  return {
    id: "OWNER-TOMARJII-2026",
    farmerName: "tomarjii (Project Owner & Master Admin)",
    phoneNo: "9999999999",
    gender: "male",
    age: 21,
    state: "National Admin (समस्त भारत)",
    district: "HQ Hub",
    blockOrTehsil: "AI Research & Tech HQ",
    villageName: "Ajrasakha Sovereign Base",
    pincode: "110001",
    landSizeAcres: 50.0,
    farmerCategory: "large",
    soilType: "alluvial",
    irrigationSource: "drip",
    primaryCrop: "Smart Agriculture Ecosystem & AI",
    secondaryCrops: ["Drone Spraying", "High Yield Wheat", "Solar Pump Hub"],
    farmingType: "natural",
    livestock: ["Dairy", "Poultry"],
    machineryOwned: ["Tractor 40-50 HP (ट्रैक्टर)", "Solar Pump (सोलर पंप)", "Power / Drone Sprayer (स्प्रेयर)"],
    preferredLanguage: "hi",
    registeredAt: new Date().toISOString(),
    isVerified: true,
  };
};

export const getDemoFarmerProfile = (): IFarmerProfile => {
  return {
    id: "KID-2026-HR4321-7890",
    farmerName: "चौधरी रामपाल सिंह (Rampal Singh)",
    phoneNo: "9876543210",
    gender: "male",
    age: 44,
    state: "Haryana",
    district: "Karnal",
    blockOrTehsil: "Gharaunda (घरौंडा)",
    villageName: "Kutail (कुटेल)",
    pincode: "132114",
    landSizeAcres: 6.5,
    farmerCategory: "medium",
    soilType: "alluvial",
    irrigationSource: "borewell",
    primaryCrop: "Wheat (गेहूं)",
    secondaryCrops: ["Paddy / Rice (धान / चावल)", "Mustard / Rapeseed (सरसों / राई)"],
    farmingType: "mixed",
    livestock: ["Dairy Cow (देसी / साहीवाल गाय)", "Buffalo (मुर्रा / देसी भैंस)"],
    machineryOwned: ["Tractor 40-50 HP (ट्रैक्टर)", "Rotavator (रोटावेटर)", "Solar Pump (सोलर पंप)"],
    preferredLanguage: "hi",
    registeredAt: new Date().toISOString(),
    isVerified: true,
  };
};

export const farmerProfileService = {
  // Get active role (defaults to "owner" so tomarjii is NEVER blocked!)
  getRole: (): UserRole => {
    try {
      const saved = localStorage.getItem(USER_ROLE_STORAGE_KEY);
      if (saved === "farmer" || saved === "owner") return saved;
    } catch {}
    // Default is owner (tomarjii)
    return "owner";
  },

  setRole: (role: UserRole): void => {
    try {
      localStorage.setItem(USER_ROLE_STORAGE_KEY, role);
    } catch {}
  },

  isOwner: (): boolean => {
    return farmerProfileService.getRole() === "owner";
  },

  getProfile: (): IFarmerProfile | null => {
    try {
      const raw = localStorage.getItem(FARMER_PROFILE_STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw) as IFarmerProfile;
      }
    } catch (e) {
      console.error("Error reading farmer profile from localStorage", e);
    }
    // If owner role, fallback to owner profile automatically
    if (farmerProfileService.isOwner()) {
      return getOwnerMasterProfile();
    }
    return null;
  },

  saveProfile: (profile: IFarmerProfile): void => {
    try {
      localStorage.setItem(FARMER_PROFILE_STORAGE_KEY, JSON.stringify(profile));
    } catch (e) {
      console.error("Error saving farmer profile to localStorage", e);
    }
  },

  clearProfile: (): void => {
    try {
      localStorage.removeItem(FARMER_PROFILE_STORAGE_KEY);
    } catch (e) {
      console.error("Error clearing farmer profile", e);
    }
  },
};
