import type { IDetailedQuestion, IRequest } from "@/types";
import { apiFetch } from "../api-fetch";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export class RequestService {
  private _baseUrl = `${API_BASE_URL}/requests`;

  async createRequest(
    entityId: string,
    requestType: "question_flag" | "others",
    updatedData: IDetailedQuestion | null,
    reason: string
  ): Promise<IRequest | null> {
    const body = {
      entityId,
      reason,
      details: {
        requestType,
        details: updatedData,
      },
    };

    return apiFetch<IRequest>(`${this._baseUrl}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async getAllRequests(params: {
    limit: number;
    page: number;
    status: "all" | "pending" | "rejected" | "approved" | "in-review";
    requestType: "all" | "question_flag" | "others";
    sortOrder: "newest" | "oldest";
  }): Promise<{
    requests: IRequest[];
    totalPages: number;
    totalCount: number;
  } | null> {
    const query = new URLSearchParams({
      limit: params.limit.toString(),
      page: params.page.toString(),
      status: params.status,
      requestType: params.requestType,
      sortOrder: params.sortOrder,
    });

    return apiFetch<{
      requests: IRequest[];
      totalPages: number;
      totalCount: number;
    }>(`${this._baseUrl}?${query.toString()}`);
  }

  async getRequestDiff(reqId: string): Promise<{
    currentDoc: any;
    existingDoc: any;
  } | null> {
    return apiFetch<{
      currentDoc: any;
      existingDoc: any;
    }>(`${this._baseUrl}/${reqId}`);
  }

  async updateStatus(
    requestId: string,
    status: IRequest["status"],
    response: string
  ): Promise<IRequest | null> {
    return apiFetch<IRequest>(`${this._baseUrl}/${requestId}/status`, {
      method: "PUT",
      body: JSON.stringify({ status, response }),
    });
  }
}
