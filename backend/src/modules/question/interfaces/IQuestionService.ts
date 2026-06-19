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
  /** AJRASAKHA/WHATSAPP questions with auto-allocation turned OFF (handled manually). */
  autoAllocateOff: {count: number; items: QueueQuestionItem[]};
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
  | 'allocated'
  | 'waiting'
  | 'freeExperts'
  | 'stuck'
  | 'needsReviewer'
  | 'totalWork'
  | 'openedIdle';

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
  }>;

  /** HIL Flow: Update state with human corrections */
  updateAccAgentState(
    threadId: string,
    correctedData: {
      query: string;
      crop: string;
      state: string;
      district: string;
      domain: string;
      season: string;
    }
  ): Promise<void>;

  /** HIL Flow: Resume and get final answer */
  resumeAccAgentAndGetAnswer(threadId: string, callUuid?: string, metadata?: QAMetadata): Promise<{ final_answer: string }>;
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
    approved_moderator: { name: string; email: string };
  }>;

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
    hiddenQuestions?: string;
    duplicateQuestions?: string;
    isOnHold?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<ArrayBuffer | null>;
  generateDuplicateQuestionReport(
    startDate?: Date,
    endDate?: Date,
  ): Promise<ArrayBuffer | null>;
  getMatchedQuestion(questionId, userId);

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
}
