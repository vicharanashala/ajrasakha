import { injectable } from 'inversify';
import axios from 'axios';
import { ObjectId } from 'mongodb';
import { InternalServerError } from 'routing-controllers';
import { aiConfig } from '../../../config/ai.js';

@injectable()
export class AccAgentService {
  private readonly BASE_URL = aiConfig.accAgentBaseUrl;
  private readonly ASSISTANT_ID = aiConfig.accAgentAssistantId;
  private readonly TIMEOUT = aiConfig.accAgentTimeout;
  private readonly checkpointCache = new Map<string, string>();

  /**
   * Generate questions from call context via python search microservice
   */
  async generateQuestionsFromCallContext(
    query: string,
    state?: string,
    crop?: string,
    district?: string,
    domain?: string | string[],
    season?: string
  ): Promise<any[]> {
    try {
      const payload: any = { query: (query || '').trim() };

      if (state && state.toLowerCase() !== 'all' && state !== 'Select State') {
        payload.state = state.trim();
      }
      if (crop && crop.toLowerCase() !== 'all' && crop !== 'Select Crop') {
        payload.crop = crop.trim();
      }
      if (district && district.toLowerCase() !== 'all' && district !== 'Select District') {
        payload.district = district.trim();
      }
      if (domain) {
        payload.domain = domain;
      }
      if (season && season.toLowerCase() !== 'all') {
        payload.season = season.trim();
      }

      let agentSearchResponse;
      try {
        agentSearchResponse = await axios.post(
          'http://100.100.108.44:6002/search',
          payload,
          { timeout: 30000 }
        );
      } catch (firstErr: any) {
        console.warn(
          `[AccAgentService] Primary search with filters failed (${firstErr.message}). Retrying query-only...`
        );
        agentSearchResponse = await axios.post(
          'http://100.100.108.44:6002/search',
          { query: (query || '').trim() },
          { timeout: 30000 }
        );
      }

      const data = agentSearchResponse.data || {};
      let formattedResponse: any[] = [];

      if (
        data &&
        (Array.isArray(data.reviewer) ||
          Array.isArray(data.golden) ||
          Array.isArray(data.pop))
      ) {
        formattedResponse = [
          ...(data.reviewer || []).map((item: any) => ({
            question: item.question,
            answer: item.answer || item.text,
            agri_specialist:
              item.agri_expert ||
              item.agri_specialist ||
              item.source ||
              'AGRI_EXPERT',
            referenceSource: 'reviewer',
            id: item.id || new ObjectId().toString(),
          })),
          ...(data.golden || []).map((item: any) => ({
            question: item.question,
            answer: item.answer || item.text,
            agri_specialist:
              item.agri_expert ||
              item.agri_specialist ||
              item.metadata?.['Agri Specialist'] ||
              'Unknown',
            referenceSource: 'golden',
            id: item.id || new ObjectId().toString(),
          })),
          ...(data.pop || []).map((item: any) => ({
            question: 'Reference Information',
            answer: item.text,
            agri_specialist: 'POP_DOCUMENT',
            referenceSource: 'pop',
            id: item.id || new ObjectId().toString(),
          })),
        ];
      } else if (data && Array.isArray(data.results)) {
        formattedResponse = data.results.map((item: any) => ({
          question: item.question || data.extracted_question || query,
          answer: item.answer || item.text || 'Answer not available',
          agri_specialist: item.source || 'AGRI_EXPERT',
          referenceSource: 'agent_search',
          id: item.id || new ObjectId().toString(),
        }));
      } else if (Array.isArray(data)) {
        formattedResponse = data.map((item: any) => ({
          question: item.question || query,
          answer: item.answer || item.response || JSON.stringify(item),
          agri_specialist: item.agri_specialist || item.source || 'AGRI_EXPERT',
          referenceSource: item.referenceSource || 'agent_search',
          id: item.id || new ObjectId().toString(),
        }));
      } else if (data && typeof data === 'object') {
        formattedResponse = [
          {
            question: data.extracted_question || data.question || query,
            answer: data.answer || data.response || JSON.stringify(data),
            agri_specialist:
              data.agri_specialist || data.source || 'AGRI_EXPERT',
            referenceSource: data.referenceSource || 'agent_search',
            id: data.id || new ObjectId().toString(),
          },
        ];
      }

      // Deduplicate by question text
      const uniqueQuestions = Array.from(
        new Map(formattedResponse.map((q) => [q.question, q])).values()
      ).map((q) => ({
        ...q,
        id: q.id || new ObjectId().toString(),
      }));

      return uniqueQuestions;
    } catch (error: any) {
      console.error('[AccAgentService] generateQuestionsFromCallContext: Error', error);
      throw new InternalServerError('Failed to generate questions from call context');
    }
  }

  /**
   * Step 1: Create a new thread/session
   */
  async createThread(): Promise<{ thread_id: string }> {
    const startTime = Date.now();
    try {
      const response = await axios.post(
        `${this.BASE_URL}/threads`,
        {},
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: this.TIMEOUT,
        }
      );

      if (!response.data || !response.data.thread_id) {
        throw new InternalServerError('Invalid response from ACC Agent API: missing thread_id');
      }

      console.log(`[AccAgentService] Thread created: ${response.data.thread_id} (${Date.now() - startTime}ms)`);
      return response.data;
    } catch (error) {
      console.error(`[AccAgentService] createThread failed after ${Date.now() - startTime}ms:`, error);
      throw new InternalServerError('Failed to create ACC Agent thread');
    }
  }

  /**
   * Step 2: Extract data from transcript (auto-pauses after extraction)
   */
  async extractData(
    threadId: string,
    transcript: string
  ): Promise<{
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
  }> {
    const startTime = Date.now();
    try {
      console.log(`[AccAgentService] Extracting data from transcript for thread ${threadId} (transcript length: ${transcript.length})`);
      const response = await axios.post(
        `${this.BASE_URL}/threads/${threadId}/runs/wait`,
        {
          assistant_id: this.ASSISTANT_ID,
          input: {
            transcript: transcript,
          },
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: this.TIMEOUT,
        }
      );

      const data = response.data;

      if (!data.extracted_query) {
        throw new InternalServerError('Invalid response from ACC Agent API: missing extracted_query');
      }

      const domainVal = data.standardized_domains || data.extracted_domain || '';

      const result = {
        extracted_query: data.extracted_query || '',
        extracted_crop: data.extracted_crop || '',
        extracted_state: data.extracted_state || '',
        extracted_district: data.extracted_district || '',
        extracted_domain: domainVal,
        extracted_name: data.extracted_name || '',
        extracted_phone: data.extracted_phone || '',
        extracted_age: data.extracted_age !== undefined && data.extracted_age !== null ? Number(data.extracted_age) : undefined,
        extracted_gender: data.extracted_gender || '',
        extracted_village: data.extracted_village || '',
        extracted_block: data.extracted_block || '',
        extracted_primary_crop: data.extracted_primary_crop || '',
      };

      console.log(`✅ [AccAgentService] Data extracted for thread ${threadId} (${Date.now() - startTime}ms): query="${result.extracted_query}", crop="${result.extracted_crop}", domain="${JSON.stringify(result.extracted_domain)}"`);
      return result;
    } catch (error) {
      console.error(`❌ [AccAgentService] extractData failed for thread ${threadId} after ${Date.now() - startTime}ms:`, error);
      throw new InternalServerError('Failed to extract data from transcript using ACC Agent');
    }
  }

  /**
   * Step 3: Update state if human edits the extracted data
   */
  async updateState(
    threadId: string,
    correctedData: {
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
  ): Promise<void> {
    const startTime = Date.now();
    try {
      console.log(`🔄 [AccAgentService] Updating state for thread ${threadId}: query="${correctedData.query}", crop="${correctedData.crop}", domain="${JSON.stringify(correctedData.domain)}"`);
      const domainsArray = Array.isArray(correctedData.domain)
        ? correctedData.domain
        : typeof correctedData.domain === 'string' && correctedData.domain
          ? [correctedData.domain]
          : [];

      const response = await axios.post(
        `${this.BASE_URL}/threads/${threadId}/state`,
        {
          as_node: 'extract',
          values: {
            extracted_query: correctedData.query,
            extracted_crop: correctedData.crop,
            extracted_state: correctedData.state,
            extracted_district: correctedData.district,
            standardized_domains: domainsArray,
            extracted_season: correctedData.season,
            extracted_name: correctedData.farmerName,
            extracted_phone: correctedData.farmerPhone,
            extracted_age: correctedData.farmerAge,
            extracted_gender: correctedData.farmerGender,
            extracted_village: correctedData.farmerVillage,
            extracted_block: correctedData.farmerBlock,
            extracted_primary_crop: correctedData.farmerPrimaryCrop,
          },
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: this.TIMEOUT,
        }
      );

      const checkpointId = response.data?.checkpoint?.checkpoint_id || response.data?.checkpoint_id;
      if (checkpointId) {
        this.checkpointCache.set(threadId, checkpointId);
        console.log(`💾 [AccAgentService] Cached checkpoint ${checkpointId} for thread ${threadId}`);
      }

      console.log(`✅ [AccAgentService] State updated for thread ${threadId} (${Date.now() - startTime}ms)`);
    } catch (error) {
      console.error(`❌ [AccAgentService] updateState failed for thread ${threadId} after ${Date.now() - startTime}ms:`, error);
      throw new InternalServerError('Failed to update ACC Agent thread state');
    }
  }

  /**
   * Retrieves the current checkpoint ID for a thread
   */
  async checkpointId(threadId: string): Promise<string | undefined> {
    if (this.checkpointCache.has(threadId)) {
      const cached = this.checkpointCache.get(threadId);
      this.checkpointCache.delete(threadId);
      console.log(`💾 [AccAgentService] Using cached checkpoint ${cached} for thread ${threadId}`);
      return cached;
    }

    try {
      const response = await axios.get(
        `${this.BASE_URL}/threads/${threadId}/state`,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: this.TIMEOUT,
        }
      );
      const checkpointId = response.data?.checkpoint?.checkpoint_id || response.data?.checkpoint_id;
      if (checkpointId) return checkpointId;
    } catch (e: any) {
      console.warn(`[AccAgentService] GET /state failed, trying POST fallback: ${e.message}`);
    }

    try {
      const response = await axios.post(
        `${this.BASE_URL}/threads/${threadId}/state`,
        {},
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: this.TIMEOUT,
        }
      );
      return response.data?.checkpoint?.checkpoint_id || response.data?.checkpoint_id;
    } catch (error) {
      console.error('[AccAgentService] checkpointId: Error calling LangGraph API', error);
      return undefined;
    }
  }

  /**
   * Step 4: Resume execution and get final answer
   */
  async resumeAndGetAnswer(threadId: string): Promise<{ final_answer: string }> {
    const startTime = Date.now();
    const checkpointId = await this.checkpointId(threadId);
    try {
      console.log(`🔄 [AccAgentService] Resuming thread ${threadId} (checkpoint: ${checkpointId})`);
      const response = await axios.post(
        `${this.BASE_URL}/threads/${threadId}/runs/wait`,
        {
          assistant_id: this.ASSISTANT_ID,
          checkpoint: {
            checkpoint_id: checkpointId
          }
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: this.TIMEOUT,
        }
      );

      const data = response.data;
      if (!data.final_answer) {
        throw new InternalServerError('Invalid response from ACC Agent API: missing final_answer');
      }

      let finalAnswer = data.final_answer;
      try {
        const parsed = JSON.parse(finalAnswer);
        if (parsed && typeof parsed === 'object' && parsed.final_answer) {
          finalAnswer = parsed.final_answer;
        }
      } catch (e) {
        // Keep original
      }

      console.log(`✅ [AccAgentService] Got final answer for thread ${threadId} (${Date.now() - startTime}ms, answer length: ${finalAnswer?.length || 0})`);
      return {
        final_answer: finalAnswer || '',
      };
    } catch (error) {
      console.error(`❌ [AccAgentService] resumeAndGetAnswer failed for thread ${threadId} after ${Date.now() - startTime}ms:`, error);
      throw new InternalServerError('Failed to get final answer from ACC Agent');
    }
  }

  /**
   * Step 5: Get thread state
   */
  async getThreadState(threadId: string): Promise<any> {
    const startTime = Date.now();
    try {
      console.log(`🔄 [AccAgentService] Getting thread state for ${threadId}`);
      const response = await axios.get(
        `${this.BASE_URL}/threads/${threadId}/state`,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: this.TIMEOUT,
        }
      );

      const data = response.data;
      if (data && data.values) {
        const values = data.values;
        if (typeof values.final_answer === 'string') {
          try {
            values.final_answer = JSON.parse(values.final_answer);
          } catch (e) {
            // Keep as string
          }
        }
        if (values.final_answer) {
          data.final_answer = typeof values.final_answer === 'string'
            ? values.final_answer
            : values.final_answer.final_answer || '';
        }
      }
      console.log(`✅ [AccAgentService] Got thread state for ${threadId} (${Date.now() - startTime}ms)`);
      return data;
    } catch (error) {
      console.error(`❌ [AccAgentService] getThreadState failed for thread ${threadId} after ${Date.now() - startTime}ms:`, error);
      throw new InternalServerError('Failed to fetch ACC Agent thread state');
    }
  }
}
