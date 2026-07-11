import { ObjectId } from 'mongodb';

export type UserRole = 'admin' | 'moderator' | 'expert' | 'pae_expert' | 'tester' | 'district_coordinator' | 'block_coordinator' | 'village_volunteer' | 'call_agent';
export type QuestionStatus = 'open' | 'in-review' | 'closed' | 'delayed' | 're-routed' | 'hold' | 'pae_submitted' | 'draft' | 'pass' | 'duplicate' | 'non_agri' | 'pending' | 'dynamic_closed' | 'dynamic';
export type Tags = 'dynamic' | 'static_dynamic'
export interface IPreference {
  state: string;
  crop: string;
  domain: string | string[];
}
export type NotificationRetentionType = '3d' | '1w' | '2w' | '1m' | 'never';
export type UserStatus = 'active' | 'in-active';

/** One editable content block on the public dashboard (freeform CMS). */
export interface IDashboardBlock {
  /** Stable client-generated id (used for reorder/remove). */
  id: string;
  heading: string;
  /** Plain-text body (paragraphs preserved on newlines). */
  body: string;
  /** Optional highlighted figures shown with the block, e.g. { label: 'Questions', value: '18.6M' }. */
  figures: { label: string; value: string }[];
  order: number;
}

/** Singleton document holding the public dashboard's admin-editable content. */
export interface IDashboardContent {
  _id?: string | ObjectId;
  /** Fixed singleton key — always 'public_dashboard'. */
  key: string;
  blocks: IDashboardBlock[];
  updatedAt?: Date;
  updatedBy?: string | null;
}

/** One question currently held by a moderator. The status is denormalised from the
 *  question document so the cron can decide free/busy without a join. It is kept in
 *  sync whenever the question's status changes (see QuestionRepository) and the whole
 *  entry is pulled when the moderator acts on the question. `source` is the question's
 *  origin, stored for future use (not currently surfaced in the UI). */
export interface IAssignedQuestion {
  questionId: ObjectId | string;
  status: QuestionStatus;
  source?: QuestionSource;
}
export interface IUser {
  _id?: string | ObjectId;
  firebaseUID: string;
  email: string;
  firstName: string;
  lastName?: string;
  preference?: IPreference | null;
  reputation_score?: number;
  notifications?: number;
  role: UserRole;
  notificationRetention?: NotificationRetentionType;
  incentive?: number;
  penalty?: number;
  isBlocked?: boolean;
  lastCheckInAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  status?: UserStatus;
  special_task_force?: boolean;
  special_task_force_moderator?: boolean;
  avatar?: string;
  mobile?: string;
  university?: string;
  isVerified?: boolean;
  isCallAgentActive?: boolean;
  Call_centre_manager?: boolean;
  agent?: string; // "not_available" or "agent_1", "agent_2", etc.
  isBusy?: boolean; // true if agent is currently in a call
  currentCallUuid?: string | null; // UUID of the current call being handled
  /** Questions currently assigned to this moderator for review, each stored with its
   *  denormalised status ({ questionId, status }). The cron assigns one question to a
   *  free moderator; manual allocation appends to this array, so a moderator can hold
   *  multiple questions. An entry is pulled when the moderator acts on it (answers/closes)
   *  or when it is manually removed/reassigned. A moderator is "busy" only while holding
   *  at least one entry in a blocking status (in-review / duplicate); entries that are
   *  re-routed (handed to an expert) stay for history but do not block new work. */
  assignedQuestionIds?: IAssignedQuestion[] | null;
}

export interface IUserRoleHistory {
  _id?: string | ObjectId;
  userId: string | ObjectId;
  role: UserRole;
  from: Date;
  to?: Date | null;
  isVerified?: boolean;
  status?: UserStatus;
  isBlocked?: boolean;
  special_task_force?: boolean;
  special_task_force_moderator?: boolean;
}

export interface IUserHistory {
  roleHistory: IUserRoleHistory[];
  userDetails?: {
    name?: string;
    email: string;
    firstName: string;
    lastName?: string;
    role?: UserRole;
    status?: UserStatus;
    isBlocked?: boolean;
    special_task_force?: boolean;
  };
}

export type IQuestionPriority = 'low' | 'medium' | 'high' | 'critical';

export interface IQuestionMetrics {
  mean_similarity: number;
  std_similarity: number;
  recent_similarity: number;
  collusion_score: number;
}

export type QuestionSource =
  | 'AJRASAKHA'
  | 'AGRI_EXPERT'
  | 'WHATSAPP'
  | 'OUTREACH';

/** Time-bound questions (SLA-driven, handled by the time-bound reallocation cron). */
export const TIME_BOUND_SOURCES: QuestionSource[] = ['AJRASAKHA', 'WHATSAPP'];

/** Manual / non-time-bound questions (added by moderators or via outreach). */
export const MANUAL_SOURCES: QuestionSource[] = ['AGRI_EXPERT', 'OUTREACH'];
export interface IQuestion {
  _id?: string | ObjectId;
  userId?: ObjectId | string;
  question: string;
  contextId?: ObjectId | string | null;
  status: QuestionStatus;
  tag?: Tags;
  totalAnswersCount: number;
  priority: IQuestionPriority;
  details: {
    state: string;
    district: string;
    crop: string | ICropRef;
    season: string;
    domain: string[];
    normalised_crop?: string;
    tools_used?: string[];
  };
  isAutoAllocate: boolean;
  source: QuestionSource;
  embedding: number[];
  aiInitialAnswer?: string;
  aiApprovedSources?: SourceItem[];
  aiApprovedAnswer?: string;
  metrics: IQuestionMetrics | null;
  text?: string;
  closedAt?: Date;
  passedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  isClosed?: boolean;
  isHidden?: false;
  passingRemark?: string;
  isOnHold?: boolean;
  isTesting?: boolean;
  messageId?: string;
  threadId?: string;
  /** Wall-clock moment the current hold segment started (SLA timer freezes until unhold). */
  holdAt?: Date | null;
  /** Sum of prior completed hold durations (ms); extended SLA = createdAt + window + this. */
  accumulatedHoldMs?: number;
  originalQuestion?: string;
  authors_history?: IAuthorsHistory[];
  /** for duplicate quesitons */
  similarityScore?: number; // percentage (0–100)
  referenceQuestionId?: ObjectId;
  referenceQuestion?: string;
  referenceSource?: string;
  isExact?: boolean;
  saved_to_draft?: boolean;
  pae_review?: boolean;
  firstAllocationAt?: Date;
  /** Whether this question is eligible to be auto-allocated to a moderator by the
   *  moderator-queue cron. New questions default to true; existing questions were
   *  backfilled to false. When false the question is never assigned to a moderator. */
  autoAllocateModerator?: boolean;
  /** Moderator currently assigned to review this question.
   *  Set by the cron; cleared when the question is closed. */
  moderatorId?: ObjectId | string | null;
  /** Timestamp when a moderator was assigned. Used to calculate moderator handling time (closedAt - moderatorAssignedAt). */
  moderatorAssignedAt?: Date | null;
  referenceQuestionDetails?: Array<{
    _id: ObjectId | string;
    duplicate: boolean;
  }>;
  popContext?: string;
  isCustomerNotified?: boolean;
  isDuplicateChecked?: boolean;
  toolsUsed?: string[];
  passedBy?: ObjectId | string | null;
}

export type SourceType = 'hyper_local' | 'state' | 'central' | 'other';

export interface SourceItem {
  sourceType?: SourceType;
  sourceName?: string;
  source: string;
  page?: string | number;
}
export interface PreviousAnswersItem {
  modifiedBy: string | ObjectId;
  oldAnswer: string;
  newAnswer: string;
  modifiedAt?: Date;
}
export interface IAnswer {
  _id?: string | ObjectId;
  questionId: string | ObjectId;
  authorId: string | ObjectId;
  answerIteration: number;
  approvalCount: number;
  isFinalAnswer: boolean;
  remarks?: string;
  approvedBy?: string | ObjectId;
  status?: string;
  answer: string;
  reRouted?: boolean;
  modifications?: PreviousAnswersItem[];
  sources: SourceItem[];
  embedding: number[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IReviewParmeters {
  contextRelevance: boolean;
  technicalAccuracy: boolean;
  practicalUtility: boolean;
  valueInsight: boolean;
  credibilityTrust: boolean;
  readabilityCommunication: boolean;
}

export type ReviewType = 'question' | 'answer';
export type ReviewAction = 'accepted' | 'rejected' | 'modified';

export interface IReview {
  _id?: string | ObjectId;
  reviewType: ReviewType;
  action: ReviewAction;
  questionId: string | ObjectId;
  answerId?: string | ObjectId;
  reviewerId: string | ObjectId;
  reason?: string;
  parameters?: IReviewParmeters;
  createdAt?: Date;
  updatedAt?: Date;
  status?: string;
  reRoutedReview?: boolean;
}

export interface IPreviousAllocations {
  reviewerId: string | ObjectId;
  reasonForChange: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAuthorsHistory {
  authorId: string | ObjectId;
  newAuthorId: string | ObjectId;
  reasonForChange: string;
  createdAt: Date;
  updatedAt: Date;
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
  reviewId?: string | ObjectId;
  status: 'reviewed' | 'in-review' | 'approved' | 'rejected'; // approved status if  an answer got 3 approvals

  rejectedBy?: string | ObjectId;
  rejectedAnswer?: string | ObjectId;
  reasonForRejection?: string;

  lastModifiedBy?: string | ObjectId;
  modifiedAnswer?: string | ObjectId;
  reasonForLastModification?: string;

  approvedAnswer?: string | ObjectId;

  previousAllocations?: IPreviousAllocations[];

  createdAt: Date;
  updatedAt: Date;
}

export interface IQuestionSubmission {
  _id?: string | ObjectId;
  questionId: string | ObjectId;
  lastRespondedBy: string | ObjectId;
  history: ISubmissionHistory[];
  queue: (string | ObjectId)[];
  reviewDelayNotificationSent?: boolean;
  /** Timestamp when the current expert first opened/clicked this time-bound question.
   *  Set via POST /questions/:id/mark-opened. Cleared on each reallocation.
   *  When set → question is "active" → blocked from 45-min auto-reallocation. */
  currentExpertOpenedAt?: Date | null;
  /** Timestamp when the current expert was allocated to this question.
   *  Set on initial allocation and reset on every reallocation.
   *  Used to compute the 45-minute reallocation window for time-bound questions. */
  currentExpertAllocatedAt?: Date | null;
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
  | { requestType: 'question_flag'; details: IQuestion | null }
  | { requestType: 'others'; details: Record<string, any> | null };

export type IRequest = RequestDetails & {
  _id?: string | ObjectId;
  reason: string;
  requestedBy: string | ObjectId;
  entityId: string | ObjectId;
  responses: IRequestResponse[];
  status: RequestStatus;
  isDeleted?: boolean;
  deletedAt?: Date;
  deletedBy?: string | ObjectId;
  requestedUser?: IUser | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

export type INotificationType =
  | 'flag'
  | 'answer_creation'
  | 'peer_review'
  | 'comment'
  | 'flag_response'
  | 'review_rejected'
  | 'review_modified'
  | 're-routed'
  | 're-routed-rejected-expert'
  | 're-routed-rejected-moderator'
  | 're-routed-answer-created'
  | 'question_from_whatsapp'
  | 'question_from_ajrasakha'
  | 'expert_replacement'
  | 'user_verification'
  | 'delayed_question'
  | 'moderator_approval'
  | 'allocation_removal'
  | 'coordinator_message';
export interface INotification {
  _id?: string | ObjectId;
  userId: string | ObjectId;
  enitity_id?: string | ObjectId;
  title: string;
  type: INotificationType;
  // type: string;
  message: string;
  is_read: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface ISubscription {
  _id?: string | ObjectId;
  userId: string | ObjectId;
  expirytime?: Date | null;
  subscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
}
export interface IReviewerHeatmapRow {
  reviewerId: string;
  reviewerName: string;
  counts: Record<string, number>;
}

export interface IReviewerHeatmapResponse {
  data: IReviewerHeatmapRow[];
  total: number;
}

export type RerouteStatus =
  | 'pending'
  | 'expert_rejected'
  | 'expert_completed'
  | 'moderator_rejected'
  | 'moderator_approved'
  | 'approved'
  | 'rejected'
  | 'modified'
  | 'in-review';
export interface IRerouteHistory {
  reroutedBy: ObjectId | string; // Moderator
  reroutedTo: ObjectId | string; // Expert
  reroutedAt: Date | string;
  answerId?: ObjectId | string;
  status: RerouteStatus;
  moderatorRejectionReason?: string;
  rejectionReason?: string; // Only when expert rejects
  comment?: string; // Mandatory when moderator reroutes

  updatedAt: Date | string; // Updated on every status change
}
export interface IReroute {
  _id?: ObjectId | string;

  answerId: ObjectId | string; // Which answer is being rerouted
  questionId: ObjectId | string;

  reroutes: IRerouteHistory[]; // Timeline of reroutes

  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface LevelReportStat {
  month: string;
  data: {
    level: number; // history index (1–10)
    approvedCount: number;
    rejectedCount: number;
    modifiedCount: number;
    totalProcessed: number;
    approvedPercentage: number;
    rejectedPercentage: number;
    modifiedPercentage: number;
    avgTimeTakenMinutes: number; // average time in minutes
  }[];
}
export interface IQuestionEmbedding {
  _id: ObjectId;
  embedding: number[];
}
export interface ISimilarQuestion extends IQuestion {
  similarityScore: number; // percentage (0–100)
  referenceQuestionId: ObjectId;
  referenceQuestion: string;
  referenceSource: string;
  // matched original question
}
export interface AddQuestionResult {
  data: Partial<IQuestion>;
}

// ─── Chatbot Analytics ───────────────────────────────────────────────────────

export type ChatbotChannel = 'voice' | 'text' | 'kcc_agent' | 'ivrs';

export interface IChatbotSession {
  _id?: ObjectId | string;
  userId: ObjectId | string;
  channel: ChatbotChannel;
  language: string; // e.g. 'hindi' | 'telugu' | 'marathi' | 'bhojpuri'
  state: string; // e.g. 'UP' | 'MH'
  crop?: string;
  queryCategory: string; // e.g. 'pest_disease' | 'fertilizer_dosage'
  sessionDurationSec: number;
  csatScore?: number; // 1–5
  voiceAccuracyScore?: number; // 0–100, only for voice channel
  isRepeatQuery: boolean;
  createdAt: Date;
}
export interface ICropRef {
  name: string;
  aliases?: string[];
}

export interface ICropAlias {
  language: string; // BCP-47 code e.g. "te-IN"
  region: string; // e.g. "Andhra and Telangana"
  english_representation: string; // romanised / English representation e.g. "vari"
  native_representation: string; // native script e.g. "వరి"
}

export type CropType = 'crop' | 'chemical' | (string & {});

export interface ICrop {
  _id?: ObjectId | string;
  name: string;
  type?: CropType; // 'crop' (default) | 'chemical' | any custom string
  status?: string; // only relevant when type === 'chemical', any custom string
  aliases: (ICropAlias | string)[]; // string = legacy format; ICropAlias = new format
  crops?: string[]; // associated crops (only for type === 'chemical')
  createdBy?: ObjectId | string;
  updatedBy?: ObjectId | string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ChemicalStatus = 'Restricted' | 'Banned';

export interface IChemicalAuditHistory {
  createdBy: ObjectId;
  updatedAt: Date;
  changesMade?: {
    old_name?: string;
    old_status?: string;
  };
}

export interface IChemical {
  _id?: ObjectId | string;
  name: string;
  status: ChemicalStatus;
  aliases?: (ICropAlias | string)[]; // optional structured aliases
  createdBy?: ObjectId | string;
  createdAt?: Date;
  updatedAt?: Date;
  chemical_audit_history?: IChemicalAuditHistory[];
}
export interface ISource {
  source: string; // URL or document reference
  page?: string | number; // optional (some sources may not have page)
  title?: string; // optional (future-proof)
  type?: string; // optional (pdf, link, doc, etc.)
}

export interface IAuthor {
  id: string;
  name: string;
}

export interface ICheckStatusResponse {
  question_id: string;
  status: 'pending' | 'closed' | 'not_found';
  answer: string | null;
  sources: ISource[];
  author: IAuthor | null;
  metadata?: {
    state?: string;
    district?: string;
    crop?: string | ICropRef;
    season?: string;
    domain?: string;
  };
  message?: string | null;
}

export interface IcheckStatusResponseDto {
  success: boolean;
  data: ICheckStatusResponse;
}

export interface WhatsappUser {
  phoneNumber: string;
  messageCount: number;
  firstMessageAt: string;
  lastMessageAt: string;
  lastMessageText: string;
}

export interface WhatsappUsersResponse {
  data: WhatsappUser[];
  total: number;
  skip: number;
  limit: number;
  isPaginated: boolean;
}
