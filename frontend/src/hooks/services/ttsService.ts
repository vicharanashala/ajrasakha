import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

export interface TtsRequestPayload {
  text: string;
  language: string;
  speaker?: string;
  pace?: number;
  pitch?: number;
  loudness?: number;
  model?: string;
  outputAudioCodec?: string;
  speechSampleRate?: number;
}

export interface TtsResponse {
  audioBase64: string;
  contentType: string;
  byteSize: number;
  cached: boolean;
  hash: string;
}

/**
 * Client for the backend TTS proxy. We deliberately go through the backend —
 * not the Sarvam REST API directly — so the API key stays server-side and
 * every audio payload is cached in Mongo for replay reuse.
 */
export class TtsService {
  private _baseUrl = `${API_BASE_URL}/tts`;

  /** Synthesize (or fetch from cache) audio for the given text. */
  async synthesize(payload: TtsRequestPayload): Promise<TtsResponse | null> {
    try {
      return await apiFetch<TtsResponse>(this._baseUrl, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error(`[TTS] synthesize failed for language=${payload.language}:`, error);
      throw error;
    }
  }
}
