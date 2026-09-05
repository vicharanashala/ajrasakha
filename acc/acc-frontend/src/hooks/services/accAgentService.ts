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
  extracted_secondary_crops?: string[] | string;
  extracted_language_preference?: string;
  extracted_years_of_experience?: number;
  extracted_highest_education?: string;
  extracted_smartphones_at_home?: number;
}

export interface CorrectedData {
  query: string;
  crop: string;
  state: string;
  district: string;
  block?: string;
  village?: string;
  domain: string | string[];
  season: string;
  farmerName?: string;
  farmerPhone?: string;
  farmerAge?: number;
  farmerGender?: string;
  farmerVillage?: string;
  farmerBlock?: string;
  farmerPrimaryCrop?: string;
  farmerSecondaryCrops?: string[] | string;
  farmerLanguagePreference?: string;
  farmerYearsOfExperience?: number;
  farmerHighestEducation?: string;
  farmerSmartphonesAtHome?: number;
}

export interface QAMetadata {
  extracted_query: string;
  extracted_crop: string;
  extracted_state: string;
  extracted_district: string;
  extracted_block?: string;
  extracted_village?: string;
  extracted_domain?: string | string[];
  standardized_domains?: string | string[];
  extracted_season: string;
}


export interface GeneratedQuestion {
  id: string;
  question: string;
  agri_specialist: string;
  answer: string;
  referenceSource: string;
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
    transcript: string,
    extractionType?: 'farmer_details' | 'query_details'
  ): Promise<ExtractDataResponse> {
    const result = await apiFetch<ExtractDataResponse>(`${this.baseUrl}/acc-agent/extract`, {
      method: 'POST',
      body: JSON.stringify({ threadId, transcript, extractionType }),
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

  async generateQuestionsFromCallContext(
    query: string,
    state?: string,
    crop?: string,
    district?: string,
    domain?: string | string[],
    season?: string
  ): Promise<GeneratedQuestion[] | null> {
    const result = await apiFetch<{ QnA: GeneratedQuestion[] }>(`${this.baseUrl}/generate-from-call`, {
      method: 'POST',
      body: JSON.stringify({ query, state, crop, district, domain, season }),
    });
    return result?.QnA || null;
  }
}
