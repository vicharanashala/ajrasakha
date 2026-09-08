import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

export interface NewSourceItem {
  source: string;
  sourceType?: string;
  sourceName?: string;
  page?: string | number;
  organization?: string;
  sourceReference?: string;
}

export interface CreateNewSourcePayload {
  answerId: string;
  questionId: string;
  sources: NewSourceItem[];
}

export interface NewSourceRecord extends CreateNewSourcePayload {
  _id?: string;
  sourceStatus: null;
  timeTaken: null;
  organizationStatus: null;
}

export class NewSourceService {
  private _baseUrl = `${API_BASE_URL}/new-sources`;

  async create(payload: CreateNewSourcePayload): Promise<NewSourceRecord | null> {
    return apiFetch<NewSourceRecord>(this._baseUrl, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }
}
