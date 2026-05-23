import type { ClientSession, ObjectId } from 'mongodb';

export interface CallParticipant {
  transcript: string;
  translation: string;
  detectedLanguage: string;
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
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICallDetailsRepository {
  create(details: CallDetails, session?: ClientSession): Promise<string>;
  getByCallUuid(callUuid: string, session?: ClientSession): Promise<CallDetails | null>;
  getAll(session?: ClientSession): Promise<CallDetails[]>;
}
