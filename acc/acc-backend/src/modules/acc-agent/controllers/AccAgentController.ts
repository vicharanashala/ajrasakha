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
import type { ICallFarmerRepository, FarmerProfile } from '#shared/database/interfaces/IFarmerRepository.js';

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
    @inject(PLIVO_TYPES.CallFarmerRepository)
    private readonly callFarmerRepository: ICallFarmerRepository,
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
    extracted_queries?: Array<{
      query: string;
      crop: string | null;
      standardized_domains: string[];
    }>;
    extracted_query: string;
    extracted_crop: string;
    extracted_state: string;
    extracted_district: string;
    extracted_domain?: string | string[];
    standardized_domains?: string[];
    extracted_name?: string;
    extracted_phone?: string;
    extracted_age?: number;
    extracted_gender?: string;
    extracted_village?: string;
    extracted_block?: string;
    extracted_primary_crop?: string;
    extracted_secondary_crops?: string[] | string;
    extracted_language_preference?: string;
    extracted_years_of_experience?: number;
    extracted_highest_education?: string;
    extracted_smartphones_at_home?: number;
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
        farmerSecondaryCrops?: string[] | string;
        farmerLanguagePreference?: string;
        farmerYearsOfExperience?: number;
        farmerHighestEducation?: string;
        farmerSmartphonesAtHome?: number;
        queries?: Array<{
          query: string;
          crop?: string | null;
          standardized_domains?: string[];
        }>;
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
    @Body() body: {
      threadId: string;
      callUuid?: string;
      metadata?: CallQuery['metadata'] & {
        farmerPhone?: string;
        farmerName?: string;
      };
    }
  ): Promise<any> {
    try {
      // 1. Resume the agent
      await this.accAgentService.resumeAndGetAnswer(body.threadId);

      // 2. Fetch the full thread state (with parsed final_answer, weather, and similar pairs)
      const threadState = await this.accAgentService.getThreadState(body.threadId);

      // 3. If callUuid is provided, store Q/A pairs in call_details & call_queries
      if (body.callUuid) {
        const finalAnswerObj = threadState?.values?.final_answer;
        let finalAnswerMarkdown = '';
        if (typeof finalAnswerObj === 'string') {
          finalAnswerMarkdown = finalAnswerObj;
        } else if (finalAnswerObj?.final_answer) {
          finalAnswerMarkdown = finalAnswerObj.final_answer;
        } else {
          const answersList = Array.isArray(finalAnswerObj?.answers)
            ? finalAnswerObj.answers
            : (Array.isArray(finalAnswerObj?.final_answers) ? finalAnswerObj.final_answers : []);
          if (answersList.length > 0) {
            // Priority 1: Match by target query from metadata
            const queryToMatch = (body.metadata?.extracted_query || '').trim().toLowerCase();
            const matched = queryToMatch
              ? answersList.find((a: any) =>
                  a?.query && (
                    a.query.trim().toLowerCase() === queryToMatch ||
                    a.query.trim().toLowerCase().includes(queryToMatch) ||
                    queryToMatch.includes(a.query.trim().toLowerCase())
                  )
                )
              : null;

            if (matched?.answer) {
              finalAnswerMarkdown = matched.answer;
            } else {
              // Fallback to the last element from answers array
              finalAnswerMarkdown = answersList[answersList.length - 1]?.answer || '';
            }
          } else {
            finalAnswerMarkdown = threadState?.final_answer || '';
          }
        }

        let weather = finalAnswerObj?.weather || null;
        if (!weather && finalAnswerObj?.weather_response) {
          try {
            weather = typeof finalAnswerObj.weather_response === 'string'
              ? JSON.parse(finalAnswerObj.weather_response)
              : finalAnswerObj.weather_response;
          } catch (e) {}
        }

        let gdbData = finalAnswerObj?.gdb || null;
        if (!gdbData && finalAnswerObj?.gdb_response) {
          try {
            gdbData = typeof finalAnswerObj.gdb_response === 'string'
              ? JSON.parse(finalAnswerObj.gdb_response)
              : finalAnswerObj.gdb_response;
          } catch (e) {}
        }
        const similarPair = gdbData?.similar_pair1 || gdbData?.exact_match || null;
        const authorName = similarPair?.details?.[0]?.author_name || "";
        const sourceName = similarPair?.details?.[0]?.source_name || "";
        const sourceLink = similarPair?.details?.[0]?.source_link || "";

        const threadValues = threadState?.values || {};
        const meta = body.metadata || {};

        const isTestCall = !body.callUuid || body.callUuid.startsWith('testing_');
        const farmerPhone = (!isTestCall && (meta as any).farmerPhone) ? String((meta as any).farmerPhone).trim() : '';
        const farmerName = (!isTestCall && (meta as any).farmerName) ? String((meta as any).farmerName).trim() : '';

        const extractedQuery = meta.extracted_query || threadValues.extracted_query || '';
        const extractedCrop = meta.extracted_crop || threadValues.extracted_crop || '';
        const extractedState = meta.extracted_state || threadValues.extracted_state || '';
        const extractedDistrict = meta.extracted_district || threadValues.extracted_district || '';
        const extractedBlock = meta.extracted_block || threadValues.extracted_block || '';
        const extractedVillage = meta.extracted_village || threadValues.extracted_village || '';
        const rawDomain = meta.standardized_domains || meta.extracted_domain || threadValues.standardized_domains || threadValues.extracted_domain || '';
        const standardizedDomains = Array.isArray(rawDomain) ? rawDomain : (rawDomain ? [rawDomain] : []);
        const extractedSeason = meta.extracted_season || threadValues.extracted_season || '';

        // Ensure call_details document exists, resolving bridge leg to parent if necessary
        let targetCallUuid = body.callUuid;
        let existingCallDetails = await this.callDetailsRepository.getByCallUuid(targetCallUuid);

        if ((!existingCallDetails || (existingCallDetails.status === 'connected' && (!existingCallDetails.duration || existingCallDetails.duration === 0))) && !isTestCall) {
          const isAlreadyRegisteredParent = !!this.plivoService.getCallMetadata(targetCallUuid);
          if (!isAlreadyRegisteredParent) {
            const parentUuid = this.plivoService.findParentCallUuid(farmerPhone);
            if (parentUuid && parentUuid !== targetCallUuid) {
              console.log(`🔗 [AccAgentController] Redirected query from bridge leg ${targetCallUuid} to parent ${parentUuid}`);
              targetCallUuid = parentUuid;
              existingCallDetails = await this.callDetailsRepository.getByCallUuid(targetCallUuid);
            }
          }
        }

        if (!existingCallDetails) {
          const inMemoryMeta = this.plivoService.getCallMetadata(targetCallUuid);
          const agentUserIdStr = this.plivoService.getCallAgent(targetCallUuid) || inMemoryMeta?.agentUserId;
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
          console.warn(`[AccAgentController] Call details document not found for callUuid: ${targetCallUuid}. Creating new document with agent.userid: ${agentUserIdStr}`);
          await this.callDetailsRepository.create({
            callUuid: targetCallUuid,
            from: inMemoryMeta?.from || (isTestCall ? undefined : (farmerPhone || undefined)),
            to: inMemoryMeta?.to,
            status: 'completed',
            direction: inMemoryMeta?.direction || 'inbound',
            caller: { transcript: this.plivoService.getTranscript(targetCallUuid, 'inbound'), translation: this.plivoService.getTranslation(targetCallUuid, 'inbound'), detectedLanguage: this.plivoService.getDetectedLanguage(targetCallUuid, 'inbound') },
            agent: { transcript: this.plivoService.getTranscript(targetCallUuid, 'outbound'), translation: this.plivoService.getTranslation(targetCallUuid, 'outbound'), detectedLanguage: this.plivoService.getDetectedLanguage(targetCallUuid, 'outbound'), userid: agentUserIdObj }
          });
        } else if (!isTestCall && farmerPhone) {
          const isOutbound = existingCallDetails.direction === 'outbound';
          if (isOutbound && (!existingCallDetails.to || existingCallDetails.to === 'unknown')) {
            await this.callDetailsRepository.updateCallDetails(targetCallUuid, { to: farmerPhone });
          } else if (!isOutbound && (!existingCallDetails.from || existingCallDetails.from === 'unknown')) {
            await this.callDetailsRepository.updateCallDetails(targetCallUuid, { from: farmerPhone });
          }
        }

        // Add individual query with its own metadata to call_queries collection
        await this.callDetailsRepository.addQueryToCall(targetCallUuid, {
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
            ...(!isTestCall && farmerPhone ? { farmerPhone } : {}),
            ...(!isTestCall && farmerName ? { farmerName } : {}),
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

        // If real call with farmer phone, upsert Farmers_info with confirmed profile
        if (!isTestCall && farmerPhone) {
          try {
            const existingFarmer = await this.callFarmerRepository.findByPhoneNo(farmerPhone);
            const profileData: FarmerProfile = {
              farmerName: farmerName || existingFarmer?.profile?.farmerName || '',
              phoneNo: farmerPhone,
              primaryCrop: extractedCrop || existingFarmer?.profile?.primaryCrop || (existingFarmer?.profile as any)?.crop || '',
              state: extractedState || existingFarmer?.profile?.state || '',
              district: extractedDistrict || existingFarmer?.profile?.district || '',
              blockName: extractedBlock || existingFarmer?.profile?.blockName || '',
              villageName: extractedVillage || existingFarmer?.profile?.villageName || '',
            };

            if (existingFarmer) {
              await this.callFarmerRepository.update(farmerPhone, {
                ...existingFarmer.profile,
                ...profileData,
              });
            } else if (farmerName || extractedCrop || extractedState) {
              await this.callFarmerRepository.create({
                phoneNo: farmerPhone,
                profile: profileData,
              });
            }
          } catch (farmerErr) {
            console.warn(`[AccAgentController] Non-fatal error updating farmer profile for ${farmerPhone}:`, farmerErr);
          }
        }
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
