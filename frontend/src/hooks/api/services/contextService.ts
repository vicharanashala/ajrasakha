import { apiFetch } from "../api-fetch";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

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
