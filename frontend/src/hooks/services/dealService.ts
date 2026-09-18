import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

export type DealStatus = "pending" | "accepted" | "rejected" | "completed" | "cancelled";

export interface IDealResponse {
  _id?: string;
  listingId: string;
  farmerId: string;
  buyerId: string;
  offeredPrice: number;
  quantity: number;
  status: DealStatus;
  crop?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ICreateDealPayload {
  listingId: string;
  offeredPrice: number;
  quantity: number;
}

export interface ISingleDealResponse {
  success: boolean;
  message?: string;
  data: IDealResponse;
}

export class DealService {
  private _baseUrl = `${API_BASE_URL}/marketplace/deals`;

  async getMyDeals(): Promise<{ success: boolean; data: IDealResponse[] } | null> {
    return apiFetch<{ success: boolean; data: IDealResponse[] }>(this._baseUrl);
  }

  async createDeal(payload: ICreateDealPayload): Promise<ISingleDealResponse | null> {
    return apiFetch<ISingleDealResponse>(this._baseUrl, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async updateDealStatus(
    dealId: string,
    status: DealStatus
  ): Promise<ISingleDealResponse | null> {
    return apiFetch<ISingleDealResponse>(`${this._baseUrl}/${dealId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  }
}
