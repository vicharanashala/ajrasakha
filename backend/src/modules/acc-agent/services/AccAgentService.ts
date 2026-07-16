import { injectable } from 'inversify';
import axios from 'axios';
import { InternalServerError } from 'routing-controllers';
import { aiConfig } from '#root/config/ai.js';

@injectable()
export class AccAgentService {
  private readonly BASE_URL = aiConfig.accAgentBaseUrl;
  private readonly ASSISTANT_ID = aiConfig.accAgentAssistantId;
  private readonly TIMEOUT = aiConfig.accAgentTimeout;
  private readonly checkpointCache = new Map<string, string>();

  /**
   * Step 1: Create a new thread/session
   */
  async createThread(): Promise<{ thread_id: string }> {
    const startTime = Date.now();
    try {
      console.log(`🔄 [AccAgentService] Creating new thread...`);
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

      console.log(`✅ [AccAgentService] Thread created: ${response.data.thread_id} (${Date.now() - startTime}ms)`);
      return response.data;
    } catch (error) {
      console.error(`❌ [AccAgentService] createThread failed after ${Date.now() - startTime}ms:`, error);
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
      console.log(`🔄 [AccAgentService] Extracting data from transcript for thread ${threadId} (transcript length: ${transcript.length})`);
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

      // Check standardized_domains array from server, fall back to extracted_domain
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


  async checkpointId(threadId: string): Promise<string | undefined> {
    if (this.checkpointCache.has(threadId)) {
      const cached = this.checkpointCache.get(threadId);
      this.checkpointCache.delete(threadId);
      console.log(`💾 [AccAgentService] Using cached checkpoint ${cached} for thread ${threadId}`);
      return cached;
    }

    try {
      // Try GET request first (standard LangGraph API for getting state)
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
      // Fallback POST request with an empty body to retrieve the state
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
   * Step 5: Get thread state (returns full state, with parsed final_answer if available)
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
            // Keep as string if it is not stringified JSON
          }
        }
        // Also ensure final_answer is populated at the root level of the response
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
