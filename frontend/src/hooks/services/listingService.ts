import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

export interface IListingResponse {
  _id?: string;
  farmerId: string;
  crop: string;
  quantity: number;
  unit: "kg" | "quintal" | "ton";
  pricePerUnit: number;
  location: { state: string; district: string; village?: string };
  description?: string;
  images?: string[];
  status: "active" | "sold" | "inactive";
  createdAt?: string;
  updatedAt?: string;
}

export interface ICreateListingPayload {
  crop: string;
  quantity: number;
  unit: "kg" | "quintal" | "ton";
  pricePerUnit: number;
  location: { state: string; district: string; village?: string };
  description?: string;
  images?: string[];
}

export interface IGetAllListingsResponse {
  listings: IListingResponse[];
  totalCount: number;
  totalPages: number;
}

export interface ISingleListingResponse {
  success: boolean;
  message?: string;
  data: IListingResponse;
}

export class ListingService {
  private _baseUrl = `${API_BASE_URL}/marketplace/listings`;

  async getAllListings(query?: {
    crop?: string;
    state?: string;
    district?: string;
    minPrice?: number;
    maxPrice?: number;
    page?: number;
    limit?: number;
  }): Promise<IGetAllListingsResponse | null> {
    const params = new URLSearchParams();
    if (query?.crop) params.append("crop", query.crop);
    if (query?.state) params.append("state", query.state);
    if (query?.district) params.append("district", query.district);
    if (query?.minPrice) params.append("minPrice", query.minPrice.toString());
    if (query?.maxPrice) params.append("maxPrice", query.maxPrice.toString());
    if (query?.page) params.append("page", query.page.toString());
    if (query?.limit) params.append("limit", query.limit.toString());

    return apiFetch<IGetAllListingsResponse>(`${this._baseUrl}?${params.toString()}`);
  }

  async getMyListings(): Promise<{ success: boolean; data: IListingResponse[] } | null> {
    return apiFetch<{ success: boolean; data: IListingResponse[] }>(`${this._baseUrl}/mine`);
  }

  async createListing(payload: ICreateListingPayload): Promise<ISingleListingResponse | null> {
    return apiFetch<ISingleListingResponse>(this._baseUrl, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async updateListing(
    listingId: string,
    payload: Partial<ICreateListingPayload>
  ): Promise<ISingleListingResponse | null> {
    return apiFetch<ISingleListingResponse>(`${this._baseUrl}/${listingId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }

  async deleteListing(listingId: string): Promise<{ success: boolean; message: string } | null> {
    return apiFetch<{ success: boolean; message: string }>(`${this._baseUrl}/${listingId}`, {
      method: "DELETE",
    });
  }
}
