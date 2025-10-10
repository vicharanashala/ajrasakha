import {ObjectId} from 'mongodb';

export type UserRole = 'admin' | 'user' | 'expert';
export type QuestionStatus = 'open' | 'answered' | 'closed';
export interface IPreference {
  state: string;
  crop: string;
  domain: string;
}
export interface IUser {
  _id?: string | ObjectId;
  firebaseUID: string;
  email: string;
  firstName: string;
  lastName?: string;
  preference?: IPreference | null;
  role: UserRole;
  createdAt?: Date;
  updatedAt?: Date;
}

export type IQuestionPriority = 'low' | 'medium' | 'high';

export interface IQuestion {
  _id?: string | ObjectId;
  userId?: ObjectId | string;
  question: string;
  context?: ObjectId | string;
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
  source: 'AJRASAKHA' | 'AGRI_EXPERT';
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAnswer {
  _id?: string | ObjectId;
  questionId: string | ObjectId;
  authorId: string | ObjectId;
  answerIteration: number;
  isFinalAnswer: boolean;
  answer: string;
  sources: string[];
  threshold: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// For transcripts
export interface IContext {
  _id?: string | ObjectId;
  text: string;
  createdAt?: Date;
}

export interface ISubmissionHistroy {
  updatedBy: string | ObjectId;
  answer: string | ObjectId;
  isFinalAnswer: boolean;
  updatedAt: Date;
}
export interface IQuestionSubmission {
  _id?: string | ObjectId;
  questionId: string | ObjectId;
  lastRespondedBy: string | ObjectId;
  history: ISubmissionHistroy[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IComment {
  _id?: string | ObjectId;
  questionId: string | ObjectId;
  answerId: string | ObjectId;
  userId: string | ObjectId;
  text: string;
  createdAt: Date;
}

export type RequestStatus = 'pending' | 'rejected' | 'approved' | 'in-review';

export interface IModeratorResponse {
  moderatorId: string | ObjectId;
  status: RequestStatus;
  response?: string;
  reviewedAt?: Date;
  moderatorName?: string; 
}

export type ModeratorRequestDetails =
  | { requestType: 'question_flag'; details: IQuestion }
  | { requestType: 'others'; details: Record<string, any> };

export type IModeratorRequest = ModeratorRequestDetails & {
  _id: string | ObjectId;
  reason: string;
  responses: IModeratorResponse[];
  status: RequestStatus;
  createdAt: string | Date;
  updatedAt: string | Date;
}
