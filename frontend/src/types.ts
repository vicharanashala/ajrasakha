import type { UserCredential } from "firebase/auth";

export type UserRole = "admin" | "user" | "expert";

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

export interface IQuestion {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
  totalAnswersCount: number;
  priority: QuestionPriority;
  status: QuestionStatus;
  source: "AJRASAKHA" | "AGRI_EXPERT";
  details: {
    state: string;
    district: string;
    crop: string;
    season: string;
    domain: string;
  };
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
    createdAt: string;
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
  | "en-IN"
  | "en-US"
  | "hi-IN"
  | "bn-IN"
  | "te-IN"
  | "mr-IN"
  | "ta-IN"
  | "gu-IN"
  | "kn-IN"
  | "ml-IN"
  | "pa-IN"
  | "ur-IN";

export type QuestionStatus = "open" | "answered" | "closed";

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
  isFinalAnswer: boolean;
  updatedAt: string;
}

export interface ISubmission {
  _id: string;
  questionId: string;
  lastRespondedBy: {
    _id: string;
    name: string;
    email: string;
  } | null;
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
  priority: QuestionPriority;
  source: string;
  totalAnswersCount: number;
  createdAt: string;
  updatedAt: string;
  submissions: ISubmission;
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
  text: string;
  createdAt: string;
}

export interface IDetailedQuestion {
  _id?: string;
  userId: string;
  question: string;
  context: string;
  status: QuestionStatus;
  totalAnswersCount: number;
  priority: QuestionPriority;
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
