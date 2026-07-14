export type UserRole = "admin" | "moderator" | "expert" | "pae_expert" | "tester" | "district_coordinator" | "block_coordinator" | "village_volunteer" | "call_agent";

export interface IMyPreference {
  state: string;
  crop: string;
  domain: string | string[];
}

export type NotificationRetentionType = "3d" | "1w" | "2w" | "1m" | "never";

export interface IUser {
  _id?: string;
  firebaseUID?: string;
  email: string;
  firstName: string;
  lastName?: string;
  password?: string;
  preference?: IMyPreference;
  role: UserRole;
  notifications?: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  isBlocked?: boolean;
  isCallAgentActive?: boolean;
  agent?: string;
  isBusy?: boolean;
  currentCallUuid?: string | null;
  lastAgentActiveAt?: string | Date;
}
