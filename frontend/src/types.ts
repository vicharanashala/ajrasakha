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
  createdAt?: Date;
  updatedAt?: Date;
  reputation_score?: number;
  incentive?: number;
  isBlocked?: boolean;
  penalty?: number;
  notificationRetention?: string;
}

export interface IReviewParmeters {
  contextRelevance: boolean;
  technicalAccuracy: boolean;
  practicalUtility: boolean;
  valueInsight: boolean;
  credibilityTrust: boolean;
  readabilityCommunication: boolean;
}

export type ReviewType = "question" | "answer";
export type ReviewAction = "accepted" | "rejected" | "modified";

export interface IReview {
  _id?: string;
  reviewType: ReviewType;
  action: ReviewAction;
  questionId: string;
  answerId?: string;
  reviewerId: string;
  reviewer?: IUser;
  reason?: string;
  parameters?: IReviewParmeters;
  createdAt?: Date;
  updatedAt?: Date;
  reputation_score?: number;
  notificationRetention?: NotificationRetentionType;
}

export interface HistoryItem {
  updatedBy: {
    // who's submission is this
    _id: string;
    userName: string;
    email: string;
  };
  lastModifiedBy?: {
    // who modified last
    _id: string;
    userName: string;
    email: string;
  };
  answer?: {
    //answer
    _id: string;
    answer: string;
    approvalCount: string;
    sources: SourceItem[];
    remarks: string;
  };
  review?: Partial<IReview>;
  // in-review => if a question assigned to an expert for reiview, or state of a answer before approval or rejection
  // reviewed => if an expert reviewed (accpeted/rejected) the previous answer
  // approved => After three consecutive approvals fo an answer
  // rejected => If any expert rejects an answer, so that history status would be rejected and rejected person doc status would be reviewed
  status?: "in-review" | "reviewed" | "approved" | "rejected";
  // rejection reason
  reasonForRejection?: string;
  // If an expert is approving, it store the approved answer id
  approvedAnswer?: string;
  // If an expert is rejecting, it store the rejected answer id
  rejectedAnswer?: string;
  // The reason if an expert is modifying an answer
  reasonForLastModification?: string;
  // If an expert is modifying, it store the modified answer id
  modifiedAnswer?: string;
  // timestamp
  createdAt: Date;
  updatedAt: Date;
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
  history: HistoryItem[];
  details: {
    state: string;
    district: string;
    crop: string;
    season: string;
    domain: string;
  };
  isAutoAllocate: boolean;
  aiInitialAnswer?: string;
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
  questionStatus: string;
  reponse: {
    answer: string;
    id: string;
    isFinalAnswer: boolean;
    createdAt: string;
    status: string;
    answerStatus: string;
    reasonForRejection: string;
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

export type QuestionStatus = "open" | "in-review" | "closed" | "delayed";
export interface ResponseDto {
  id: string;
  answer: string;
  isFinalAnswer: boolean;
  createdAt: string;
}
export interface CurrentUserAnswer {
  _id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
  totalAnswersCount: number;
  responses: ResponseDto[];
}
export interface SubmissionResponse {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
  totalAnwersCount: number;
  reponse: ResponseDto | null;
  status: string;
  details: {
    state: string;
    district: string;
    crop: string;
    season: string;
    domain: string;
  };
}
export interface QuestionDetails {
  id: string;
  text: string;
  status: string;
  details: {
    state?: string;
    crop?: string;
    domain?: string;
  };
  priority?: string;
  source?: string;
  totalAnswersCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FinalizedAnswer {
  id: string;
  answer: string;
  isFinalAnswer: boolean;
  approvalCount: number;
  authorId: string | null;
  questionId: string | null;
  sources: SourceItem[];
  createdAt: string;
  updatedAt: string;
  question: QuestionDetails;
  details: {
    state: string;
    district: string;
    crop: string;
    season: string;
    domain: string;
  };
  status: string;
}
export interface HeatMapResult {
  reviewerId: string;
  reviewerName: string;
  counts: {
    [bucket: string]: number; // e.g., "0_6": 4
  };
}
export interface WorkLoad {
  currentUserAnswers: CurrentUserAnswer[];
  totalQuestionsCount: number;
  totalInreviewQuestionsCount: number;
}

export interface FinalizedAnswersResponse {
  finalizedSubmissions: FinalizedAnswer[];
  currentUserAnswers: CurrentUserAnswer[];
  totalQuestionsCount: number;
  heatMapResults: HeatMapResult[];
}

export interface SourceItem {
  source: string;
  page?: number;
}
export interface PreviousAnswersItem{
  modifiedBy:string 
  oldAnswer:string;
  newAnswer:string;
  modifiedAt?:Date
}
export interface IAnswer {
  _id?: string;
  questionId: string;
  authorId: string;
  answerIteration: number;
  isFinalAnswer: boolean;
  approvalCount: number;
  remarks: string;
  sources: SourceItem[];
  reviews?: IReview[];
  modifications?:PreviousAnswersItem[]
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
  status: "reviewed" | "in-review" | "approved" | "rejected";

  approvedAnswer: string;

  rejectedAnswer: string;
  reasonForRejection: string;

  modifiedAnswer: string;
  reasonForLastModification: string;
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
  requestedUser: IUser;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type INotificationType = "flag" | "answer_creation" | "peer_review";
export interface INotification {
  _id: string;
  userId: string;
  enitity_id: string;
  title: string;
  type: INotificationType;
  message: string;
  is_read: boolean;
  createdAt: string;
  updatedAt: string;
}
