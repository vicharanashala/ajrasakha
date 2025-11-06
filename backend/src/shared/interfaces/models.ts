import {ObjectId} from 'mongodb';

export type UserRole = 'admin' | 'moderator' | 'expert';
export type QuestionStatus = 'open' | 'in-review' | 'closed' | 'delayed';
export interface IPreference {
  state: string;
  crop: string;
  domain: string;
}
export type NotificationRetentionType = '3d' | '1w' | '2w' | '1m' |'never'
export interface IUser {
  _id?: string | ObjectId;
  firebaseUID: string;
  email: string;
  firstName: string;
  lastName?: string;
  preference?: IPreference | null;
  reputation_score: number;
  notifications?: number;
  role: UserRole;
  notificationRetention?:NotificationRetentionType
  createdAt?: Date;
  updatedAt?: Date;
}

export type IQuestionPriority = 'low' | 'medium' | 'high';

export interface IQuestionMetrics {
  mean_similarity: number;
  std_similarity: number;
  recent_similarity: number;
  collusion_score: number;
}
export interface IQuestion {
  _id?: string | ObjectId;
  userId?: ObjectId | string;
  question: string;
  contextId?: ObjectId | string | null;
  status: QuestionStatus;
  totalAnswersCount: number;
  priority: IQuestionPriority;
  details: {
    state: string;
    district: string;
    crop: string;
    season: string;
    domain: string;
  };
  isAutoAllocate: boolean;
  source: 'AJRASAKHA' | 'AGRI_EXPERT';
  embedding: number[];
  metrics: IQuestionMetrics | null;
  text?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface SourceItem {
  source: string;
  page?: number;
}
export interface IAnswer {
  _id?: string | ObjectId;
  questionId: string | ObjectId;
  authorId: string | ObjectId;
  answerIteration: number;
  approvalCount: number;
  isFinalAnswer: boolean;
  approvedBy?: string | ObjectId;
  answer: string;
  sources: SourceItem[];
  embedding: number[];
  createdAt?: Date;
  updatedAt?: Date;
}

// For transcripts
export interface IContext {
  _id?: string | ObjectId;
  text: string;
  createdAt?: Date;
}

export interface ISubmissionHistory {
  updatedBy: string | ObjectId;
  answer?: string | ObjectId;
  status: 'reviewed' | 'in-review' | 'approved' | 'rejected'; // pending is for initial state of new assigned executive , in-review is state after expert answer, reviewed state is when an expert reviewed (accept/reject) other answer
  reasonForRejection?: string;
  rejectedBy?: string | ObjectId;
  approvedAnswer?: string | ObjectId;
  rejectedAnswer?: string | ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IQuestionSubmission {
  _id?: string | ObjectId;
  questionId: string | ObjectId;
  lastRespondedBy: string | ObjectId;
  history: ISubmissionHistory[];
  queue: (string | ObjectId)[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IComment {
  _id?: string | ObjectId;
  questionId: string | ObjectId;
  answerId: string | ObjectId;
  userId: string | ObjectId;
  userName?: string;
  text: string;
  createdAt: Date;
}

export type RequestStatus = 'pending' | 'rejected' | 'approved' | 'in-review';

export interface IRequestResponse {
  reviewedBy: string | ObjectId;
  role: UserRole;
  status: RequestStatus;
  response?: string;
  reviewedAt?: Date;
  reviewerName?: string;
}

export type RequestDetails =
  | {requestType: 'question_flag'; details: IQuestion | null}
  | {requestType: 'others'; details: Record<string, any> | null};

export type IRequest = RequestDetails & {
  _id?: string | ObjectId;
  reason: string;
  requestedBy: string | ObjectId;
  entityId: string | ObjectId;
  responses: IRequestResponse[];
  status: RequestStatus;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

export type INotificationType = 'flag' | 'answer_creation' | 'peer_review';
export interface INotification {
  _id?: string | ObjectId;
  userId: string | ObjectId;
  enitity_id?: string | ObjectId;
  title: string;
  // type:INotificationType;
  type: string;
  message: string;
  is_read: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface ISubscription {
  _id?: string | ObjectId;
  userId: string | ObjectId;
  subscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
}
