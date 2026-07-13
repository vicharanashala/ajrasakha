import { env } from "@/config/env";
import { auth } from "@/config/firebase";
import { getIdToken } from "firebase/auth";

const API_BASE_URL = env.apiBaseUrl();

async function apiCall(endpoint: string, body: Record<string, unknown>) {
  const user = auth.currentUser;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (user) {
    const token = await getIdToken(user);
    headers["Authorization"] = `Bearer ${token}`;
  }
  const response = await fetch(`${API_BASE_URL}/soil-health/${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error || "API call failed");
  return data;
}

export interface SoilState {
  _id: string;
  name: string;
}

export interface SoilDistrict {
  _id: string;
  name: string;
}

export interface SoilCrop {
  _id: string;
  name: string;
  id: string;
}

export interface FertilizerRec {
  crop: string;
  primary: { fertilizers: Array<{ name: string; dosage: string; unit: string }> };
  alternative?: { fertilizers: Array<{ name: string; dosage: string; unit: string }> };
  explanations?: string[];
}

export class SoilHealthService {
  async getStates(): Promise<SoilState[]> {
    const data = await apiCall("states", {});
    return data.states || [];
  }

  async getDistricts(stateId: string): Promise<SoilDistrict[]> {
    const data = await apiCall("districts", { stateId });
    return data.districts || [];
  }

  async getCrops(stateId: string): Promise<SoilCrop[]> {
    const data = await apiCall("crops", { stateId });
    return data.crops || [];
  }

  async getRecommendations(params: {
    state: string;
    n: number;
    p: number;
    k: number;
    oc: number;
    district?: string;
    crops?: string[];
  }): Promise<FertilizerRec[]> {
    const data = await apiCall("recommendations", params);
    return data.recommendations || [];
  }
}

export const soilHealthService = new SoilHealthService();
