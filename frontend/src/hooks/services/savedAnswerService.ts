import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

export interface SavedAnswerItem {
  _id: string;
  note?: string;
  createdAt: string;
  answer: { _id: string; answer: string; sources: any[] } | null;
  question: { _id: string; text: string } | null;
}

export class SavedAnswerService {
  private _baseUrl = `${API_BASE_URL}/saved-answers`;

  async save(answerId: string, note?: string) {
    return apiFetch(this._baseUrl, {
      method: "POST",
      body: JSON.stringify({ answerId, note }),
    });
  }
  async list(): Promise<SavedAnswerItem[] | null> {
    return apiFetch<SavedAnswerItem[]>(this._baseUrl);
  }
  async remove(id: string) {
    return apiFetch(`${this._baseUrl}/${id}`, { method: "DELETE" });
  }
}