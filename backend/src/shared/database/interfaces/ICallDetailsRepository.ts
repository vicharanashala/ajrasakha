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
}

export interface QAItem {
  question: string;
  answer: string;
  agri_specialist: string;
  referenceSource: string;
  id: string;
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

export interface ICallDetailsRepository {
  create(details: CallDetails, session?: ClientSession): Promise<string>;
  getByCallUuid(callUuid: string, session?: ClientSession): Promise<CallDetails | null>;
  getAll(session?: ClientSession): Promise<CallDetails[]>;
  updateQA_Pairs(callUuid: string, qaPairs: QAPairs, session?: ClientSession): Promise<void>;
  
  /**
   * Get analytics for a specific call agent
   * @param agentUserId - The ObjectId of the agent user
   * @param startDate - Optional start date for filtering
   * @param endDate - Optional end date for filtering
   * @param session - MongoDB session for transactions
   * @returns Agent analytics data
   */
  getAgentAnalytics(
    agentUserId: string,
    startDate?: Date,
    endDate?: Date,
    session?: ClientSession
  ): Promise<AgentAnalytics>;
}
