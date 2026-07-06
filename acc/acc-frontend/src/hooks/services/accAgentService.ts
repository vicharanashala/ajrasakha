import { env } from "@/config/env";
import { apiFetch } from "../api/api-fetch";

export interface ExtractDataResponse {
  extracted_query: string;
  extracted_crop: string;
  extracted_state: string;
  extracted_district: string;
  extracted_domain?: string | string[];
}

export interface CorrectedData {
  query: string;
  crop: string;
  state: string;
  district: string;
  domain: string | string[];
  season: string;
}

export interface QAMetadata {
  extracted_query: string;
  extracted_crop: string;
  extracted_state: string;
  extracted_district: string;
  extracted_domain?: string | string[];
  standardized_domains?: string | string[];
  extracted_season: string;
}

const API_BASE_URL = env.apiBaseUrl();

export class AccAgentService {
  private readonly baseUrl = `${API_BASE_URL}/questions`;

  async createThread(): Promise<{ thread_id: string }> {
    const result = await apiFetch<{ thread_id: string }>(`${this.baseUrl}/acc-agent/thread`, {
      method: 'POST',
    });
    if (!result) {
      throw new Error('Failed to create thread: no response from server');
    }
    return result;
  }

  async extractData(
    threadId: string,
    transcript: string
  ): Promise<ExtractDataResponse> {
    const result = await apiFetch<ExtractDataResponse>(`${this.baseUrl}/acc-agent/extract`, {
      method: 'POST',
      body: JSON.stringify({ threadId, transcript }),
    });
    if (!result) {
      throw new Error('Failed to extract data: no response from server');
    }
    return result;
  }

  async updateState(
    threadId: string,
    correctedData: CorrectedData
  ): Promise<void> {
    await apiFetch<{ success: boolean }>(`${this.baseUrl}/acc-agent/update-state`, {
      method: 'POST',
      body: JSON.stringify({ threadId, correctedData }),
    });
  }

  async resumeAndGetAnswer(threadId: string, callUuid?: string, metadata?: QAMetadata): Promise<any> {
    const result = await apiFetch<any>(`${this.baseUrl}/acc-agent/resume`, {
      method: 'POST',
      body: JSON.stringify({ threadId, callUuid, metadata }),
    });
    if (!result) {
      throw new Error('Failed to resume and get answer: no response from server');
    }
    return result;
  }
}
