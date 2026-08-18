import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";
import { auth } from "@/config/firebase";
import { getIdToken } from "firebase/auth";

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
  aliases?: string[];
}

export interface ILocationDistrict {
  districtCode: number;
  districtNameEnglish: string;
  stateCode: number;
  stateName?: string;
  aliases?: string[];
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

export interface IKvk {
  kvkId: string;
  kvkName: string;
  kvkAddress?: string;
  districtCode?: number;
  stateCode?: number;
  latitude?: number;
  longitude?: number;
}

export interface ILocationAudit {
  _id?: string;
  action: "add" | "delete";
  entity: "state" | "district";
  code: number;
  name: string;
  stateCode?: number;
  reason: string;
  performedByUserId?: string;
  performedByEmail?: string;
  performedByName?: string;
  createdAt: string;
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

  /** Admin/moderator: replace a state's aliases and optionally rename it. */
  async updateStateAliases(
    stateCode: number,
    aliases: string[],
    name?: string,
  ): Promise<ILocationState | null> {
    return apiFetch<ILocationState>(
      `${this._baseUrl}/states/${stateCode}/aliases`,
      {
        method: "PUT",
        body: JSON.stringify(name !== undefined ? { aliases, name } : { aliases }),
      },
    );
  }

  /** Admin/moderator: replace a district's aliases and optionally rename it. */
  async updateDistrictAliases(
    districtCode: number,
    aliases: string[],
    name?: string,
  ): Promise<ILocationDistrict | null> {
    return apiFetch<ILocationDistrict>(
      `${this._baseUrl}/districts/${districtCode}/aliases`,
      {
        method: "PUT",
        body: JSON.stringify(name !== undefined ? { aliases, name } : { aliases }),
      },
    );
  }

  /** Admin/moderator: add a new state. Reason is recorded in the audit trail. */
  async addState(name: string, reason: string): Promise<ILocationState | null> {
    return apiFetch<ILocationState>(`${this._baseUrl}/states`, {
      method: "POST",
      body: JSON.stringify({ name, reason }),
    });
  }

  /** Admin/moderator: delete a state (districts left intact). Reason is audited. */
  async deleteState(
    stateCode: number,
    reason: string,
  ): Promise<{ success: true } | null> {
    return apiFetch<{ success: true }>(`${this._baseUrl}/states/${stateCode}`, {
      method: "DELETE",
      body: JSON.stringify({ reason }),
    });
  }

  /** Admin/moderator: add a new district under a state. Reason is audited. */
  async addDistrict(
    stateCode: number,
    name: string,
    reason: string,
    aliases?: string[],
  ): Promise<ILocationDistrict | null> {
    return apiFetch<ILocationDistrict>(`${this._baseUrl}/districts`, {
      method: "POST",
      body: JSON.stringify({ stateCode, name, reason, aliases }),
    });
  }

  /** Admin/moderator: add the single common "All" district. Reason is audited. */
  async addAllDistrict(reason: string): Promise<ILocationDistrict | null> {
    return apiFetch<ILocationDistrict>(`${this._baseUrl}/districts/all`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  }

  /** Admin/moderator: delete a district. Reason is audited. */
  async deleteDistrict(
    districtCode: number,
    reason: string,
  ): Promise<{ success: true } | null> {
    return apiFetch<{ success: true }>(
      `${this._baseUrl}/districts/${districtCode}`,
      {
        method: "DELETE",
        body: JSON.stringify({ reason }),
      },
    );
  }

  /** Admin/moderator: fetch the state/district add-delete audit trail. */
  async getLocationAudits(limit = 200): Promise<ILocationAudit[] | null> {
    return apiFetch<ILocationAudit[]>(
      `${this._baseUrl}/audits?limit=${limit}`,
    );
  }

  async downloadStateOrDistrictReport(
    type: "state" | "district",
  ): Promise<Blob> {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) {
      throw new Error("User not authenticated");
    }

    const token = await getIdToken(firebaseUser);
    const params = new URLSearchParams({ type });
    const response = await fetch(`${this._baseUrl}/download?${params.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download ${type} report`);
    }

    return await response.blob();
  }

  async getDistricts(stateCode: number): Promise<ILocationDistrict[] | null> {
    try {
      return await apiFetch<ILocationDistrict[]>(`${this._baseUrl}/districts?stateCode=${stateCode}`);
    } catch {
      return fallbackDistricts(stateCode);
    }
  }

  /** All districts across every state (each carrying its stateName). */
  async getAllDistricts(): Promise<ILocationDistrict[] | null> {
    return apiFetch<ILocationDistrict[]>(`${this._baseUrl}/districts/all`);
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

  async getKvks(districtCode: number): Promise<IKvk[] | null> {
    try {
      return await apiFetch<IKvk[]>(`${this._baseUrl}/kvks?districtCode=${districtCode}`);
    } catch {
      return fallbackKvks(districtCode);
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

async function fallbackKvks(districtCode: number): Promise<IKvk[]> {
  const { KVK } = await import("@/features/chatbotDashboard/utils/KVKS");
  const districtName = districtNameByCode.get(districtCode);
  
  if (!districtName || !KVK[districtName]) {
    return [];
  }

  return KVK[districtName].map((kvkName, index) => ({
    kvkId: `${districtCode}-${index}`,
    kvkName,
    districtCode,
  }));
}
