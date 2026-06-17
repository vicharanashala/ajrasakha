import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

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
    return apiFetch<ILocationState[]>(`${this._baseUrl}/states`);
  }

  async getDistricts(stateCode: number): Promise<ILocationDistrict[] | null> {
    return apiFetch<ILocationDistrict[]>(`${this._baseUrl}/districts?stateCode=${stateCode}`);
  }

  async getBlocks(districtCode: number): Promise<ILocationBlock[] | null> {
    return apiFetch<ILocationBlock[]>(`${this._baseUrl}/blocks?districtCode=${districtCode}`);
  }

  async getVillages(blockCode: number): Promise<ILocationVillage[] | null> {
    return apiFetch<ILocationVillage[]>(`${this._baseUrl}/villages?blockCode=${blockCode}`);
  }
}
