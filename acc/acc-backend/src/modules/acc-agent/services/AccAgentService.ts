import { injectable } from 'inversify';
import axios from 'axios';
import { InternalServerError } from 'routing-controllers';
import { aiConfig } from '../../../config/ai.js';

@injectable()
export class AccAgentService {
  private readonly BASE_URL = aiConfig.accAgentBaseUrl;
  private readonly ASSISTANT_ID = aiConfig.accAgentAssistantId;
  private readonly TIMEOUT = aiConfig.accAgentTimeout;

  async createThread(): Promise<{ thread_id: string }> {
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

      return response.data;
    } catch (error) {
      console.error('[AccAgentService] createThread: Error calling LangGraph API', error);
      throw new InternalServerError('Failed to create ACC Agent thread');
    }
  }

  async extractData(
    threadId: string,
    transcript: string
  ): Promise<{
    extracted_query: string;
    extracted_crop: string;
    extracted_state: string;
    extracted_district: string;
    extracted_domain?: string | string[];
  }> {
    try {
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

      return {
        extracted_query: data.extracted_query || '',
        extracted_crop: data.extracted_crop || '',
        extracted_state: data.extracted_state || '',
        extracted_district: data.extracted_district || '',
        extracted_domain: domainVal,
      };
    } catch (error) {
      console.error('[AccAgentService] extractData: Error calling LangGraph API', error);
      throw new InternalServerError('Failed to extract data from transcript using ACC Agent');
    }
  }

  async updateState(
    threadId: string,
    correctedData: {
      query: string;
      crop: string;
      state: string;
      district: string;
      domain: string | string[];
      season: string;
    }
  ): Promise<void> {
    try {
      const domainsArray = Array.isArray(correctedData.domain)
        ? correctedData.domain
        : typeof correctedData.domain === 'string' && correctedData.domain
          ? [correctedData.domain]
          : [];

      const result = await axios.post(
        `${this.BASE_URL}/threads/${threadId}/state`,
        {
          values: {
            extracted_query: correctedData.query,
            extracted_crop: correctedData.crop,
            extracted_state: correctedData.state,
            extracted_district: correctedData.district,
            standardized_domains: domainsArray,
            extracted_season: correctedData.season,
          },
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: this.TIMEOUT,
        }
      );

      console.log("from update state id function, status:", result.status);
    } catch (error) {
      console.error('[AccAgentService] updateState: Error calling LangGraph API', error);
      throw new InternalServerError('Failed to update ACC Agent thread state');
    }
  }

  async checkpointId(threadId: string): Promise<string | undefined> {
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

  async resumeAndGetAnswer(threadId: string): Promise<{ final_answer: string }> {
    const checkpointId = await this.checkpointId(threadId);
    try {
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

      return {
        final_answer: finalAnswer || '',
      };
    } catch (error) {
      console.error('[AccAgentService] resumeAndGetAnswer: Error calling LangGraph API', error);
      throw new InternalServerError('Failed to get final answer from ACC Agent');
    }
  }

  async getThreadState(threadId: string): Promise<any> {
    try {
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
      return data;
    } catch (error) {
      console.error('[AccAgentService] getThreadState: Error calling LangGraph API', error);
      throw new InternalServerError('Failed to fetch ACC Agent thread state');
    }
  }
}
