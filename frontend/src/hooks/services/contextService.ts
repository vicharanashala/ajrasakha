import { env } from "@/config/env";
import { apiFetch } from "../api/api-fetch";
import type { SupportedLanguage } from "@/types";

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

  async useSendAudioChunk(
    file: File | Blob,
    lang: SupportedLanguage 
  ): Promise<any> {
    try {
      const formData = new FormData();

      // const downloadFile = (blob: Blob, filename: string) => {
      //   const url = URL.createObjectURL(blob);
      //   const a = document.createElement("a");
      //   a.href = url;
      //   a.download = filename;
      //   document.body.appendChild(a);
      //   a.click();
      //   a.remove();
      //   URL.revokeObjectURL(url);
      // };

      // const filename = `recording-${Date.now()}.webm`;

      // const blobFile =
      //   file instanceof File
      //     ? file
      //     : new File([file], filename, { type: file.type });
      // downloadFile(blobFile, filename);

      if (file instanceof File) {
        formData.append("file", file);
      } else {
        formData.append("file", file, "recording.webm");
      }
      formData.append("language", lang);
      const result = await apiFetch<unknown>(`${this._baseUrl}/speech-to-text`, {
        method: "POST",
        body: formData,
      });
      console.log("Response body: ", result);
      return result;
    } catch (error) {
      console.error("Error while sending audio chunk", error);
      throw error;
    }
  }
}
