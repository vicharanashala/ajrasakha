import {ObjectId} from 'mongodb';

export enum AuditCategory {
  QUESTION = 'QUESTION',
  EXPERTS_CATEGORY = 'EXPERTS_CATEGORY',
  EXPERTS_MANAGEMENT = 'EXPERTS_MANAGEMENT',
  REQUEST_QUEUE = 'REQUEST_QUEUE',
  ANALYTICS = 'ANALYTICS',
  CROP_MANAGEMENT = 'CROP_MANAGEMENT',
  OUTREACH_REPORT = 'OUTREACH_REPORT',
  AGENTS_INTERFACE= 'AGENTS_INTERFACE', // PENDING, not on priority
  DOWNLOAD_REPORTS= 'DOWNLOAD_REPORTS',
  ANSWER= 'ANSWER',
  ADMIN_REPORT= 'ADMIN_REPORT',
  AI_GENERATED= 'AI_GENERATED',
}

export enum AuditAction {
  // Question
  QUESTION_ADD = 'QUESTION_ADD',
  QUESTION_UPDATE = 'QUESTION_UPDATE',
  QUESTION_DELETE = 'QUESTION_DELETE',
  QUESTION_BULK_CREATE = 'QUESTION_BULK_CREATE',
  QUESTION_BULK_UPDATE = 'QUESTION_BULK_UPDATE',
  QUESTION_BULK_DELETE = 'QUESTION_BULK_DELETE',
  REALLOCATE_QUESTIONS = 'REALLOCATE_QUESTIONS',

  //EXPERTS_CATEGORY
  EXPERTS_AUTO_ALLOCATE = 'EXPERTS_AUTO_ALLOCATE',
  SELECT_EXPERT = 'SELECT_EXPERT',
  DELETE_EXPERT = 'DELETE_EXPERT',
  EXPERTS_ADD_COMMENT = 'EXPERTS_ADD_COMMENT',

  //EXPERTS_MANAGEMENT
  BLOCK_EXPERT = 'BLOCK_EXPERT',
  UNBLOCK_EXPERT = 'UNBLOCK_EXPERT',

  //REQUEST_QUEUE,
  CHANGE_STATUS = 'CHANGE_STATUS',
  DELETE_REQUEST = 'DELETE_REQUEST',

  //ANALYTICS
  ANALYTICS_EXPORT_PDF = 'ANALYTICS_EXPORT_PDF', // button not functional yet, pending

  //CROP_MANAGEMENT
  ADD_CROP = 'ADD_CROP',
  UPDATE_CROP = 'UPDATE_CROP',

  //OUTREACH_REPORT
  SEND_OUTREACH_REPORT = 'SEND_OUTREACH_REPORT',

  //DOWNLOAD_REPORTS
  DOWNLOAD = 'DOWNLOAD',

  //ANSWER
  APPROVE_ANSWER = 'APPROVE_ANSWER',
  REROUTE_ANSWER = 'REROUTE_ANSWER',
  REROUTE_REJECTION = 'REROUTE_REJECTION',

  //ADMIN_REPORT
  SEND_DASHBOARD_REPORT = 'SEND_DASHBOARD_REPORT',

  //AI_GENERATED
  GENERATE_ANSWER = 'GENERATE_ANSWER',
}

export enum OutComeStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  PARTIAL = 'PARTIAL',
}

export interface ModeratorAuditTrail {
  category: AuditCategory;
  action: AuditAction;
  actor: {
    id: string | ObjectId;
    name: string;
    email: string;
    role?: string;
    avatar?: string;
  };

  context?: Record<string, any>;

  changes?: {
    before?: Record<string, any>;
    after?: Record<string, any>;
  };

  outcome?: {
    status: OutComeStatus;
    errorCode?: string;
    errorMessage?: string;
    errorName?: string;
    errorStack?: string; // truncated (top 3–5 lines)
  };

  createdAt?: Date;
}

export type AuditFilters = {
  page?: number;
  limit?: number;
  startDateTime?: string;
  endDateTime?: string;
  action?: string;
  category?: string;
  status?: string;
  sortOrder?: "asc" | "desc";
};