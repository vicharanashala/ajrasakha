import type { ClientSession, ObjectId } from 'mongodb';

export interface CallParticipant {
  transcript: string;
  translation: string;
  detectedLanguage: string;
  userid?: ObjectId;
}

export interface QAMetadata {
  extracted_query: string;
  extracted_crop: string;
  extracted_state: string;
  extracted_district: string;
  extracted_domain: string;
  extracted_season: string;
  standardized_domains?: string[];
}

export interface QAItem {
  question: string;
  answer: string;
  agri_specialist: string;
  referenceSource: string;
  id: string;
  weather?: any;
  authorName?: string;
  sourceName?: string;
  sourceLink?: string;
}

export interface QAPairs {
  metadata: QAMetadata;
  QnA: QAItem[];
}

export interface CallDetails {
  _id?: string | ObjectId;
  callUuid: string;
  from?: string;
  to?: string;
  duration?: number;
  status?: string;
  direction?: string;
  caller: CallParticipant;
  agent: CallParticipant;
  QA_pairs?: QAPairs;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AgentAnalytics {
  totalCalls: number;
  callsToday: number;
  callsThisWeek: number;
  callsThisMonth: number;
  averageDuration: number;
  domains: { domain: string; count: number }[];
  callsByStatus: { status: string; count: number }[];
  dailyCallTrend: { date: string; count: number }[];
}

export interface ACCAnalytics {
  totalCalls: number;
  callsToday: number;
  callsThisWeek: number;
  callsThisMonth: number;
  domains: { domain: string; count: number; today: number; thisWeek: number; thisMonth: number }[];
  monthlyTrend: { month: string; count: number }[];
  dailyTrend: { date: string; count: number }[];
}

export interface ICallDetailsRepository {
  create(details: CallDetails, session?: ClientSession): Promise<string>;
  getByCallUuid(callUuid: string, session?: ClientSession): Promise<CallDetails | null>;
  getAll(session?: ClientSession): Promise<CallDetails[]>;
  updateQA_Pairs(callUuid: string, qaPairs: QAPairs, session?: ClientSession): Promise<void>;
  updateCallDetails(callUuid: string, details: Partial<CallDetails>, session?: ClientSession): Promise<void>;
  getAgentAnalytics(
    agentUserId: string,
    startDate?: Date,
    endDate?: Date,
    session?: ClientSession
  ): Promise<AgentAnalytics>;
  getACCAnalytics(
    startDate?: Date,
    endDate?: Date,
    session?: ClientSession
  ): Promise<ACCAnalytics>;
  getQueriesByPeriod(
    params: {
      startDate?: Date;
      endDate?: Date;
      search?: string;
      domain?: string;
      limit?: number;
      offset?: number;
    },
    session?: ClientSession
  ): Promise<{ queries: CallDetails[]; total: number }>;
}
