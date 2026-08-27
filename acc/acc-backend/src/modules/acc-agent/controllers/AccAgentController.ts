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
import { PlivoService } from '../../plivo/services/PlivoService.js';
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
    @inject(PLIVO_TYPES.PlivoService)
    private readonly plivoService: PlivoService,
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
    @Body() body: { threadId: string; transcript: string; extractionType?: 'farmer_details' | 'query_details' }
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
    try {
      const result = await this.accAgentService.extractData(body.threadId, body.transcript, body.extractionType);
      console.log(`📋 [EXTRACTION_DATA] (AccAgentController) Extracted Data [${body.extractionType || 'all'}] for thread ${body.threadId}:`, JSON.stringify(result, null, 2));
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
        block?: string;
        village?: string;
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

      // 3. If callUuid is provided, store Q/A pairs in call_details & call_queries
      if (body.callUuid) {
        const finalAnswerObj = threadState?.values?.final_answer;
        const finalAnswerMarkdown = typeof finalAnswerObj === 'string' ? finalAnswerObj : finalAnswerObj?.final_answer || '';

        const weather = finalAnswerObj?.weather || null;
        const similarPair = finalAnswerObj?.gdb?.similar_pair1 || finalAnswerObj?.gdb?.exact_match || null;
        const authorName = similarPair?.details?.[0]?.author_name || "";
        const sourceName = similarPair?.details?.[0]?.source_name || "";
        const sourceLink = similarPair?.details?.[0]?.source_link || "";

        const threadValues = threadState?.values || {};
        const meta = body.metadata || {};

        const extractedQuery = meta.extracted_query || threadValues.extracted_query || '';
        const extractedCrop = meta.extracted_crop || threadValues.extracted_crop || '';
        const extractedState = meta.extracted_state || threadValues.extracted_state || '';
        const extractedDistrict = meta.extracted_district || threadValues.extracted_district || '';
        const extractedBlock = meta.extracted_block || threadValues.extracted_block || '';
        const extractedVillage = meta.extracted_village || threadValues.extracted_village || '';
        const rawDomain = meta.standardized_domains || meta.extracted_domain || threadValues.standardized_domains || threadValues.extracted_domain || '';
        const standardizedDomains = Array.isArray(rawDomain) ? rawDomain : (rawDomain ? [rawDomain] : []);
        const extractedSeason = meta.extracted_season || threadValues.extracted_season || '';

        // Ensure call_details document exists
        let existingCallDetails = await this.callDetailsRepository.getByCallUuid(body.callUuid);
        if (!existingCallDetails) {
          const inMemoryMeta = this.plivoService.getCallMetadata(body.callUuid);
          const agentUserIdStr = this.plivoService.getCallAgent(body.callUuid) || inMemoryMeta?.agentUserId;
          let agentUserIdObj: ObjectId | undefined = undefined;
          if (agentUserIdStr) {
            const idStr = String(agentUserIdStr);
            if (ObjectId.isValid(idStr) && idStr.length === 24) {
              try {
                agentUserIdObj = new ObjectId(idStr);
              } catch {
                agentUserIdObj = undefined;
              }
            }
          }
          console.warn(`[AccAgentController] Call details document not found for callUuid: ${body.callUuid}. Creating new document with agent.userid: ${agentUserIdStr}`);
          await this.callDetailsRepository.create({
            callUuid: body.callUuid,
            from: inMemoryMeta?.from,
            to: inMemoryMeta?.to,
            status: 'completed',
            direction: 'inbound',
            caller: { transcript: this.plivoService.getTranscript(body.callUuid, 'inbound'), translation: this.plivoService.getTranslation(body.callUuid, 'inbound'), detectedLanguage: this.plivoService.getDetectedLanguage(body.callUuid, 'inbound') },
            agent: { transcript: this.plivoService.getTranscript(body.callUuid, 'outbound'), translation: this.plivoService.getTranslation(body.callUuid, 'outbound'), detectedLanguage: this.plivoService.getDetectedLanguage(body.callUuid, 'outbound'), userid: agentUserIdObj }
          });
        }

        // Add individual query with its own metadata to call_queries collection
        await this.callDetailsRepository.addQueryToCall(body.callUuid, {
          metadata: {
            extracted_query: extractedQuery,
            extracted_crop: extractedCrop,
            extracted_state: extractedState,
            extracted_district: extractedDistrict,
            extracted_block: extractedBlock,
            extracted_village: extractedVillage,
            extracted_domain: standardizedDomains,
            extracted_season: extractedSeason,
            standardized_domains: standardizedDomains,
          },
          question: extractedQuery,
          answer: finalAnswerMarkdown,
          agri_specialist: 'ACC_AGENT',
          referenceSource: 'acc_agent_hitl',
          authorName,
          sourceName,
          sourceLink,
          weather
        });
        console.log(`✅ [AccAgentController] Saved question and metadata to call_queries for callUuid: ${body.callUuid}`);
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
