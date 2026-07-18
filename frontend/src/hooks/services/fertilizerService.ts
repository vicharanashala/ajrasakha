import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

export interface IFertilizerRecommendation {
  required: number;
  fertilizer: string;
  bags: number;
  cost: number;
}

export interface IFertilizerCalculation {
  crop: string;
  areaInAcres: number;
  soilType: string;
  state: string;
  recommendations: {
    nitrogen: IFertilizerRecommendation;
    phosphorus: IFertilizerRecommendation;
    potassium: IFertilizerRecommendation;
  };
  totalCost: number;
  applicationTips: string[];
}

export interface ICropInfo {
  name: string;
  npk: { n: number; p: number; k: number };
  category: string;
}

export interface ISoilType {
  name: string;
  description: string;
  adjustments: { n: number; p: number; k: number };
}

export class FertilizerService {
  private _baseUrl = `${API_BASE_URL}/fertilizer`;

  async calculate(data: {
    crop: string;
    areaInAcres: number;
    soilType: string;
    state?: string;
  }): Promise<IFertilizerCalculation> {
    return apiFetch<IFertilizerCalculation>(`${this._baseUrl}/calculate`, {
      method: "POST",
      body: JSON.stringify(data),
    }) as Promise<IFertilizerCalculation>;
  }

  async getCrops(): Promise<ICropInfo[]> {
    return apiFetch<ICropInfo[]>(`${this._baseUrl}/crops`) as Promise<ICropInfo[]>;
  }

  async getSoilTypes(): Promise<ISoilType[]> {
    return apiFetch<ISoilType[]>(`${this._baseUrl}/soil-types`) as Promise<ISoilType[]>;
  }
}

export const fertilizerService = new FertilizerService();
