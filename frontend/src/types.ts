import type { UserCredential } from "firebase/auth";

export type UserRole = "admin" | "moderator" | "expert";

export interface ExtendedUserCredential extends UserCredential {
  _tokenResponse?: {
    idToken: string;
    firstName?: string;
    lastName?: string;
    isNewUser?: boolean;
  };
}
export interface AuthUser {
  uid: string;
  email: string;
  name: string;
  avatar: string;
}
export interface IMyPreference {
  state: string;
  crop: string;
  domain: string;
}
export interface IUser {
  _id?: string;
  firebaseUID?: string;
  email: string;
  firstName: string;
  lastName?: string;
  password?: string;
  preference?: IMyPreference;
  role: UserRole;
  createdAt?: Date;
  updatedAt?: Date;
}
export type QuestionPriority = "low" | "medium" | "high";
export type QuestionSource = "AJRASAKHA" | "AGRI_EXPERT";
export interface IQuestion {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
  totalAnswersCount: number;
  priority: QuestionPriority;
  status: QuestionStatus;
  source: QuestionSource;
  details: {
    state: string;
    district: string;
    crop: string;
    season: string;
    domain: string;
  };
  isAutoAllocate: boolean;
  currentAnswers?: {
    answer: string;
    id: string;
    isFinalAnswer: boolean;
    createdAt: string;
  }[];
}

export interface ISubmissions {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
  totalAnwersCount: number;
  reponse: {
    answer: string;
    id: string;
    isFinalAnswer: boolean;
    // createdAt: string;
  };
}

export type Role = "expert" | "user" | "admin" | null;

export interface AuthContextType {
  role: Role;
  isAuthenticated: boolean;
  login: (
    selectedRole: Role,
    uid: string,
    email: string,
    name?: string
  ) => void;
  loginWithGoogle: () => Promise<any>;
  loginWithEmail: (email: string, password: string) => Promise<any>;
  logout: () => void;
}

export interface IContext {
  _id?: string;
  text: string;
  createdAt?: Date;
}

export interface SubmitAnswerResponse {
  insertedId: string;
  isFinalAnswer: boolean;
}

export type SupportedLanguage =
  | "auto"
  | "en-IN"
  | "hi-IN"
  | "bn-IN"
  | "te-IN"
  | "mr-IN"
  | "ta-IN"
  | "gu-IN"
  | "kn-IN"
  | "ml-IN"
  | "pa-IN"
  | "ur-IN"
  | "as-IN"
  | "brx-IN"
  | "doi-IN"
  | "ks-IN"
  | "kok-IN"
  | "mai-IN"
  | "mni-IN"
  | "ne-IN"
  | "sa-IN"
  | "sat-IN"
  | "sd-IN";

export type QuestionStatus = "open" | "in-review" | "closed";

export interface IAnswer {
  _id?: string;
  questionId: string;
  authorId: string;
  answerIteration: number;
  isFinalAnswer: boolean;
  sources: string[];
  answer: string;
  threshold: number;
  createdAt?: Date;
  updatedAt?: Date;
}
export interface IUserRef {
  _id: string;
  name: string;
  email: string;
}

export interface ISubmissionHistory {
  updatedBy: IUserRef | null;
  answer: IAnswer | null;
}

export interface ISubmission {
  _id: string;
  questionId: string;
  lastRespondedBy: IUserRef | null;
  queue: IUserRef[];
  history: ISubmissionHistory[];
  createdAt: string;
  updatedAt: string;
}

export interface IQuestionFullData {
  _id: string;
  question: string;
  status: QuestionStatus;
  details: {
    state: string;
    district: string;
    crop: string;
    season: string;
    domain: string;
  };
  isAutoAllocate: boolean;
  priority: QuestionPriority;
  context: string;
  metrics: IQuestionMetrics;
  source: string;
  totalAnswersCount: number;
  createdAt: string;
  updatedAt: string;
  submission: ISubmission;
  isAlreadySubmitted: boolean;
}

export interface QuestionFullDataResponse {
  success: true;
  data: IQuestionFullData;
  currentUserId: string;
}

export interface IComment {
  _id: string;
  questionId: string;
  answerId: string;
  userId: string;
  userName?: string;
  text: string;
  createdAt: string;
}
export interface IQuestionMetrics {
  mean_similarity: number;
  std_similarity: number;
  recent_similarity: number;
  collusion_score: number;
}
export interface IDetailedQuestion {
  _id?: string;
  userId: string;
  question: string;
  context: string;
  status: QuestionStatus;
  totalAnswersCount: number;
  priority: QuestionPriority;
  metrics: IQuestionMetrics;
  details: {
    state: string;
    district: string;
    crop: string;
    season: string;
    domain: string;
  };
  source: "AJRASAKHA" | "AGRI_EXPERT";
  createdAt?: string;
  updatedAt?: string;
}

export interface IDetailedQuestionResponse {
  totalPages: number;
  totalCount: number;
  questions: IDetailedQuestion[];
}

export type RequestStatus = "pending" | "rejected" | "approved" | "in-review";

export interface IRequestResponse {
  reviewedBy: string;
  role: "admin" | "moderator";
  status: RequestStatus;
  response?: string;
  reviewedAt?: Date | string;
  reviewerName?: string;
}

export type RequestDetails =
  | { requestType: "question_flag"; details: IQuestion }
  | { requestType: "others"; details: Record<string, any> };

export type IRequest = RequestDetails & {
  _id: string;
  reason: string;
  userId: string;
  userName?: string;
  entityId: string;
  responses: IRequestResponse[];
  status: RequestStatus;
  createdAt: string | Date;
  updatedAt: string | Date;
};
