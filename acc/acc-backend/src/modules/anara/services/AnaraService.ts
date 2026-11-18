import { injectable, inject } from 'inversify';
import { InternalServerError, NotFoundError, BadRequestError, UnauthorizedError } from 'routing-controllers';
import { appConfig } from '#root/config/app.js';
import { PLIVO_TYPES } from '#root/modules/plivo/types.js';
import type {
  ICallDetailsRepository,
  CallQuery,
  FarmerFollowUpStatus,
} from '#root/shared/database/interfaces/ICallDetailsRepository.js';
import type {
  AnaraDraftResponse,
  IAnaraService,
  SubmitForReviewDto,
  SubmitForReviewResponse,
  ReviewWebhookPayload,
} from '../types.js';

const DRAFT_TIMEOUT_MS = 240_000;
const REVIEW_SYSTEM_TIMEOUT_MS = 30_000;

@injectable()
export class AnaraService implements IAnaraService {
  constructor(
    @inject(PLIVO_TYPES.CallDetailsRepository)
    private readonly callDetailsRepository: ICallDetailsRepository,
  ) { }

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
  async draft(
    question: string,
    crop?: string | null,
    domain?: string | null,
    state?: string | null,
  ): Promise<AnaraDraftResponse> {
    const trimmedQuestion = (question || '').trim();
    if (!trimmedQuestion) {
      throw new InternalServerError('Question cannot be empty for Anara draft');
    }

    const trimmedCrop = crop ? crop.trim() : null;
    const trimmedDomain = domain ? domain.trim() : undefined;
    const trimmedState = state ? state.trim() : null;
    const url = `${this.baseUrl}/draft`;

    try {
      console.log(`[AnaraService] Requesting draft from ${url} (crop: ${trimmedCrop || 'none'}, state: ${trimmedState || 'none'}, domain: ${trimmedDomain || 'none'})...`);
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
          state: trimmedState || null,
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

  /**
   * Submits an AI-drafted question with POP citations to the Review System for Moderator verification.
   * Persists locally first as 'pending_review' with a 2-hour SLA.
   * If the Review System is unreachable, marks 'submission_failed' for retry.
   */
  async submitForReview(dto: SubmitForReviewDto, agentUserId?: string): Promise<SubmitForReviewResponse> {
    const trimmedQuestion = (dto.question || '').trim();
    if (!trimmedQuestion) {
      throw new BadRequestError('Question cannot be empty');
    }
    if (!dto.callUuid) {
      throw new BadRequestError('callUuid is required');
    }

    const now = new Date();
    // 2-hour SLA from submission
    const reviewSlaExpiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const queryData: Partial<CallQuery> = {
      type: 'AI-drafted',
      callUuid: dto.callUuid,
      question: trimmedQuestion,
      answer: dto.answer || '',
      citations: dto.citations || [],
      metadata: {
        extracted_query: trimmedQuestion,
        extracted_crop: dto.crop || '',
        extracted_state: dto.state || '',
        extracted_district: dto.district || '',
        extracted_block: dto.block || '',
        extracted_village: dto.village || '',
        extracted_season: dto.season || '',
        extracted_domain: dto.domain || '',
        standardized_domains: Array.isArray(dto.domain) ? dto.domain : dto.domain ? [dto.domain] : [],
        submittedByAgentId: agentUserId || '',
      },
      agri_specialist: 'AI Draft',
      referenceSource: 'anara_pop_library',
      reviewStatus: 'pending_review',
      reviewSlaExpiresAt,
      farmerFollowUpStatus: 'pending',
    };

    const queryId = await this.callDetailsRepository.addQueryToCall(dto.callUuid, queryData);
    console.log(`[AnaraService] Created AI-drafted CallQuery ${queryId} for callUuid ${dto.callUuid}`);

    // Call Review System endpoint
    return await this.dispatchToReviewSystem(queryId, dto);
  }

  private async dispatchToReviewSystem(
    queryId: string,
    dto: SubmitForReviewDto,
  ): Promise<SubmitForReviewResponse> {
    let reviewUrl = (appConfig.reviewSystem?.apiUrl || 'https://reviewer-backend-staging-239934307367.asia-south2.run.app/api/questions/acc').trim().replace(/\/+$/, '');
    if (reviewUrl.endsWith('/api')) {
      reviewUrl = `${reviewUrl}/questions/acc`;
    }
    const apiKey = appConfig.reviewSystem?.apiKey || '';
    const now = new Date();
    const reviewSlaExpiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const mappedSources = (dto.citations || []).map((c) => {
      const docName = c.documentName || `Passage ${c.passageNumber}`;
      const docUrl = c.documentId ? `${this.baseUrl}/documents/${encodeURIComponent(c.documentId)}/pdf` : '';
      return {
        source: docUrl || docName, // Required by Review System class-validator (must be a non-empty string)
        sourceName: docName,
        name: docName,
        documentName: c.documentName || null,
        documentId: c.documentId || null,
        url: docUrl,
        pageNumber: c.pageNumber || null,
        page: c.pageNumber || (c.sourcePages && c.sourcePages.length > 0 ? c.sourcePages.join(',') : null),
        sourcePages: c.sourcePages || [],
        passageNumber: c.passageNumber,
      };
    });

    const payload = {
      question: dto.question.trim(),
      source: 'ACC',
      aiInitialAnswer: dto.answer || '',
      details: {
        crop: dto.crop || null,
        state: dto.state || null,
        district: dto.district || null,
        block: dto.block || null,
        village: dto.village || null,
        season: dto.season || null,
        domain: dto.domain || null,
      },
      sources: mappedSources,
    };

    try {
      console.log(`[AnaraService] Dispatching question ${queryId} to Review System: ${reviewUrl}...`);
      console.log('[AnaraService] Dispatched Payload to Review System:', JSON.stringify(payload, null, 2));
      console.log('[AnaraService] Auth Key Provided:', apiKey ? `Yes (ending in ...${apiKey.slice(-4)})` : 'None');

      const response = await fetch(reviewUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey
            ? {
              'x-internal-api-key': apiKey,
              'x-api-key': apiKey,
            }
            : {}),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REVIEW_SYSTEM_TIMEOUT_MS),
      });

      const responseText = await response.text();
      console.log(`[AnaraService] Review System Response HTTP Status: ${response.status}`);
      // console.log(`[AnaraService] Review System Raw Response Body:`, responseText);

      if (!response.ok) {
        console.error(`[AnaraService] Review System returned error (${response.status}): ${responseText}`);
        await this.callDetailsRepository.updateQueryById(queryId, {
          reviewStatus: 'submission_failed',
        });
        return {
          success: false,
          queryId,
          reviewStatus: 'submission_failed',
          reviewSlaExpiresAt,
          message: `Review System returned error ${response.status}: ${responseText || 'Unknown error'}. You can retry submission.`,
        };
      }

      let resData: any = {};
      try {
        resData = JSON.parse(responseText);
      } catch {
        resData = { message: responseText };
      }
      const reviewQuestionId =
        resData?.questionId ||
        resData?.question_id ||
        resData?.data?.questionId ||
        resData?.data?.question_id ||
        resData?.data?._id?.toString?.() ||
        resData?._id?.toString?.() ||
        resData?.data?.id;

      await this.callDetailsRepository.updateQueryById(queryId, {
        reviewQuestionId: reviewQuestionId ? String(reviewQuestionId) : undefined,
        reviewStatus: 'pending_review',
        reviewSlaExpiresAt,
      });

      console.log(`[AnaraService] Question ${queryId} successfully registered in Review System (Review ID: ${reviewQuestionId || 'unknown'})`);
      return {
        success: true,
        queryId,
        reviewQuestionId: reviewQuestionId ? String(reviewQuestionId) : undefined,
        reviewStatus: 'pending_review',
        reviewSlaExpiresAt,
        message: 'Draft submitted to Review System. 2-Hour SLA clock active.',
      };
    } catch (error: any) {
      console.error(`[AnaraService] Failed to dispatch to Review System for query ${queryId}:`, error?.message || error);
      await this.callDetailsRepository.updateQueryById(queryId, {
        reviewStatus: 'submission_failed',
      });
      return {
        success: false,
        queryId,
        reviewStatus: 'submission_failed',
        reviewSlaExpiresAt,
        message: `Failed to connect to Review System: ${error?.message || 'Network error'}. You can retry submission.`,
      };
    }
  }

  /**
   * Retries submission to the Review System for a query whose initial submission failed.
   */
  async retryReviewSubmission(queryId: string): Promise<SubmitForReviewResponse> {
    const existing = await this.callDetailsRepository.getQueriesByIds([queryId]);
    const query = existing?.[0];
    if (!query) {
      throw new NotFoundError(`Query ${queryId} not found`);
    }

    const dto: SubmitForReviewDto = {
      callUuid: query.callUuid,
      question: query.question,
      answer: query.answer,
      citations: query.citations as any,
      crop: query.metadata?.extracted_crop,
      state: query.metadata?.extracted_state,
      district: query.metadata?.extracted_district,
      block: query.metadata?.extracted_block,
      village: query.metadata?.extracted_village,
      season: query.metadata?.extracted_season,
      domain: query.metadata?.extracted_domain,
    };

    return await this.dispatchToReviewSystem(queryId, dto);
  }

  /**
   * Handles incoming webhook notification when Moderator approves/closes the question in Review System.
   */
  async handleReviewWebhook(
    payload: ReviewWebhookPayload,
    webhookSecretHeader?: string,
  ): Promise<{ success: boolean; message: string }> {
    console.log(`[AnaraService] Incoming review webhook for question_id "${payload?.question_id}": status ${payload?.status}`);

    const configuredSecret = appConfig.reviewSystem?.webhookSecret;
    if (configuredSecret) {
      if (!webhookSecretHeader || webhookSecretHeader !== configuredSecret) {
        console.warn(`[AnaraService] Webhook authorization mismatch: received "${webhookSecretHeader || 'none'}"`);
        throw new UnauthorizedError('Unauthorized: missing or invalid webhook key');
      }
    }

    const questionId = payload.question_id || (payload as any).questionId || (payload as any)._id;
    if (!questionId) {
      throw new BadRequestError('Missing question_id in webhook payload');
    }

    const isClosedOrApproved = payload.status === 'closed' || payload.status === 'approved';
    const finalReviewStatus = isClosedOrApproved ? 'approved' : payload.status === 'rejected' ? 'rejected' : 'pending_review';

    const updateFields: Partial<CallQuery> = {
      reviewStatus: finalReviewStatus,
      reviewedAnswer: payload.answer || undefined,
      reviewedSources: payload.sources || undefined,
      reviewedBy: payload.author || undefined,
      reviewedAt: new Date(),
      farmerFollowUpStatus: 'pending',
    };

    // Update query question text if reviewer modified or refined it
    if (payload.question && payload.question.trim()) {
      updateFields.question = payload.question.trim();
    }

    const updated = await this.callDetailsRepository.updateQueryByReviewQuestionId(questionId, updateFields);

    if (!updated) {
      console.warn(`[AnaraService] Webhook received for question_id "${questionId}", but no matching query found in call_queries`);
      return { success: false, message: `No matching query found for reviewQuestionId "${questionId}"` };
    }

    console.log(`[AnaraService] Updated CallQuery ${updated._id} with approved review answer from ${payload.author || 'Moderator'}`);
    return { success: true, message: `Successfully updated query with review status ${finalReviewStatus}` };
  }

  /**
   * Retrieves follow-ups (approved questions awaiting farmer call, or in-review queries).
   */
  async getFollowUps(
    status?: string,
    followUpStatus?: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<{ queries: CallQuery[]; total: number }> {
    return await this.callDetailsRepository.getFollowUps({
      reviewStatus: status as any,
      farmerFollowUpStatus: followUpStatus as any,
      limit,
      offset,
    });
  }

  /**
   * Updates follow-up status (e.g. called, resolved).
   */
  async updateFollowUpStatus(
    queryId: string,
    status: FarmerFollowUpStatus,
    notes?: string,
  ): Promise<CallQuery | null> {
    return await this.callDetailsRepository.updateQueryById(queryId, {
      farmerFollowUpStatus: status,
      farmerFollowUpAt: new Date(),
      ...(notes ? { farmerFollowUpNotes: notes } : {}),
    });
  }
}

