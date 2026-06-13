import { injectable } from 'inversify';
import axios from 'axios';
import { InternalServerError } from 'routing-controllers';
import { aiConfig } from '#root/config/ai.js';

@injectable()
export class AccAgentService {
  private readonly BASE_URL = aiConfig.accAgentBaseUrl;
  private readonly ASSISTANT_ID = aiConfig.accAgentAssistantId;
  private readonly TIMEOUT = aiConfig.accAgentTimeout;

  /**
   * Step 1: Create a new thread/session
   */
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

      return {
        extracted_query: data.extracted_query || '',
        extracted_crop: data.extracted_crop || '',
        extracted_state: data.extracted_state || '',
        extracted_district: data.extracted_district || '',
      };
    } catch (error) {
      console.error('[AccAgentService] extractData: Error calling LangGraph API', error);
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
    }
  ): Promise<void> {

    try {
     const result=  await axios.post(
        `${this.BASE_URL}/threads/${threadId}/state`,
        {
          values: {
            extracted_query: correctedData.query,
            extracted_crop: correctedData.crop,
            extracted_state: correctedData.state,
            extracted_district: correctedData.district,
          },
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: this.TIMEOUT,
        }
      );

      console.log("from update state id function",result)
    } catch (error) {
      console.error('[AccAgentService] updateState: Error calling LangGraph API', error);
      throw new InternalServerError('Failed to update ACC Agent thread state');
    }
  }


  async checkpointId(threadId: string){
    try {
     const result=  await axios.post(
        `${this.BASE_URL}/threads/${threadId}/state`,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: this.TIMEOUT,
        }
      );

      console.log("from checkpoint id function",result)
    } catch (error) {
      console.error('[AccAgentService] checkpointId: Error calling LangGraph API', error);
      throw new InternalServerError('Failed to get checkpoint ID from ACC Agent');
    }
  }

  /**
   * Step 4: Resume execution and get final answer
   */
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

      return {
        final_answer: data.final_answer || '',
      };
    } catch (error) {
      console.error('[AccAgentService] resumeAndGetAnswer: Error calling LangGraph API', error);
      throw new InternalServerError('Failed to get final answer from ACC Agent');
    }
  }
}
