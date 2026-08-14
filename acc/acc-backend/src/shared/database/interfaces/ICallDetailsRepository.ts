import type { ClientSession, ObjectId } from 'mongodb';

export interface CallParticipant {
  transcript: string;
  translation: string;
  detectedLanguage: string;
  userid?: ObjectId;
  username?: string;
  email?: string;
}

export interface CallQuery {
  _id?: string | ObjectId;
  callUuid: string;
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
  };
  question: string;
  answer: string;
  agri_specialist?: string;
  referenceSource?: string;
  authorName?: string;
  sourceName?: string;
  sourceLink?: string;
  weather?: any;
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
  createdAt: Date;
  updatedAt: Date;
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
  recording?: CallRecording;
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
  addQueryToCall(callUuid: string, queryData: Partial<CallQuery>, session?: ClientSession): Promise<string>;
  getQueriesByCallUuid(callUuid: string, session?: ClientSession): Promise<CallQuery[]>;
  getQueriesByIds(queryIds?: (string | ObjectId)[], fallbackCallUuid?: string, session?: ClientSession): Promise<CallQuery[]>;
  updateCallDetails(callUuid: string, details: Partial<CallDetails>, session?: ClientSession): Promise<void>;
  addRecordingToCall(callUuid: string, recording: CallRecording, session?: ClientSession): Promise<void>;
  findRecordingsForPlivoCleanup(olderThanDate: Date, session?: ClientSession): Promise<{ callUuid: string; recordingId: string }[]>;
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
}


