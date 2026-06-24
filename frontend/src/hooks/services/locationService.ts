import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();
type LocationMetadata = typeof import("@/features/chatbotDashboard/utils/metaData");

let metadataPromise: Promise<LocationMetadata> | null = null;
const stateNameByCode = new Map<number, string>();
const districtNameByCode = new Map<number, string>();
const blockDistrictByCode = new Map<number, string>();

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
    const stateCode = index + 1;
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
