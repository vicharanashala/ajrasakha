import { env } from "@/config/env";
import { apiFetch, getCurrentUser } from "../api/api-fetch";
import { getIdToken } from "firebase/auth";

export interface AnaraCitation {
  passageNumber: number;
  documentName: string | null;
  documentId: string | null;
  pageNumber: number | null;
  sourcePages: number[];
  passageId: string | null;
}

export interface AnaraDraftResponse {
  answer: string;
  citations: AnaraCitation[];
  note: string;
}

const API_BASE_URL = env.apiBaseUrl();

export class AnaraService {
  private readonly baseUrl = `${API_BASE_URL}/anara`;

  /**
   * Drafts an answer grounded in the POP library with passage citations.
   * Timeout set to 180s to accommodate LLM reasoning and retrieval.
   */
  async draft(question: string, crop?: string | null, domain?: string | null): Promise<AnaraDraftResponse> {
    const result = await apiFetch<AnaraDraftResponse>(
      `${this.baseUrl}/draft`,
      {
        method: "POST",
        body: JSON.stringify({ question, crop: crop || null, domain: domain || null }),
      },
      180000
    );

    if (!result) {
      throw new Error("Failed to generate AI draft: No response received");
    }

    return result;
  }

  /**
   * Opens a cited library document PDF at the cited page in a new browser tab.
   */
  async openLibraryPdf(documentId: string, page?: number): Promise<void> {
    const newTab = window.open("", "_blank");
    try {
      const user = await getCurrentUser();
      const token = user ? await getIdToken(user) : null;
      const pdfUrl = `${this.baseUrl}/documents/${encodeURIComponent(documentId)}/pdf`;

      const response = await fetch(pdfUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? "The cited library document is not available."
            : `Could not open the library document (${response.status})`
        );
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const destination = page ? `${objectUrl}#page=${page}` : objectUrl;

      if (newTab) {
        newTab.location.href = destination;
      } else {
        window.location.href = destination;
      }
    } catch (error) {
      newTab?.close();
      throw error;
    }
  }

  getLibraryPdfUrl(documentId: string): string {
    return `${this.baseUrl}/documents/${encodeURIComponent(documentId)}/pdf`;
  }
}

export const anaraService = new AnaraService();

