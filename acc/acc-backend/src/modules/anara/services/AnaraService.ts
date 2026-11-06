import { injectable } from 'inversify';
import { InternalServerError, NotFoundError } from 'routing-controllers';
import { appConfig } from '#root/config/app.js';
import type { AnaraDraftResponse, IAnaraService } from '../types.js';

const DRAFT_TIMEOUT_MS = 240_000;

@injectable()
export class AnaraService implements IAnaraService {
  private get baseUrl(): string {
    return (appConfig.anara?.draftUrl || 'https://gdb-draft-239934307367.asia-south1.run.app').replace(/\/+$/, '');
  }

  private get token(): string | undefined {
    return appConfig.anara?.draftToken || undefined;
  }

  /**
   * Drafts an answer from the Package of Practices (POP) library via Anara.
   * Calls POST /draft on the Anara service.
   */
  async draft(question: string, crop?: string | null, domain?: string | null): Promise<AnaraDraftResponse> {
    const trimmedQuestion = (question || '').trim();
    if (!trimmedQuestion) {
      throw new InternalServerError('Question cannot be empty for Anara draft');
    }

    const trimmedCrop = crop ? crop.trim() : null;
    const trimmedDomain = domain ? domain.trim() : undefined;
    const url = `${this.baseUrl}/draft`;

    try {
      console.log(`[AnaraService] Requesting draft from ${url} (crop: ${trimmedCrop || 'none'}, domain: ${trimmedDomain || 'none'})...`);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.token
            ? {
                'x-draft-token': this.token,
                Authorization: `Bearer ${this.token}`,
              }
            : {}),
        },
        body: JSON.stringify({
          question: trimmedQuestion,
          crop: trimmedCrop || null,
          ...(trimmedDomain ? { domain: trimmedDomain } : {}),
        }),
        signal: AbortSignal.timeout(DRAFT_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errorText = (await response.text()).slice(0, 300);
        console.error(`[AnaraService] Draft failed (${response.status}): ${errorText}`);
        throw new InternalServerError(`Anara draft service error (${response.status}): ${errorText || 'No response details'}`);
      }

      const data = (await response.json()) as AnaraDraftResponse;
      console.log(`[AnaraService] Draft successfully generated: ${data.citations?.length || 0} citations returned`);
      return {
        answer: data.answer || '',
        citations: Array.isArray(data.citations) ? data.citations : [],
        note: data.note || '',
      };
    } catch (error: any) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        console.error(`[AnaraService] Draft request timed out after ${DRAFT_TIMEOUT_MS}ms`);
        throw new InternalServerError('Anara draft request timed out. Please try again.');
      }
      console.error('[AnaraService] Draft error:', error);
      throw error instanceof InternalServerError ? error : new InternalServerError(error?.message || 'Failed to communicate with Anara service');
    }
  }

  /**
   * Fetches the PDF of a cited library document from Anara.
   * Calls GET /documents/{documentId}/pdf on the Anara service.
   */
  async getDocumentPdf(documentId: string): Promise<Buffer> {
    if (!documentId) {
      throw new NotFoundError('Document ID is required');
    }

    const url = `${this.baseUrl}/documents/${encodeURIComponent(documentId)}/pdf`;

    try {
      console.log(`[AnaraService] Fetching PDF from ${url}...`);
      const response = await fetch(url, {
        headers: this.token
          ? {
              'x-draft-token': this.token,
              Authorization: `Bearer ${this.token}`,
            }
          : {},
        signal: AbortSignal.timeout(DRAFT_TIMEOUT_MS),
      });

      if (response.status === 404) {
        throw new NotFoundError(`Library document "${documentId}" not found`);
      }

      if (!response.ok) {
        throw new InternalServerError(`Failed to retrieve document PDF (${response.status})`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error: any) {
      if (error instanceof NotFoundError || error instanceof InternalServerError) {
        throw error;
      }
      console.error('[AnaraService] Error retrieving PDF:', error);
      throw new InternalServerError(error?.message || 'Failed to retrieve library document PDF');
    }
  }
}

