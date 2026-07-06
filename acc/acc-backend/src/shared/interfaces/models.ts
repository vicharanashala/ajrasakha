import { ObjectId } from 'mongodb';

export type UserRole = 'admin' | 'moderator' | 'expert' | 'pae_expert' | 'tester' | 'district_coordinator' | 'block_coordinator' | 'village_volunteer' | 'call_agent';

export interface IPreference {
  state: string;
  crop: string;
  domain: string | string[];
}

export type NotificationRetentionType = '3d' | '1w' | '2w' | '1m' | 'never';
export type UserStatus = 'active' | 'in-active';

export interface IUser {
  _id?: string | ObjectId;
  firebaseUID: string;
  email: string;
  firstName: string;
  lastName?: string;
  preference?: IPreference | null;
  role: UserRole;
  isBlocked?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  status?: UserStatus;
  avatar?: string;
  mobile?: string;
  isCallAgentActive?: boolean;
  agent?: string; // "not_available" or "agent_1", "agent_2", etc.
  isBusy?: boolean; // true if agent is currently in a call
  currentCallUuid?: string | null; // UUID of the current call being handled
}
