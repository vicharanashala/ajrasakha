import { env } from "@/config/env";
import { apiFetch } from "../api/api-fetch";

const API_BASE_URL = env.apiBaseUrl();

export class ContextService {
  private _baseUrl = `${API_BASE_URL}/context`;

  async submitTranscript(transcript: string): Promise<void> {
    try {
      await apiFetch<void>(this._baseUrl, {
        method: "POST",
        body: JSON.stringify({ transcript }),
      });
    } catch (error) {
      console.error(`Error in Transcript:`, error);
      throw error;
    }
  }
}
