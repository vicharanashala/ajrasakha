import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();
type LocationMetadata = typeof import("@/features/chatbotDashboard/utils/metaData");

let metadataPromise: Promise<LocationMetadata> | null = null;
const stateNameByCode = new Map<number, string>();
const districtNameByCode = new Map<number, string>();
const blockDistrictByCode = new Map<number, string>();

const LGD_STATE_CODES: Record<string, number> = {
  "Andaman and Nicobar Islands": 35,
  "Andhra Pradesh": 28,
  "Arunachal Pradesh": 12,
  Assam: 18,
  Bihar: 10,
  Chandigarh: 4,
  Chhattisgarh: 22,
  "Dadra and Nagar Haveli and Daman and Diu": 26,
  "Delhi (National Capital Territory)": 7,
  Goa: 30,
  Gujarat: 24,
  Haryana: 6,
  "Himachal Pradesh": 2,
  "Jammu and Kashmir": 1,
  Jharkhand: 20,
  Karnataka: 29,
  Kerala: 32,
  Ladakh: 37,
  Lakshadweep: 31,
  "Madhya Pradesh": 23,
  Maharashtra: 27,
  Manipur: 14,
  Meghalaya: 17,
  Mizoram: 15,
  Nagaland: 13,
  Odisha: 21,
  Puducherry: 34,
  Punjab: 3,
  Rajasthan: 8,
  Sikkim: 11,
  "Tamil Nadu": 33,
  Telangana: 36,
  Tripura: 16,
  "Uttar Pradesh": 9,
  Uttarakhand: 5,
  "West Bengal": 19,
};

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
  pincode: string;
}

export class LocationService {
  private _baseUrl = `${API_BASE_URL}/location`;

  async getStates(): Promise<ILocationState[] | null> {
    try {
      return await apiFetch<ILocationState[]>(`${this._baseUrl}/states`);
    } catch {
      return fallbackStates();
    }
  }

  async getDistricts(stateCode: number): Promise<ILocationDistrict[] | null> {
    try {
      return await apiFetch<ILocationDistrict[]>(`${this._baseUrl}/districts?stateCode=${stateCode}`);
    } catch {
      return fallbackDistricts(stateCode);
    }
  }

  async getBlocks(districtCode: number): Promise<ILocationBlock[] | null> {
    try {
      return await apiFetch<ILocationBlock[]>(`${this._baseUrl}/blocks?districtCode=${districtCode}`);
    } catch {
      return fallbackBlocks(districtCode);
    }
  }

  async getVillages(blockCode: number): Promise<ILocationVillage[] | null> {
    try {
      return await apiFetch<ILocationVillage[]>(`${this._baseUrl}/villages?blockCode=${blockCode}`);
    } catch {
      return fallbackVillages(blockCode);
    }
  }
}

function getMetadata() {
  metadataPromise ??= import("@/features/chatbotDashboard/utils/metaData");
  return metadataPromise;
}

async function fallbackStates(): Promise<ILocationState[]> {
  const { STATES } = await getMetadata();

  return STATES.map((stateNameEnglish, index) => {
    const stateCode = LGD_STATE_CODES[stateNameEnglish] ?? index + 1;
    stateNameByCode.set(stateCode, stateNameEnglish);

    return {
      stateCode,
      stateNameEnglish,
    };
  });
}

async function fallbackDistricts(stateCode: number): Promise<ILocationDistrict[]> {
  const { STATES, DISTRICTS } = await getMetadata();
  const stateName = stateNameByCode.get(stateCode) ?? STATES[stateCode - 1];

  return (DISTRICTS[stateName] || []).map((districtNameEnglish, index) => {
    const districtCode = stateCode * 1000 + index + 1;
    districtNameByCode.set(districtCode, districtNameEnglish);

    return {
      districtCode,
      districtNameEnglish,
      stateCode,
    };
  });
}

async function fallbackBlocks(districtCode: number): Promise<ILocationBlock[]> {
  const { BLOCKS } = await getMetadata();
  const districtName = districtNameByCode.get(districtCode);

  return (districtName ? BLOCKS[districtName] || [] : []).map(
    (blockNameEnglish, index) => {
      const blockCode = districtCode * 1000 + index + 1;
      blockDistrictByCode.set(blockCode, districtName);

      return {
        blockCode,
        blockNameEnglish,
        districtCode,
      };
    },
  );
}

async function fallbackVillages(blockCode: number): Promise<ILocationVillage[]> {
  const { VILLAGES } = await getMetadata();
  const districtName = blockDistrictByCode.get(blockCode);
  const villages = districtName
    ? (VILLAGES as Record<string, string[]>)[districtName] || []
    : [];

  return villages.map((villageNameEnglish, index) => ({
    villageCode: blockCode * 100000 + index + 1,
    villageNameEnglish,
    blockCode,
    pincode: "",
  }));
}
