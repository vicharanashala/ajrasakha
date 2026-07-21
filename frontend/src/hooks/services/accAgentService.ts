import { env } from "@/config/env";
import { apiFetch } from "../api/api-fetch";

export interface ExtractDataResponse {
  extracted_query: string;
  extracted_crop: string;
  extracted_state: string;
  extracted_district: string;
  extracted_domain?: string | string[];
  extracted_name?: string;
  extracted_phone?: string;
  extracted_age?: number;
  extracted_gender?: string;
  extracted_village?: string;
  extracted_block?: string;
  extracted_primary_crop?: string;
}

export interface CorrectedData {
  query: string;
  crop: string;
  state: string;
  district: string;
  domain: string | string[];
  season: string;
  farmerName?: string;
  farmerPhone?: string;
  farmerAge?: number;
  farmerGender?: string;
  farmerVillage?: string;
  farmerBlock?: string;
  farmerPrimaryCrop?: string;
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

  /**
   * Step 1: Create a new thread/session
   */
  async createThread(): Promise<{ thread_id: string }> {
    const result = await apiFetch<{ thread_id: string }>(`${this.baseUrl}/acc-agent/thread`, {
      method: 'POST',
    });
    if (!result) {
      throw new Error('Failed to create thread: no response from server');
    }
    return result;
  }

  /**
   * Step 2: Extract data from transcript (auto-pauses after extraction)
   */
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

  /**
   * Step 3: Update state if human edits the extracted data
   */
  async updateState(
    threadId: string,
    correctedData: CorrectedData
  ): Promise<void> {
    await apiFetch<{ success: boolean }>(`${this.baseUrl}/acc-agent/update-state`, {
      method: 'POST',
      body: JSON.stringify({ threadId, correctedData }),
    });
  }

  /**
   * Step 4: Resume execution and get final answer
   */
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
