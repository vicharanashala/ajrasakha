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

/** Lean question shape used in the moderator/admin "Queue Details" modal. */
export interface QueueQuestionItem {
  _id: string;
  question: string;
  status: string;
  source: string;
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
  ): Promise<ArrayBuffer | null>;
  generateOverallQuestionReport(
    startDate?: Date,
    endDate?: Date,
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
    moderator?: string;
  }): Promise<ArrayBuffer | null>;
  generateDuplicateQuestionReport(
    startDate?: Date,
    endDate?: Date,
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

  /** Moderator/admin "Queue Details": counts + lean lists for received, allocated,
   *  waiting-for-expert, free experts, and stuck (allocated >45min, never opened). */
  getQueueDetails(startTime?: Date, endTime?: Date): Promise<QueueDetailsResponse>;

  /** One server-side paginated section (exact total + requested page of items). */
  getQueueSection(
    section: QueueSectionName,
    page?: number,
    limit?: number,
    startTime?: Date,
    endTime?: Date,
  ): Promise<QueueSectionResult>;

  /**
   * @param submissionId - The submission document ID
   */
  backgroundProcessAction(submissionId: string): Promise<{ modifiedCount: number }>;
}
