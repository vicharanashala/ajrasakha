import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

export interface IMessageResponse {
  _id?: string;
  dealId: string;
  senderId: string;
  text: string;
  createdAt?: string;
}

export class MessageService {
  private _baseUrl(dealId: string) {
    return `${API_BASE_URL}/marketplace/deals/${dealId}/messages`;
  }

  async getMessages(
    dealId: string
  ): Promise<{ success: boolean; data: IMessageResponse[] } | null> {
    return apiFetch<{ success: boolean; data: IMessageResponse[] }>(this._baseUrl(dealId));
  }

  async sendMessage(
    dealId: string,
    text: string
  ): Promise<{ success: boolean; data: IMessageResponse } | null> {
    return apiFetch<{ success: boolean; data: IMessageResponse }>(this._baseUrl(dealId), {
      method: "POST",
      body: JSON.stringify({ text }),
    });
  }
}
