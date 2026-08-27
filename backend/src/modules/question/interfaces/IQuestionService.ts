// #root/modules/question/interfaces/IQuestionService.ts

import {
  IQuestion,
  IQuestionSubmission,
  AddQuestionResult,
} from '#root/shared/interfaces/models.js';
import {
  AddQuestionBodyDto,
  AllocatedQuestionsBodyDto,
  DetailedQuestionsBodyDto,
  GeneratedQuestionResponse,
  GetDetailedQuestionsQuery,
  QuestionResponse,
} from '../classes/validators/QuestionVaidators.js';
import { QuestionLevelResponse } from '#root/modules/question/classes/transformers/QuestionLevel.js';
import { ClientSession, ObjectId } from 'mongodb';
import type { QAMetadata } from '#root/shared/database/interfaces/ICallDetailsRepository.js';
import type {
  PaeValidationAnswer,
  PaeValidationQuestion,
  PaeValidationSource,
  PaeValidationAssignedQuestionsResponse,
} from './QuestionValidationTypes.js';

/** Feedback data structure */
export interface FeedbackData {
  _id: { $oid: string };
  questionId: { $oid: string };
  userId: { name: string; email: string };
  answerId: { $oid: string };
  type: 'thumbs_up' | 'thumbs_down' | 'PAE_VALIDATION';
  predefinedOption: string;
  comment: string;
  status: 'open' | 'rejected' | 'accepted';
  reviewNote?: string;
  link?:{name: string; source: string};
  createdAt: { $date: string };
  updatedAt: { $date: string };
}

/** Paginated feedback response */
export interface FeedbackResponse {
  data: FeedbackData[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** A waiting feedback question paired with its eligible (active, free) approver
 *  moderator — "available moderators to get respective feedback". */
export type RespectiveFeedbackItem = QueueQuestionItem & {
  approverId: string;
  approverName: string;
};

/** Data for the dedicated Feedback tab. Every section is {count, items} so the UI
 *  can render counts and lists consistently (mirrors QueueDetailsResponse). */
export interface FeedbackQueueDetails {
  /** Open-feedback questions, auto-allocation ON, no reviewer assigned yet. */
  waitingAuto: { count: number; items: QueueQuestionItem[] };
  /** Open-feedback questions, auto-allocation OFF (handled manually), unassigned. */
  waitingManual: { count: number; items: QueueQuestionItem[] };
  /** Open-feedback questions already assigned to a reviewer. */
  assigned: { count: number; items: QueueQuestionItem[] };
  /** Moderators free to take a feedback review. */
  availableModerators: { count: number; items: QueueExpertItem[] };
  /** Waiting feedback questions whose approver moderator is active AND free. */
  respectiveModerators: { count: number; items: RespectiveFeedbackItem[] };
  /** Auditors free to take a feedback review. */
  availableAuditors: { count: number; items: QueueExpertItem[] };
  /** Open-feedback questions whose final-answer approver is an active moderator
   *  (would be assigned to that moderator). */
  questionsWithActiveModerator: { count: number; items: QueueQuestionItem[] };
  /** Open-feedback questions whose approver is NOT an active moderator
   *  (inactive/blocked/non-moderator → would go to an auditor). */
  questionsWithoutActiveModerator: { count: number; items: QueueQuestionItem[] };
}

/** Data for the dedicated Pae Validation tab. Every section is {count, items} so the UI
 *  can render counts and lists consistently (mirrors QueueDetailsResponse). */
export interface PaeValidationQueueDetails {
  /** Open-pae-validation questions, auto-allocation ON, no reviewer assigned yet. */
  waitingAuto: { count: number; items: QueueQuestionItem[]; page?: number; totalPages?: number };
  /** Open-pae-validation questions, auto-allocation OFF (handled manually), unassigned. */
  waitingManual: { count: number; items: QueueQuestionItem[]; page?: number; totalPages?: number };
  /** Open-pae-validation questions already assigned to a reviewer. */
  assigned: { count: number; items: QueueQuestionItem[]; page?: number; totalPages?: number };
  /** pae experts free to take a feedback review. */
  availablePaeExperts: { count: number; items: QueueExpertItem[] };
}

/** Pagination params for PAE queue endpoint */
export interface PaeValidationQueueParams {
  section?: 'waitingAuto' | 'waitingManual' | 'assigned';
  page?: number;
  limit?: number;
}

/** Lean question shape used in the moderator/admin "Queue Details" modal. */
export interface QueueQuestionItem {
  _id: string;
  question: string;
  status: string;
  source: string;
  isTrainingQuestion?: boolean;
  isTrainingUser?: boolean;
  priority?: string;
  createdAt?: string | Date;
  state?: string;
  district?: string;
  crop?: string;
  /** Current assignee — present for allocated & stuck items. */
  expertName?: string;
  /** Assigned moderator's name — present for moderator-allocated items. */
  moderatorName?: string;
  /** Assigned gate keeper / auditor name — present for role-allocated items. */
  assigneeName?: string;
  /** All experts who have completed a step on this question, in turn order —
   *  present for needs-reviewer items. */
  completedExpertNames?: string[];
  /** Full queue for the question, each entry as "Name (Level)" where level is
   *  Author (position 0) then Reviewer 1, Reviewer 2, … Present for any section
   *  whose questions have an allocation queue. For the allocated section the
   *  level suffix is omitted (plain names) — see `lastPersonStatus`. */
  queueExpertNames?: string[];
  /** Status of the current/last expert in the queue — 'completed' when every
   *  queue member has finished, otherwise 'waiting'. Present for allocated items. */
  lastPersonStatus?: 'completed' | 'waiting';
  /** When the current expert was allocated — present for stuck items. */
  allocatedAt?: string | Date | null;
  /** Minutes since the current expert was allocated — present for stuck items. */
  minutesSinceAllocated?: number;
  /** When the current expert opened the question — present for opened-but-idle items. */
  openedAt?: string | Date | null;
  /** Minutes since the current expert opened it — present for opened-but-idle items. */
  minutesSinceOpened?: number;
  /** Which time-bound work bucket this question falls in — present for totalWork items. */
  workType?: 'stuck' | 'unallocated' | 'needsReviewer';
}

/** Lean expert shape for the "Experts waiting in queue" (free experts) list. */
export interface QueueExpertItem {
  _id: string;
  name: string;
  email?: string;
  reputationScore?: number;
  role?: string;
  isSpecialTaskForce?: boolean;
  isTrainingUser?: boolean;
}

export interface QueueDetailsResponse {
  /** All time-bound (AJRASAKHA/WHATSAPP, auto-allocated) questions ever received. */
  received: {count: number; items: QueueQuestionItem[]};
  /** Per-status counts for the received section — accurate DB totals used for tab badges. */
  receivedStatusCounts: {status: string; count: number}[];
  /** AJRASAKHA/WHATSAPP questions with auto-allocation turned OFF (handled manually). */
  autoAllocateOff: {count: number; items: QueueQuestionItem[]};
  /** Auto-allocate ON questions that are currently OPEN. */
  autoAllocateOpen: {count: number; items: QueueQuestionItem[]};
  /** Auto-allocate ON questions that are currently DELAYED. */
  autoAllocateDelayed: {count: number; items: QueueQuestionItem[]};
  /** Received questions that have been allocated to at least one expert. */
  allocated: {count: number; items: QueueQuestionItem[]};
  /** Received questions still awaiting their first expert allocation. */
  waiting: {count: number; items: QueueQuestionItem[]};
  /** Experts with no active time-bound allocation (free / waiting in queue). */
  freeExperts: {count: number; items: QueueExpertItem[]};
  /** Allocated > 45 min but never opened by the assigned expert. */
  stuck: {count: number; items: QueueQuestionItem[]};
  /** Answered/reviewed but still awaiting the next reviewer (cron "NeedReviewer"). */
  needsReviewer: {count: number; items: QueueQuestionItem[]};
  /** Everything the time-bound cron tries to act on this run — stuck + unallocated +
   *  needsReviewer combined (the cron's "totalWork"). */
  totalWork: {count: number; items: QueueQuestionItem[]};
  /** Opened by the current expert > 45 min ago but still no answer produced. */
  openedIdle: {count: number; items: QueueQuestionItem[]};
  /** In-review/duplicate questions with no moderator yet — the pool the
   *  moderator-queue cron picks from (findUnassignedInReviewQuestions). */
  moderatorWaiting: {count: number; items: QueueQuestionItem[]};
  /** Questions currently assigned to a moderator (moderatorId set), including
   *  re-routed questions. Each item carries the assigned moderator's name. */
  moderatorAllocated: {count: number; items: QueueQuestionItem[]};
  /** STF moderators with no question assigned — the pool the moderator-queue
   *  cron assigns from (findAvailableStfModerators). */
  availableModerators: {count: number; items: QueueExpertItem[]};

  // ── Source-split moderator-queue sections ──
  /** Time-bound (AJRASAKHA/WHATSAPP) questions with no moderator yet. */
  moderatorWaitingTimeBound: {count: number; items: QueueQuestionItem[]};
  /** Manual (AGRI_EXPERT/OUTREACH) questions with no moderator yet. */
  moderatorWaitingManual: {count: number; items: QueueQuestionItem[]};
  /** Time-bound questions currently assigned to a moderator. */
  moderatorAllocatedTimeBound: {count: number; items: QueueQuestionItem[]};
  /** Manual questions currently assigned to a moderator. */
  moderatorAllocatedManual: {count: number; items: QueueQuestionItem[]};
  /** STF moderators free to take a time-bound question. */
  availableModeratorsTimeBound: {count: number; items: QueueExpertItem[]};
  /** STF moderators free to take a manual question. */
  availableModeratorsManual: {count: number; items: QueueExpertItem[]};

  // ── Gate keeper / auditor role queues ──
  /** dynamic/duplicate/queue_duplicate questions with no gate keeper yet. */
  gateKeeperWaiting: {count: number; items: QueueQuestionItem[]};
  /** Questions currently assigned to a gate keeper. */
  gateKeeperAllocated: {count: number; items: QueueQuestionItem[]};
  /** Gate keepers free to take a question. */
  availableGateKeepers: {count: number; items: QueueExpertItem[]};
  /** auditor_review questions with no auditor yet. */
  auditorWaiting: {count: number; items: QueueQuestionItem[]};
  /** Questions currently assigned to an auditor. */
  auditorAllocated: {count: number; items: QueueQuestionItem[]};
  /** Auditors free to take a question. */
  availableAuditors: {count: number; items: QueueExpertItem[]};
  // ── Feedback-review queue (mirrors the gate-keeper / auditor role queue) ──
  /** Questions with an open feedback that has not been assigned to a reviewer yet. */
  feedbackWaiting: {count: number; items: QueueQuestionItem[]};
  /** Questions with an open feedback-review round assigned to a reviewer. */
  feedbackAllocated: {count: number; items: QueueQuestionItem[]};
  /** Moderators/auditors free to take a feedback review. */
  availableFeedbackReviewers: {count: number; items: QueueExpertItem[]};
  // ── Manual (AGRI_EXPERT/OUTREACH) expert-queue sections — mirror the time-bound
  //    expert sections above, scoped to the manual single-allocation queue. ──
  receivedManual: {count: number; items: QueueQuestionItem[]};
  receivedStatusCountsManual: {status: string; count: number}[];
  autoAllocateOffManual: {count: number; items: QueueQuestionItem[]};
  autoAllocateOpenManual: {count: number; items: QueueQuestionItem[]};
  autoAllocateDelayedManual: {count: number; items: QueueQuestionItem[]};
  allocatedManual: {count: number; items: QueueQuestionItem[]};
  waitingManual: {count: number; items: QueueQuestionItem[]};
  freeExpertsManual: {count: number; items: QueueExpertItem[]};
  stuckManual: {count: number; items: QueueQuestionItem[]};
  needsReviewerManual: {count: number; items: QueueQuestionItem[]};
  openedIdleManual: {count: number; items: QueueQuestionItem[]};
}

/** Raw lean row returned by the repository layer for queue-details questions. */
export interface RawQueueQuestionRow {
  _id: ObjectId | string;
  question?: string;
  status?: string;
  source?: string;
  isTrainingQuestion?: boolean;
  priority?: string;
  createdAt?: string | Date;
  state?: string;
  district?: string;
  crop?: unknown;
  firstAllocationAt?: string | Date | null;
  queue?: (ObjectId | string)[];
  history?: {updatedBy?: ObjectId | string; status?: string}[];
}

export interface QueueQuestionData {
  receivedCount: number;
  allocatedCount: number;
  autoOffCount: number;
  receivedItems: RawQueueQuestionRow[];
  allocatedItems: RawQueueQuestionRow[];
  autoOffItems: RawQueueQuestionRow[];
}

/** The paginatable Queue-Details sections. */
export type QueueSectionName =
  | 'received'
  | 'autoAllocateOff'
  | 'autoAllocateOpen'
  | 'autoAllocateDelayed'
  | 'allocated'
  | 'waiting'
  | 'freeExperts'
  | 'stuck'
  | 'needsReviewer'
  | 'totalWork'
  | 'openedIdle'
  | 'moderatorWaiting'
  | 'moderatorAllocated'
  | 'availableModerators'
  // Source-split variants (time-bound = AJRASAKHA/WHATSAPP, manual = AGRI_EXPERT/OUTREACH)
  | 'moderatorWaitingTimeBound'
  | 'moderatorWaitingManual'
  | 'moderatorAllocatedTimeBound'
  | 'moderatorAllocatedManual'
  | 'availableModeratorsTimeBound'
  | 'availableModeratorsManual'
  // Gate keeper / auditor role queues (mirror the moderator queue sections)
  | 'gateKeeperWaiting'
  | 'gateKeeperAllocated'
  | 'availableGateKeepers'
  | 'auditorWaiting'
  | 'auditorAllocated'
  | 'availableAuditors'
  // Feedback-review queue (mirror the gate-keeper / auditor role queue)
  | 'feedbackWaiting'
  | 'feedbackAllocated'
  | 'availableFeedbackReviewers'
  // Manual (AGRI_EXPERT/OUTREACH) expert-queue variants — same shape as the
  // time-bound expert sections above, scoped to the manual single-allocation queue.
  | 'receivedManual'
  | 'autoAllocateOffManual'
  | 'autoAllocateOpenManual'
  | 'autoAllocateDelayedManual'
  | 'allocatedManual'
  | 'waitingManual'
  | 'freeExpertsManual'
  | 'stuckManual'
  | 'needsReviewerManual'
  | 'openedIdleManual';

/** One page of a section: exact total + the requested page's items. */
export interface QueueSectionResult {
  count: number;
  items: QueueQuestionItem[] | QueueExpertItem[];
}

export interface IQuestionService {
  /** Bulk insert questions (CSV / upload / AI generated) */
  createBulkQuestions(
    userId: string,
    questions: any[],
    isOutreachQuestion?: boolean,
  ): Promise<string[]>;

  /** Add dummy questions linked to a context */
  addDummyQuestions(
    userId: string,
    contextId: string,
    questions: string[],
    session?: any,
  ): Promise<IQuestion[]>;

  /** Get questions under a context */
  getByContextId(contextId: string): Promise<IQuestion[]>;
  normalizeQuestionState(
    currentValues: string[],
    standardizedTo: string,
  ): Promise<{ matched: number; modified: number }>;
  normalizeQuestionDistricts(
    mappings: { existingName: string; standardiseTo: string }[],
  ): Promise<{
    results: {
      existingName: string;
      standardiseTo: string;
      matchedInDistricts: boolean;
      matched: number;
      modified: number;
    }[];
    notMatching: { existingName: string; standardiseTo: string }[];
  }>;
  findUnknownQuestionGeo(): Promise<{
    unknownStates: string[];
    matchedDistricts: {
      name: string;
      foundIn: 'block' | 'village';
      districtCode: number | null;
      stateCode: number | null;
      districtNameEnglish: string | null;
    }[];
    notMatchingDistricts: string[];
  }>;

  /** Questions allocated to an expert */
  getAllocatedQuestions(
    userId: string,
    query: GetDetailedQuestionsQuery,
    body: AllocatedQuestionsBodyDto,
  ): Promise<QuestionResponse[]>;

  /** Paginated + searchable question list */
  getDetailedQuestions(
    query: GetDetailedQuestionsQuery,
    body: DetailedQuestionsBodyDto,
  ): Promise<{
    questions: IQuestion[];
    totalPages: number;
    feedbackQuestions?: IQuestion[];
  }>;

  /** Generate questions from raw context (AI) */
  getQuestionFromRawContext(
    context: string,
  ): Promise<GeneratedQuestionResponse[]>;

  /** Generate questions from call context (AI) */
  getQuestionFromCallContext(
    context: string,
    state?: string,
    crop?: string,
  ): Promise<GeneratedQuestionResponse[]>;

  getCallSummary(
    query: string,
  ): Promise<any>;

  /** HIL Flow: Create thread for ACC Agent */
  createAccAgentThread(): Promise<{ thread_id: string }>;

  /** HIL Flow: Extract data from transcript */
  extractAccAgentData(
    threadId: string,
    transcript: string
  ): Promise<{
    extracted_query: string;
    extracted_crop: string;
    extracted_state: string;
    extracted_district: string;
    extracted_domain?: string | string[];
    extracted_name?: string;
    extracted_phone?: string;
    extracted_age?: number;
    extracted_gender?: string;
    extracted_village?: string;
    extracted_block?: string;
    extracted_primary_crop?: string;
  }>;

  /** HIL Flow: Update state with human corrections */
  updateAccAgentState(
    threadId: string,
    correctedData: {
      query: string;
      crop: string;
      state: string;
      district: string;
      domain: string | string[];
      season: string;
      farmerName?: string;
      farmerPhone?: string;
      farmerAge?: number;
      farmerGender?: string;
      farmerVillage?: string;
      farmerBlock?: string;
      farmerPrimaryCrop?: string;
    }
  ): Promise<void>;

  /** HIL Flow: Resume and get final answer */
  resumeAccAgentAndGetAnswer(threadId: string, callUuid?: string, metadata?: QAMetadata): Promise<{ final_answer: string }>;
  /** HIL Flow: Get ACC Agent thread state */
  getAccAgentState(threadId: string, callUuid?: string, metadata?: QAMetadata): Promise<any>;
  /** Manually trigger duplicate check for a question without a reference */
  manualCheckDuplicate(
    questionId: string,
  ): Promise<{ message: string; isDuplicate: boolean; referenceQuestionId?: string }>;

  /** Create a new question */
  addQuestion(
    userId: string,
    body: AddQuestionBodyDto,
  ): Promise<AddQuestionResult>;

  /** Question detail page */
  getQuestionById(questionId: string): Promise<QuestionResponse>;

  /** Get only question text by ID */
  getQuestionDataById(questionId: string): Promise<IQuestion | null>;

  /** Update question fields */
  updateQuestion(
    questionId: string,
    updates: Partial<IQuestion>,
    threadUpdate?: boolean
  ): Promise<{ modifiedCount: number }>;

  /** Auto allocate experts */
  autoAllocateExperts(
    questionId: string,
    session?: any,
    batchSize?: number,
  ): Promise<{ data?: ObjectId[]; status: boolean }>;

  /** Toggle auto allocation on/off */
  toggleAutoAllocate(
    questionId: string,
  ): Promise<{ message: string; data?: ObjectId[] }>;

  /** Manually allocate experts */
  allocateExperts(
    userId: string,
    questionId: string,
    experts: string[],
  ): Promise<IQuestionSubmission>;

  /** Bulk allocate a PAE expert to multiple draft questions via background worker */
  bulkAllocatePaeExperts(
    userId: string,
    questionIds: string[],
    paeExpertId: string,
  ): Promise<{ jobId: string; message: string }>;

  /** Remove expert from allocation queue */
  removeExpertFromQueue(
    userId: string,
    questionId: string,
    index: number,
  ): Promise<IQuestionSubmission>;

  /** Replace expert at specific level in queue or the author */
  replaceQueueExpert(
    userId: string,
    questionId: string,
    levelIndex: number,
    newExpertId: string,
    isAuthor?: boolean,
    reasonForChange?: string,
  ): Promise<IQuestionSubmission>;

  /** Delete a question (cascade delete) */
  deleteQuestion(
    questionId: string,
    session?: any,
  ): Promise<{ deletedCount: number }>;

  /** Bulk delete (no limit, background worker) */
  bulkDeleteQuestions(
    userId: string,
    questionIds: string[],
  ): Promise<{ jobId: string; message: string }>;

  /** Fetch question with answers, history & permissions */
  getQuestionFullData(
    questionId: string,
    userId: string,
  ): Promise<{
    question: IQuestion | null;
    approved_moderator: {name: string; email: string};
    assigned_moderator: {name: string; email: string} | null;
    assigned_gate_keeper: {name: string; email: string} | null;
    assigned_auditor: {name: string; email: string} | null;
    isAssignedModerator: boolean;
    isAssignedGateKeeper: boolean;
    isAssignedAuditor: boolean;
  }>;

  /** Manually (re)assign the moderator for a question. */
  changeQuestionModerator(questionId: string, moderatorId: string): Promise<void>;

  /** Remove the moderator currently assigned to a question (frees the moderator and nulls the question's moderator fields). */
  removeQuestionModerator(questionId: string): Promise<void>;

  /** Manually (re)assign the gate keeper / auditor for a question. */
  getRoleAssigneeDashboard(
    userId: string,
    role: 'gate_keeper' | 'auditor',
    page: number,
    limit: number,
    search?: string,
    startDate?: Date,
    endDate?: Date,
    dateFilterType?: 'assigned' | 'completed' | 'both',
  ): Promise<{
    assignedCount: number;
    submittedCount: number;
    questions: any[];
    totalPages: number;
    totalCount: number;
  }>;
  changeQuestionRoleAssignee(
    questionId: string,
    role: 'gate_keeper' | 'auditor',
    userId: string,
    actorName?: string,
  ): Promise<void>;

  /** Remove the gate keeper / auditor currently assigned to a question. */
  removeQuestionRoleAssignee(
    questionId: string,
    role: 'gate_keeper' | 'auditor',
    actorName?: string,
  ): Promise<void>;

  /** Get expert’s allocated question page */
  getAllocatedQuestionPage(userId: string, questionId: string): Promise<any>;

  /** Get table data with review levels */
  getQuestionAndReviewLevel(
    query: GetDetailedQuestionsQuery,
  ): Promise<QuestionLevelResponse>;

  cleanupQuestionSubmissions(
    absentExpertIds: string[],
    session: ClientSession,
  ): Promise<void>;

  balanceWorkload(
    session?: ClientSession,
    type?: string,
  ): Promise<{
    message: string;
    expertsInvolved: number;
    submissionsProcessed: number;
  }>;
  runAbsentScript();

  // getQuestionsByDateRange(
  //   startDate: string,
  //   endDate: string,
  // ):Promise<IQuestion[]>

  sendOutReachQuestionsMail(
    startDate: string,
    endDate: string,
    emails: string | string[],
  ): Promise<{ success: boolean; message: string }>;
  generateQuestionReport(
    consecutiveApprovals?: number,
    startDate?: Date,
    endDate?: Date,
    isTrainingUser?: boolean,
    isAdmin?: boolean
  ): Promise<ArrayBuffer | null>;
  generateOverallQuestionReport(
    startDate?: Date,
    endDate?: Date,
    isTrainingUser?: boolean,
    isAdmin?: boolean
  ): Promise<ArrayBuffer | null>;
  generateTatReport(
    startDate: Date,
    endDate: Date,
    opts?: {
      sources?: string[];
      statuses?: string[];
      maxReviewers?: number;
    }
  ): Promise<ArrayBuffer | null>;
  generateStateCropQuestionReport(filters: {
    state?: string;
    crop?: string;
    normalised_crop?: string;
    season?: string;
    domain?: string;
    status?: string;
    source?: string;
    hiddenQuestions?: string;
    duplicateQuestions?: string;
    isOnHold?: string;
    startDate?: string;
    endDate?: string;
    allUsers?: string;
  }): Promise<ArrayBuffer | null>;
  generateDuplicateQuestionReport(
    startDate?: Date,
    endDate?: Date,
    isTrainingUser?: boolean,
    isAdmin?: boolean
  ): Promise<ArrayBuffer | null>;
  getMatchedQuestion(questionId, userId);
  getQuestionFeedback(questionId: string): Promise<any>;

  checkStatus(questionIds);

  holdQuestion(
    questionId: string,
    userId: string,
    action: 'hold' | 'unhold',
  ): Promise<{ id: string }>;
  checkSubmissionExists(questionId: string): Promise<boolean>;

  /** Returns total question count and per-status breakdown with filters applied */
  getQuestionStatusSummary(
    query: GetDetailedQuestionsQuery,
    body: DetailedQuestionsBodyDto,
  ): Promise<{
    totalQuestions: number;
    statuses: { status: string; count: number }[];
    sourceCounts: { source: string; count: number }[];
  }>;

  getExprtIdByIndex(questionId: string, index: number): Promise<string | null>;
  generateAiInitialAnswer(
    questionId: string,
  ): Promise<{ aiInitialAnswer: string }>;

  approveAiInitialAnswer(questionId: string, answer: string);

  getReallocationPreview(type: string): Promise<any>;
  manualReallocate(
    assignments: { submissionId: string; expertId: string }[],
    inactiveExpertIds?: string[],
  ): Promise<{ message: string; submissionsProcessed: number }>;

  balanceWorkloadSelectedQuestions(questionIds: string[]): Promise<{ message: string; expertsInvolved: number; submissionsProcessed: number }>;

  /** Mark that the current expert opened a time-bound question.
   *  Prevents the 45-min auto-reallocation for this question. */
  markQuestionOpened(questionId: string, userId: string): Promise<void>;

  /** Find time-bound questions pending > 45 min (not opened) and reallocate them
   *  to experts with fewer than 3 active time-bound questions. */
  reallocateTimeBoundQuestions(): Promise<{ message: string; reallocated: number; skipped: number }>;
  reallocateManualQuestions(): Promise<{ message: string; reallocated: number; skipped: number }>;
  allocateFeedbackQuestions(): Promise<{ message: string; allocated: number; skipped: number }>;

  /** Moderator/admin "Queue Details": counts + lean lists for received, allocated,
   *  waiting-for-expert, free experts, and stuck (allocated >45min, never opened). */
  getQueueDetails(startTime?: Date, endTime?: Date, isTrainingUser?: boolean, isAdmin?: boolean): Promise<QueueDetailsResponse>;

  /** One server-side paginated section (exact total + requested page of items). */
  getQueueSection(
    section: QueueSectionName,
    page?: number,
    limit?: number,
    startTime?: Date,
    endTime?: Date,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
  ): Promise<QueueSectionResult>;

  /**
   * @param submissionId - The submission document ID
   */
  backgroundProcessAction(userId: string): Promise<{ modifiedCount: number }>;

  /** Admin utility: remove a submission history entry (by 0-based index) for a question. */
  removeSubmissionHistoryEntry(
    questionId: string,
    index: number,
  ): Promise<{ success: boolean; historyLength: number }>;

  /** Admin data-fix: remove a single expert from a question's submission queue by index. */
  removeSubmissionQueueEntry(
    questionId: string,
    index: number,
  ): Promise<{ success: boolean; queueLength: number }>;

  /** Admin utility: append an expert to a question's submission queue. */
  addSubmissionQueueEntry(
    questionId: string,
    expertId: string,
  ): Promise<{ success: boolean; queueLength: number }>;

  /** Admin utility: append a history entry to a question's submission history. */
  addSubmissionHistoryEntry(
    questionId: string,
    rawEntry: Record<string, any>,
  ): Promise<{ success: boolean; historyLength: number }>;

  /** Handle feedback action (accept/reject) and notify data release service */
  getFeedbackTimeline(questionId: string): Promise<{
    autoAllocateFeedback: boolean;
    hasOpenFeedback: boolean;
    reviews: {
      index: number;
      reviewerId: string;
      reviewerName: string;
      assignedAt: Date;
      finishedAt: Date | null;
      completedCount: number;
    }[];
  }>;
  getAssignableFeedbackReviewers(): Promise<
    {_id: string; name: string; email: string; role: string}[]
  >;
  assignFeedbackReviewerManually(
    questionId: string,
    userId: string,
    index?: number,
  ): Promise<{success: true}>;
  removeFeedbackReviewer(
    questionId: string,
    index: number,
  ): Promise<{success: true}>;
  handleFeedbackAction(
    questionId: string,
    feedbackId: string,
    action: 'accept' | 'reject',
    reason: string,
    processedBy: string,
    source: 'DATASET' | 'WEB_APPLICATION' | 'PAE_Validation', 
  ): Promise<{
    success: boolean;
    message: string;
    data?: {
      feedbackId: string;
      action: string;
      reason: string;
      processedBy: string;
      processedAt: string;
    };
  }>;
  

  /** Get feedbacks for a question (paginated) */
  getFeedbacks(
    questionId: string,
    page?: number,
    pageSize?: number,
  ): Promise<FeedbackResponse>;

  backfillClosedModeratorIds(limit?: number): Promise<{
    matched: number;
    updated: number;
    skippedNoFinalAnswer: number;
    skippedNoApprover: number;
  }>;

  getClosedAnswerMismatch(startTime?: Date, endTime?: Date): Promise<{
    window: { start: Date; end: Date };
    totalClosed: number;
    matched: number;
    mismatched: number;
    items: any[];
  }>;

  setNormalizedDomains(
    entries: { 'Question ID'?: string; 'Standardized Domain'?: string }[],
  ): Promise<{ total: number; matched: number; modified: number; notMatched: number; invalid: number }>;

  getFeedbackQueueDetails(): Promise<FeedbackQueueDetails>;

  handleFeedbackStatusUpdate(
    questionId: string,
    source: "DATASET" | "WEB_APPLICATION" | "PAE_Validation",
  ): Promise<{
    success: boolean;
  }>;

  /** PAE Validation Queue Cron - runs every minute to assign questions pending PAE validation
   *  to available PAE experts based on domain and state preferences.
   *  @returns Promise resolving to object with assigned count and available waiting count */
  runPaeValidationQueueCron(): Promise<{
    assigned: number;
    availableWaiting: number;
    failedAssignments: number;
  }>;

  getPaeValidationTimeline(questionId: string): Promise<{
    autoAllocatePaeValidationExpert: boolean;
    hasOpenRound: boolean;
    reviews: {
      index: number;
      paeId: string;
      paeName: string;
      paeAssignedAt: Date;
      paeFinishedAt: Date | null;
      paeStatus: string;
    }[];
  }>;

  assignPaeValidationReviewerManually(
    questionId: string,
    userId: string,
    index?: number,
  ): Promise<{success: true}>;
  
  removePaeValidationReviewer(
    questionId: string,
    index: number,
  ): Promise<{success: true}>;
  /** Get all questions assigned to a PAE expert for validation, with pagination.
   *  Includes answer data and sources from the answer collection.
   *  @param paeExpertId The PAE expert's user ID
   *  @param page Page number (1-indexed)
   *  @param limit Number of items per page
   *  @returns Promise resolving to paginated questions with answers and sources */
  getPaeValidationAssignedQuestions(
    paeExpertId: string,
    page: number,
    limit: number,
  ): Promise<PaeValidationAssignedQuestionsResponse>;

  /**
   * Process a PAE validation decision (approve or provide feedback).
   * 
   * When status is 'approve':
   * - Updates question.paeValidation to 'completed'
   * - Removes the question from the user's paeValidationAssigned array
   * - Updates the question submission's paeValidation array entry to 'completed' with paeFinishedAt
   * 
   * When status is 'feedback':
   * - Creates a new feedback entry in the feedbacks collection
   * - Updates the question's feedbacks array with source 'PAE_Validation' and status 'open'
   * - The question remains in the user's paeValidationAssigned for further work
   * 
   * @param paeExpertId The PAE expert's user ID (from current user)
   * @param questionId The question ID to process
   * @param status The validation decision ('approve' or 'feedback')
   * @param suggestionComment Optional comment explaining feedback
   * @param suggestionLink Optional reference link URL
   * @param answerId Optional answer ID associated with the feedback
   * @param suggestionSourceName Optional name of the source for the suggestion link
   */
  processPaeValidation(
    paeExpertId: string,
    questionId: string,
    status: 'approve' | 'feedback',
    suggestionComment?: string,
    suggestionLink?: string,
    answerId?: string,
    suggestionSourceName?: string,
  ): Promise<{ success: boolean; message: string }>;


  ensureNormalisedCrop(
    questionId: string,
    session?: ClientSession,
  ): Promise<string | null>;

  ensureNormalisedLocation(
    questionId: string,
    session?: ClientSession,
  ): Promise<{valid: true}>;

  freeRoleAssigneeOnStatusChange(
    questionId: string,
    newStatus?: string,
    session?: ClientSession,
  ): Promise<void>;
  getPaeValidationQueueDetails(params?: PaeValidationQueueParams): Promise<PaeValidationQueueDetails>;
}
