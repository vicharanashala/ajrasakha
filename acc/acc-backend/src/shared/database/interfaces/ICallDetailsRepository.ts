import type { ClientSession, ObjectId } from 'mongodb';

export interface CallTranscriptMessage {
  track: 'inbound' | 'outbound';
  speaker: 'caller' | 'agent';
  originalText: string;
  translatedText: string;
  detectedLanguage?: string;
  timestamp: Date | string;
}

export interface CallParticipant {
  transcript: string;
  translation: string;
  detectedLanguage: string;
  userid?: ObjectId;
  username?: string;
  email?: string;
}

export type QueryType = 'GDB' | 'AI-drafted';
export type ReviewStatus = 'not_submitted' | 'pending_review' | 'approved' | 'rejected' | 'submission_failed';
export type FarmerFollowUpStatus = 'pending' | 'called' | 'resolved';

export interface CallQuery {
  _id?: string | ObjectId;
  callUuid: string;
  type?: QueryType;
  metadata: {
    extracted_query?: string;
    extracted_crop?: string;
    extracted_state?: string;
    extracted_district?: string;
    extracted_block?: string;
    extracted_village?: string;
    extracted_domain?: string | string[];
    extracted_season?: string;
    standardized_domains?: string[];
    farmerPhone?: string;
    farmerName?: string;
    [key: string]: any;
  };
  question: string;
  answer: string;
  citations?: any[];
  agri_specialist?: string;
  referenceSource?: string;
  authorName?: string;
  sourceName?: string;
  sourceLink?: string;
  weather?: any;

  // Review System & SLA tracking
  reviewQuestionId?: string;
  reviewStatus?: ReviewStatus;
  reviewSlaExpiresAt?: Date;
  reviewedAnswer?: string;
  reviewedSources?: any[];
  reviewedBy?: string;
  reviewedAt?: Date;

  // Follow-up tracking
  farmerFollowUpStatus?: FarmerFollowUpStatus;
  farmerFollowUpAt?: Date;
  farmerFollowUpNotes?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export interface CallRecording {
  recordingId: string;
  storagePath: string;
  storageBucket: string;
  duration: number;
  durationMs?: number;
  format: 'mp3' | 'wav';
  status: 'recording' | 'processing' | 'completed' | 'failed';
  sizeBytes?: number;
  plivoRecordUrl?: string;
  plivoDeleted: boolean;
  plivoDeletedAt?: Date | null;
  startMs?: number;
  endMs?: number;
  type?: 'normal' | 'conference';
  reason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface QAMetadata {
  extracted_query?: string;
  extracted_crop?: string;
  extracted_state?: string;
  extracted_district?: string;
  extracted_domain?: string;
  extracted_season?: string;
  [key: string]: any;
}

export interface QAItem {
  question: string;
  answer: string;
  agri_specialist?: string;
  referenceSource?: string;
  id?: string;
  weather?: any;
  authorName?: string;
  sourceName?: string;
  sourceLink?: string;
}

export interface QAPairs {
  metadata?: QAMetadata;
  QnA?: QAItem[];
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
  conversations?: CallTranscriptMessage[];
  recording?: CallRecording;
  recordings?: CallRecording[];
  QA_pairs?: QAPairs;
  queryIds?: (string | ObjectId)[];
  queries?: CallQuery[];
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
  getHistory(
    params: {
      limit?: number;
      offset?: number;
      startDate?: string;
      endDate?: string;
      status?: string;
      direction?: string;
      agentId?: string;
    },
    session?: ClientSession
  ): Promise<CallDetails[]>;
  addQueryToCall(callUuid: string, queryData: Partial<CallQuery>, session?: ClientSession): Promise<string>;
  getQueriesByCallUuid(callUuid: string, session?: ClientSession): Promise<CallQuery[]>;
  getQueriesByIds(queryIds?: (string | ObjectId)[], fallbackCallUuid?: string, session?: ClientSession): Promise<CallQuery[]>;
  updateCallDetails(callUuid: string, details: Partial<CallDetails>, session?: ClientSession): Promise<void>;
  addRecordingToCall(callUuid: string, recording: CallRecording, session?: ClientSession): Promise<void>;
  findRecordingsForPlivoCleanup(olderThanDate: Date, session?: ClientSession): Promise<{ callUuid: string; recording: CallRecording }[]>;
  findCallsMissingRecordings(sinceDate: Date, session?: ClientSession): Promise<CallDetails[]>;
  markPlivoRecordingDeleted(callUuid: string, recordingId: string, session?: ClientSession): Promise<void>;
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
      state?: string;
      district?: string;
      block?: string;
      crop?: string;
      season?: string;
      limit?: number;
      offset?: number;
    },
    session?: ClientSession
  ): Promise<{ queries: any[]; total: number }>;
  updateQueryByReviewQuestionId(
    reviewQuestionId: string,
    updateData: Partial<CallQuery>,
    session?: ClientSession
  ): Promise<CallQuery | null>;
  updateQueryById(
    queryId: string | ObjectId,
    updateData: Partial<CallQuery>,
    session?: ClientSession
  ): Promise<CallQuery | null>;
  getFollowUps(
    filter?: {
      reviewStatus?: ReviewStatus | ReviewStatus[];
      farmerFollowUpStatus?: FarmerFollowUpStatus | FarmerFollowUpStatus[];
      limit?: number;
      offset?: number;
    },
    session?: ClientSession
  ): Promise<{ queries: CallQuery[]; total: number }>;
}


