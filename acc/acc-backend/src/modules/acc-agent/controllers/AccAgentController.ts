import 'reflect-metadata';
import {
  JsonController,
  Post,
  Body,
  HttpCode,
  Authorized,
} from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
import { inject, injectable } from 'inversify';
import { ObjectId } from 'mongodb';
import axios from 'axios';
import { AccAgentService } from '../services/AccAgentService.js';
import { PLIVO_TYPES } from '../../plivo/types.js';
import { GLOBAL_TYPES } from '#root/types.js';
import type { ICallDetailsRepository, CallQuery } from '#shared/database/interfaces/ICallDetailsRepository.js';

@OpenAPI({
  tags: ['acc-agent'],
  description: 'ACC Agent HITL flow endpoints',
})
@injectable()
@JsonController('/questions')
export class AccAgentController {
  constructor(
    @inject(GLOBAL_TYPES.AccAgentService)
    private readonly accAgentService: AccAgentService,
    @inject(PLIVO_TYPES.CallDetailsRepository)
    private readonly callDetailsRepository: ICallDetailsRepository,
  ) { }

  @Post('/acc-agent/thread')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Create ACC Agent thread for HITL flow' })
  async createAccAgentThread(): Promise<{ thread_id: string }> {
    try {
      const result = await this.accAgentService.createThread();
      return result;
    } catch (error) {
      console.error('[AccAgentController] createAccAgentThread: Error', error);
      throw error;
    }
  }

  @Post('/acc-agent/extract')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Extract data from transcript using ACC Agent' })
  async extractAccAgentData(
    @Body() body: { threadId: string; transcript: string }
  ): Promise<{
    extracted_query: string;
    extracted_crop: string;
    extracted_state: string;
    extracted_district: string;
    extracted_domain?: string | string[];
  }> {
    try {
      const result = await this.accAgentService.extractData(body.threadId, body.transcript);
      return result;
    } catch (error) {
      console.error('[AccAgentController] extractAccAgentData: Error', error);
      throw error;
    }
  }

  @Post('/acc-agent/update-state')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Update ACC Agent state with human corrections' })
  async updateAccAgentState(
    @Body() body: {
      threadId: string;
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
      };
    }
  ): Promise<{ success: boolean }> {
    try {
      await this.accAgentService.updateState(body.threadId, body.correctedData);
      return { success: true };
    } catch (error) {
      console.error('[AccAgentController] updateAccAgentState: Error', error);
      throw error;
    }
  }

  @Post('/acc-agent/resume')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Resume ACC Agent and get final answer' })
  async resumeAccAgentAndGetAnswer(
    @Body() body: { threadId: string; callUuid?: string; metadata?: CallQuery['metadata'] }
  ): Promise<any> {
    try {
      // 1. Resume the agent
      await this.accAgentService.resumeAndGetAnswer(body.threadId);

      // 2. Fetch the full thread state (with parsed final_answer, weather, and similar pairs)
      const threadState = await this.accAgentService.getThreadState(body.threadId);

      // 3. If callUuid and metadata are provided, store Q/A pairs in call_details
      if (body.callUuid && body.metadata) {
        const finalAnswerObj = threadState?.values?.final_answer;
        const finalAnswerMarkdown = typeof finalAnswerObj === 'string' ? finalAnswerObj : finalAnswerObj?.final_answer || '';

        const weather = finalAnswerObj?.weather || null;
        const similarPair = finalAnswerObj?.gdb?.similar_pair1 || null;
        const authorName = similarPair?.details?.[0]?.author_name || "";
        const sourceName = similarPair?.details?.[0]?.source_name || "";
        const sourceLink = similarPair?.details?.[0]?.source_link || "";

        // Ensure call_details document exists
        let existingCallDetails = await this.callDetailsRepository.getByCallUuid(body.callUuid);
        if (!existingCallDetails) {
          console.warn(`[AccAgentController] Call details document not found for callUuid: ${body.callUuid}. Creating new document.`);
          await this.callDetailsRepository.create({
            callUuid: body.callUuid,
            status: 'completed',
            direction: 'inbound',
            caller: { transcript: '', translation: '', detectedLanguage: 'unknown' },
            agent: { transcript: '', translation: '', detectedLanguage: 'unknown' }
          });
        }

        // Add individual query with its own metadata to call_queries collection
        await this.callDetailsRepository.addQueryToCall(body.callUuid, {
          metadata: {
            extracted_query: body.metadata.extracted_query || '',
            extracted_crop: body.metadata.extracted_crop || '',
            extracted_state: body.metadata.extracted_state || '',
            extracted_district: body.metadata.extracted_district || '',
            extracted_domain: body.metadata.extracted_domain || '',
            extracted_season: body.metadata.extracted_season || '',
            standardized_domains: body.metadata.standardized_domains || []
          },
          question: body.metadata.extracted_query,
          answer: finalAnswerMarkdown,
          agri_specialist: 'ACC_AGENT',
          referenceSource: 'acc_agent_hitl',
          authorName,
          sourceName,
          sourceLink,
          weather
        });
      }

      // 4. Return the full thread state
      return threadState;
    } catch (error) {
      console.error('[AccAgentController] resumeAccAgentAndGetAnswer: Error', error);
      throw error;
    }
  }

  @Post('/acc-agent/call-summary')
  @HttpCode(200)
  @OpenAPI({ summary: 'Generate call summary from raw transcript' })
  async getCallSummary(
    @Body() body: { query: string }
  ): Promise<any> {
    try {
      const extractResponse = await axios.post(
        'http://100.100.108.44:6002/extract',
        { query: body.query },
        { timeout: 100000 },
      );
      return extractResponse.data;
    } catch (error) {
      console.error('[AccAgentController] getCallSummary: Failed to generate call summary:', error);
      throw error;
    }
  }
}
