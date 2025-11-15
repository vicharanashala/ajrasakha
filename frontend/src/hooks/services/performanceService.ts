import type { HeatMapResult,WorkLoad } from "@/types";
import { apiFetch } from "../api/api-fetch";


const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export class PerformaneService {
  private _baseUrl = `${API_BASE_URL}/performance`;

  
  async getheatMapOfReviewers(): Promise<HeatMapResult[] | null> {
    
    return apiFetch<HeatMapResult[]>(`${this._baseUrl}/heatMapofReviewers`);
  }
  async getWorkLoadCount(): Promise<WorkLoad | null> {
    
    return apiFetch<WorkLoad>(`${this._baseUrl}/workload`);
  }

}
