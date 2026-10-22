import 'reflect-metadata';
import {inject, injectable} from 'inversify';
import axios from 'axios';
import {ObjectId} from 'mongodb';
import {InternalServerError} from 'routing-controllers';
import {GLOBAL_TYPES} from '#root/types.js';
import {CORE_TYPES} from '#root/modules/core/types.js';
import {AiService} from '#root/modules/ai/services/AiService.js';
import {AccAgentService} from '#root/modules/acc-agent/services/AccAgentService.js';
import type {
  ICallDetailsRepository,
  QAPairs,
  QAMetadata,
} from '#root/shared/database/interfaces/ICallDetailsRepository.js';
import {GeneratedQuestionResponse} from '../classes/validators/QuestionVaidators.js';

/**
 * AI / ACC-agent question helpers extracted from QuestionService: generating
 * questions from raw or call context, the ACC-agent HIL flow (thread create,
 * extract, update, resume, state) and call summaries. QuestionService keeps thin
 * delegating wrappers for each of these.
 */
@injectable()
export class QuestionAiService {
  constructor(
    @inject(CORE_TYPES.AIService)
    private readonly aiService: AiService,

    @inject(GLOBAL_TYPES.AccAgentService)
    private readonly accAgentService: AccAgentService,

    @inject(Symbol.for('CallDetailsRepository'))
    private readonly callDetailsRepository: ICallDetailsRepository,
  ) {}

  async getQuestionFromRawContext(
    // While text to speech
    context: string,
  ): Promise<GeneratedQuestionResponse[]> {
    const questions = await this.aiService.getQuestionByContext(context);
    // SAMPLE RESPONSE (mocked because API doesn't work locally)
    /* const questions: any = {
       reviewer: [
         {
           id: "697dbfb7622aa3a183070682",
           question: "How to control stem borer grubs in paddy crop?",
           answer: "Stem borer is one of the most destructive pests of paddy (rice) crop...",
           source: "AGRI_EXPERT",
           details: {
             state: "Haryana",
             district: "HISSAR",
             crop: "Paddy",
             season: "KHARIF",
             domain: "Pest",
           },
           score: 0.9331517815589905,
         },
         {
           id: "695b446528ae67127339da95",
           question: "How to control Stem Borer infestation in Paddy?",
           answer: "Stem borer is one of the most destructive pests affecting paddy crops in India...",
           source: "AGRI_EXPERT",
           details: {
             state: "UTTAR PRADESH",
             district: "CHANDAULI",
             crop: "Paddy",
             season: "Kharif",
             domain: "Plant Protection",
           },
           score: 0.932569146156311,
         },
       ],
   
       golden: [
         {
           question: "How to prevent stem borer in paddy?",
           answer: "Stem borer in paddy is a major pest and shows distinct symptoms...",
           metadata: {
             "Agri Specialist": "Gonnabathula Girishma",
             Crop: "Paddy Dhan",
             District: "YADADRI BHUVANAGIRI",
             Season: "Kharif",
             State: "TELANGANA",
           },
           score: 0.9287769794464111,
         },
       ],
   
       pop: [
         {
           text: "Rice stem borers: The larvae of these insects bore into the stem and cause damage from July to October...",
           metadata: {
             page_no: 24,
             headings: ["A. Insect Pests"],
             source:
               "https://storage.googleapis.com/annam-dataset/pops/Punjab_Kharif_2025.pdf",
           },
           score: 0.9020636677742004,
         },
       ],
     };*/
    const merged = [
      ...(questions.reviewer || []).map((item: any) => ({
        question: item.question,
        answer: item.answer,
        agri_specialist: item.source || 'AGRI_EXPERT',
        referenceSource: 'reviewer',
      })),

      ...(questions.golden || []).map((item: any) => ({
        question: item.question,
        answer: item.answer,
        agri_specialist: item.metadata?.['Agri Specialist'] || 'Unknown',
        referenceSource: 'golden',
      })),

      ...(questions.pop || []).map((item: any) => ({
        question: 'Reference Information',
        answer: item.text,
        agri_specialist: 'POP_DOCUMENT',
        referenceSource: 'pop',
      })),
    ];
    const uniqueQuestions = Array.from(
      new Map(merged.map(q => [q.question, q])).values(),
    ).map(q => ({
      ...q,
      id: new ObjectId().toString(),
    }));
    return uniqueQuestions;
  }

  /**
   * Generate questions from call context (audio transcription)
   */
  async getQuestionFromCallContext(
    context: string,
    state?: string,
    crop?: string,
  ): Promise<GeneratedQuestionResponse[]> {
    try {
      const payload: any = {query: context};
      if (state) payload.state = state;
      if (crop) payload.crop = crop;

      const agentSearchResponse = await axios.post(
        'http://100.100.108.44:6002/search',
        payload,
        {timeout: 100000},
      );
      console.log(
        'Agent Search Output:',
        JSON.stringify(agentSearchResponse.data, null, 2),
      );

      const data = agentSearchResponse.data || {};

      // Send this in the appropriate format expected by the frontend
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
        // Map the results array from the agent_search response
        formattedResponse = data.results.map((item: any) => ({
          question: item.question || data.extracted_question || context,
          answer: item.answer || item.text || 'Answer not available',
          agri_specialist: item.source || 'AGRI_EXPERT',
          referenceSource: 'agent_search',
          id: item.id || new ObjectId().toString(),
        }));
      } else if (Array.isArray(data)) {
        formattedResponse = data.map((item: any) => ({
          question: item.question || context,
          answer: item.answer || item.response || JSON.stringify(item),
          agri_specialist: item.agri_specialist || item.source || 'AGRI_EXPERT',
          referenceSource: item.referenceSource || 'agent_search',
          id: item.id || new ObjectId().toString(),
        }));
      } else if (data && typeof data === 'object') {
        formattedResponse = [
          {
            question: data.extracted_question || data.question || context,
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
        new Map(formattedResponse.map(q => [q.question, q])).values(),
      ).map(q => ({
        ...q,
        id: q.id || new ObjectId().toString(),
      }));

      return uniqueQuestions;
    } catch (error) {
      console.error('Failed to generate questions from call context:', error);
      throw new InternalServerError(
        'Failed to generate questions from call context',
      );
    }
  }

  async getCallSummary(query: string): Promise<any> {
    try {
      const extractResponse = await axios.post(
        'http://100.100.108.44:6002/extract',
        {query},
        {timeout: 100000},
      );
      return extractResponse.data;
    } catch (error) {
      console.error('Failed to generate call summary:', error);
      throw new InternalServerError('Failed to generate call summary');
    }
  }

  /**
   * HIL Flow: Create thread for ACC Agent
   */
  async createAccAgentThread(): Promise<{thread_id: string}> {
    try {
      const result = await this.accAgentService.createThread();
      return result;
    } catch (error) {
      console.error('[QuestionService] createAccAgentThread: Error', error);
      throw new InternalServerError('Failed to create ACC Agent thread');
    }
  }

  /**
   * HIL Flow: Extract data from transcript
   */
  async extractAccAgentData(
    threadId: string,
    transcript: string,
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
      const result = await this.accAgentService.extractData(
        threadId,
        transcript,
      );

      return result;
    } catch (error) {
      console.error('[QuestionService] extractAccAgentData: Error', error);
      throw new InternalServerError('Failed to extract data using ACC Agent');
    }
  }

  /**
   * HIL Flow: Update state with human corrections
   */
  async updateAccAgentState(
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
    },
  ): Promise<void> {
    try {
      await this.accAgentService.updateState(threadId, correctedData);
    } catch (error) {
      console.error('[QuestionService] updateAccAgentState: Error', error);
      throw new InternalServerError('Failed to update ACC Agent state');
    }
  }

  /**
   * HIL Flow: Resume and get final answer
   */
  async resumeAccAgentAndGetAnswer(
    threadId: string,
    callUuid?: string,
    metadata?: QAMetadata,
  ): Promise<{final_answer: string}> {
    try {
      const result = await this.accAgentService.resumeAndGetAnswer(threadId);

      // If callUuid and metadata are provided, store Q/A pairs in call_details
      if (callUuid && metadata) {
        const qaPairs: QAPairs = {
          metadata,
          QnA: [
            {
              question: metadata.extracted_query,
              answer: result.final_answer,
              agri_specialist: 'ACC_AGENT',
              referenceSource: 'acc_agent_hitl',
              id: new ObjectId().toString(),
            },
          ],
        };

        // Check if call_details document exists
        const existingCallDetails =
          await this.callDetailsRepository.getByCallUuid(callUuid);

        if (existingCallDetails) {
          // Update existing document
          await this.callDetailsRepository.updateQA_Pairs(callUuid, qaPairs);
        } else {
          console.warn(
            `[QuestionService] Call details document not found for callUuid: ${callUuid}. Creating new document.`,
          );
          // Create a new call_details document with the Q/A pairs
          await this.callDetailsRepository.create({
            callUuid,
            QA_pairs: qaPairs,
            status: 'completed',
            direction: 'inbound',
            caller: {
              transcript: '',
              translation: '',
              detectedLanguage: 'unknown',
            },
            agent: {
              transcript: '',
              translation: '',
              detectedLanguage: 'unknown',
            },
          });
        }
      }

      return result;
    } catch (error) {
      console.error(
        '[QuestionService] resumeAccAgentAndGetAnswer: Error',
        error,
      );
      throw new InternalServerError(
        'Failed to get final answer from ACC Agent',
      );
    }
  }

  async getAccAgentState(
    threadId: string,
    callUuid?: string,
    metadata?: QAMetadata,
  ): Promise<any> {
    try {
      // 1. Resume the agent
      await this.accAgentService.resumeAndGetAnswer(threadId);

      // 2. Fetch the full thread state (with parsed final_answer, weather, and similar pairs)
      const threadState = await this.accAgentService.getThreadState(threadId);

      // 3. If callUuid and metadata are provided, store Q/A pairs in call_details
      if (callUuid && metadata) {
        const finalAnswerObj = threadState?.values?.final_answer;
        const finalAnswerMarkdown =
          typeof finalAnswerObj === 'string'
            ? finalAnswerObj
            : finalAnswerObj?.final_answer || '';

        const weather = finalAnswerObj?.weather || null;
        const similarPair = finalAnswerObj?.gdb?.similar_pair1 || null;
        const authorName = similarPair?.details?.[0]?.author_name || '';
        const sourceName = similarPair?.details?.[0]?.source_name || '';
        const sourceLink = similarPair?.details?.[0]?.source_link || '';

        const qaPairs: QAPairs = {
          metadata,
          QnA: [
            {
              question: metadata.extracted_query,
              answer: finalAnswerMarkdown,
              agri_specialist: 'ACC_AGENT',
              referenceSource: 'acc_agent_hitl',
              id: new ObjectId().toString(),
              ...(weather ? {weather} : {}),
              ...(authorName ? {authorName} : {}),
              ...(sourceName ? {sourceName} : {}),
              ...(sourceLink ? {sourceLink} : {}),
            } as any,
          ],
        };

        // Check if call_details document exists
        const existingCallDetails =
          await this.callDetailsRepository.getByCallUuid(callUuid);

        if (existingCallDetails) {
          // Update existing document
          await this.callDetailsRepository.updateQA_Pairs(callUuid, qaPairs);
        } else {
          console.warn(
            `[QuestionService] Call details document not found for callUuid: ${callUuid}. Creating new document.`,
          );
          // Create a new call_details document with the Q/A pairs
          await this.callDetailsRepository.create({
            callUuid,
            QA_pairs: qaPairs,
            status: 'completed',
            direction: 'inbound',
            caller: {
              transcript: '',
              translation: '',
              detectedLanguage: 'unknown',
            },
            agent: {
              transcript: '',
              translation: '',
              detectedLanguage: 'unknown',
            },
          });
        }
      }

      // 4. Return the full thread state
      return threadState;
    } catch (error) {
      console.error(
        '[QuestionService] getAccAgentState: Error resuming or fetching state',
        error,
      );
      throw new InternalServerError(
        'Failed to resume or fetch ACC Agent state',
      );
    }
  }
}
