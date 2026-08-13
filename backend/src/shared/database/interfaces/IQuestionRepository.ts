import {
  QuestionLevelResponse,
  ReviewLevelTimeValue,
} from '#root/modules/question/classes/transformers/QuestionLevel.js';
import {
  Analytics,
  DashboardResponse,
  GoldenDatasetEntry,
  GoldenDataViewType,
  ModeratorApprovalRate,
   QuestionStateBreakdownBySource,
  QuestionStatusOverview,
} from '#root/modules/dashboard/validators/DashboardValidators.js';
import { AllocatedQuestionsBodyDto, DetailedQuestionsBodyDto, GetDetailedQuestionsQuery, QuestionResponse } from '#root/modules/question/classes/validators/QuestionVaidators.js';
import {
  IQuestion,
  IUser,
  QuestionStatus,
  QuestionSource,
  IQuestionEmbedding,
  ISimilarQuestion,
  ICheckStatusResponse
} from '#root/shared/interfaces/models.js';
import {ClientSession, ObjectId} from 'mongodb';
import {RawQueueQuestionRow} from '#root/modules/question/interfaces/IQuestionService.js';

/**
 * Interface representing a repository for question-related operations.
 */
export interface IQuestionRepository {
  /** One page (skip/limit) + exact total for a Queue-Details question section
   *  ('received' | 'allocated' | 'autoOff' | 'autoAllocateOpen' | 'autoAllocateDelayed').
   *  Status scope: open/delayed/duplicate. */
  getQueueQuestionSection(
    kind: 'received' | 'allocated' | 'autoOff' | 'autoAllocateOpen' | 'autoAllocateDelayed',
    skip: number,
    limit: number,
    startTime?: Date,
    endTime?: Date,
    sources?: string[],
    requirePaeReviewNotDone?: boolean,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
  ): Promise<{count: number; items: RawQueueQuestionRow[]}>;

  /** Per-status counts for the "Questions Received" section — used so tab badges
   *  show the true DB total rather than a page-slice count. */
  getReceivedStatusCounts(
    startTime?: Date,
    endTime?: Date,
    sources?: string[],
  ): Promise<{status: string; count: number}[]>;

  /**
   * Adds multiple questions for a specific context and user.
   * @param userId - The ID of the user creating the questions.
   * @param contextId - The ID of the context the questions belong to.
   * @param questions - An array of question strings.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to an object containing the number of inserted questions.
   */
  addQuestions(
    userId: string,
    contextId: string,
    questions: string[],
    session?: ClientSession,
  ): Promise<{insertedCount: number}>;
  /**
   * Add dummy question .
   * @param userId - The ID of the user creating the questions.
   * @param contextId - The ID of the context the questions belong to.
   * @param questions - An array of question strings.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to an object containing the number of inserted question.
   */
  addDummyQuestion(
    userId: string,
    contextId: string,
    questions: string,
    session?: ClientSession,
  ): Promise<IQuestion>;
  /**
   * Add  question .

   * @param question - new question payload.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to an object containing the number of inserted question.
   */
  addQuestion(
    questions: IQuestion,
    session?: ClientSession,
  ): Promise<IQuestion>;

  /**
   * Retrieves questions by their IDs.
   * @param ids - Array of question ObjectIds to fetch.
   * @returns A promise that resolves to an array of questions.
   */
  findByIds(ids: ObjectId[]): Promise<IQuestion[]>;

  /**
   * Retrieves all questions for a specific context.
   * @param contextId - The ID of the context.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to an array of questions.
   */
  getByContextId(
    contextId: string,
    session?: ClientSession,
  ): Promise<IQuestion[]>;

  normalizeQuestionState(
    currentValues: string[],
    standardizedTo: string,
    session?: ClientSession,
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

  /**
   * Retrieves all questions for a specific context.
   * @param questionId - The ID of the question.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to an array of questions.
   */
  getById(questionId: string, session?: ClientSession): Promise<IQuestion>;

  /** Find questions referencing the given question (referenceQuestionId), optionally
   *  by status. Used to propagate a close to queue-duplicate children. */
  findByReferenceQuestionId(
    referenceQuestionId: string,
    status?: QuestionStatus,
    session?: ClientSession,
  ): Promise<IQuestion[]>;

  /**
   * Retrieves all questions for a specific context.
   * @param questionId - The ID of the question.
   * @param userId - The ID of the user.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to an array of questions.
   */
  getQuestionWithFullData(
    questionId: string,
    userId: string,
    isExpert: boolean,
  ): Promise<any>;
  /**
   * Retrieves all questions for a specific context.
   * @param questionId - The ID of the question.
   * @param userId - The ID of the user.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to an array of questions.
   */
  bulkDeleteByIds(
    questionIds: string[],
    session?: ClientSession,
  ): Promise<{deletedCount: number}>;

  /**
   * Retrieves all questions that have not been answered yet.
   * @param userId- Author id to check submissions
   * @param page - Current page count.
   * @param limit - Total limit count.
   * @param filter - Filter options.
   * @param userPreference - preference options.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to an array of unanswered questions.
   */
  getAllocatedQuestions(
    userId: string,
    query: GetDetailedQuestionsQuery,
    session?: ClientSession,
    body?: AllocatedQuestionsBodyDto,
  ): Promise<QuestionResponse[]>;
  /**
   * @param query - Advance query filters.
   * @returns A promise that resolves to an array of detailed questions.
   */
  findDetailedQuestions(
    query: GetDetailedQuestionsQuery & {searchEmbedding: number[] | null},
    body?: DetailedQuestionsBodyDto,
  ): Promise<{questions: IQuestion[]; totalPages: number; totalCount: number}>;

  /**
   * Updates a specific question.
   * @param questionId - The ID of the question to update.
   * @param updates - Partial object containing the fields to update.
   * @param session - Optional MongoDB client session for transactions.
   * @param addText - To add text field without filtering it.
   * @returns A promise that resolves to an object containing the number of modified documents.
   */
  findClosedQuestionsWithoutModerator(limit: number): Promise<string[]>;
  bulkSetModeratorId(
    pairs: { questionId: string; moderatorId: string }[],
  ): Promise<number>;
  updateQuestion(
    questionId: string,
    updates: Partial<IQuestion>,
    session?: ClientSession,
    addText?: boolean,
  ): Promise<{modifiedCount: number}>;
  /**
   * Updates a specific question.
   * @param questionId - The ID of the question to update.
   * @param threadId - The ID of the thread to update.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to an object containing IQuestion.
   */
  updateThreadId(questionId: string, threadId: string, session?: ClientSession): Promise<{modifiedCount: number}>;
  /**
   * Updates a specific question.
   * @param questionId - The ID of the question to update.
   * @param isAutoAllocate - Boolean to set auto allocate or not.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to an object containing IQuestion.
   */
  updateAutoAllocate(
    questionId: string,
    isAutoAllocate: boolean,
    session?: ClientSession,
  ): Promise<IQuestion | null>;

  /**
   * Updates a specific question.
   * @param questionId - The ID of the question to update.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to an object containing the number of deletedCount documents.
   */
  deleteQuestion(
    questionId: string,
    session?: ClientSession,
  ): Promise<{deletedCount: number}>;

  /**
   * Updates a specific question.
   * @param text - question text.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to question document
   */
  getQuestionByQuestionText(
    text: string,
    session?: ClientSession,
  ): Promise<IQuestion>;

  /**
   * Updates a  question to delyed after 4hrs if still open.
   */
  updateExpiredAfterFourHours(): Promise<void>;

  insertMany(questions: IQuestion[]): Promise<string[]>;

  updateQuestionStatus(
    id: string,
    status: string,
    errorMessage?: string,
    session?: ClientSession,
  ): Promise<void>;

  // findById(id: string, session?: ClientSession): Promise<IQuestion | null>
  getAllocatedQuestionPage(
    userId: string,
    questionId: string,
    session?: ClientSession,
  ): Promise<number>;

  /**
   * Updates a specific question.
   * @param status - question status.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to question document
   */
  getQuestionsByStatus(
    status: QuestionStatus,
    session?: ClientSession,
  ): Promise<IQuestion[]>;

  getClosedQuestionsCount(
    isTrainingUser?: boolean,
    isAdmin?: boolean,
    session?: ClientSession,
  ): Promise<number>;
  /**
   * get yearly analytics.
   * @param goldenDataSelectedYear - selected year.
   * @param customStartTime - optional start time filter (HH:mm format)
   * @param customEndTime - optional end time filter (HH:mm format)
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to question document
   */
  getYearAnalytics(
    goldenDataSelectedYear: string,
    customStartTime?: string,
    customEndTime?: string,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
    session?: ClientSession,
 ): Promise<{yearData: GoldenDatasetEntry[]; totalEntriesByType: number; totalVerifiedByType: number; moderatorBreakdown?: { moderatorName: string, count: number, moderatorHours?: number, auditorHours?: number, gateKeeperHours?: number }[]; questionSourceBreakdown?: { whatsapp: number; ajrasakha: number }; questionsAnsweredWithin120Min?: { whatsapp: number; ajrasakha: number }; averageResponseTime?: { whatsapp: number; ajrasakha: number }; questionsAnsweredAfter120Min?: { whatsapp: number; ajrasakha: number }; questionStateBreakdown?: QuestionStateBreakdownBySource;paeMetrics?: { assigned: number; submitted: number; closed: number } }>;


  /**
  * get yearly analytics.
  * @param session -MongoDB client session for transactions.
  * @returns A promise that resolves to question document
  */
  getTodayApproved(isTrainingUser?: boolean, isAdmin?: boolean, session?:ClientSession):Promise<{todayApproved: number, moderatorBreakdown?: { moderatorName: string, count: number, moderatorHours?: number, auditorHours?: number, gateKeeperHours?: number}[]}>;

  /**
   * get monthly analytics.
   * @param goldenDataSelectedYear - selected year.
   * @param goldenDataSelectedMonth - selected month
   * @param customStartTime - optional start time filter (HH:mm format)
   * @param customEndTime - optional end time filter (HH:mm format)
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to question document
   */
  getMonthAnalytics(
    goldenDataSelectedYear: string,
    goldenDataSelectedMonth: string,
    customStartTime?: string,
    customEndTime?: string,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
    session?: ClientSession,
  ): Promise<{weeksData: GoldenDatasetEntry[]; totalEntriesByType: number; totalVerifiedByType: number; moderatorBreakdown?: { moderatorName: string, count: number, moderatorHours?: number, auditorHours?: number, gateKeeperHours?: number }[]; questionSourceBreakdown?: { whatsapp: number; ajrasakha: number }; questionsAnsweredWithin120Min?: { whatsapp: number; ajrasakha: number }; averageResponseTime?: { whatsapp: number; ajrasakha: number }; questionsAnsweredAfter120Min?: { whatsapp: number; ajrasakha: number }; questionStateBreakdown?: QuestionStateBreakdownBySource;paeMetrics?: { assigned: number; submitted: number; closed: number } }>;


  /**
   * get weekly analytics.
   * @param goldenDataSelectedYear - selected year.
   * @param goldenDataSelectedMonth - selected month
   * @param goldenDataSelectedWeek - selected week
   * @param customStartTime - optional start time filter (HH:mm format)
   * @param customEndTime - optional end time filter (HH:mm format)
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to question document
   */
  getWeekAnalytics(
    goldenDataSelectedYear: string,
    goldenDataSelectedMonth: string,
    goldenDataSelectedWeek: string,
    customStartTime?: string,
    customEndTime?: string,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
    session?: ClientSession,
  ): Promise<{dailyData: GoldenDatasetEntry[]; totalEntriesByType: number; totalVerifiedByType: number; moderatorBreakdown?: { moderatorName: string, count: number, moderatorHours?: number, auditorHours?: number, gateKeeperHours?: number }[]; questionSourceBreakdown?: { whatsapp: number; ajrasakha: number }; questionsAnsweredWithin120Min?: { whatsapp: number; ajrasakha: number }; averageResponseTime?: { whatsapp: number; ajrasakha: number }; questionsAnsweredAfter120Min?: { whatsapp: number; ajrasakha: number }; questionStateBreakdown?: QuestionStateBreakdownBySource;paeMetrics?: { assigned: number; submitted: number; closed: number } }>;


  /**
   * get daily analytics.
   * @param goldenDataSelectedYear - selected year.
   * @param goldenDataSelectedMonth - selected month
   * @param goldenDataSelectedWeek - selected week
   * @param goldenDataSelectedDay - selected day
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to question document
   */
  getDailyAnalytics(
    goldenDataSelectedYear: string,
    goldenDataSelectedMonth: string,
    goldenDataSelectedWeek: string,
    goldenDataSelectedDay: string,
    customStartTime?: string,
    customEndTime?: string,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
    session?: ClientSession,
  ): Promise<{
    dayHourlyData: Record<string, GoldenDatasetEntry[]>;
    totalEntriesByType: number;
    totalVerifiedByType: number;
    moderatorBreakdown?: { moderatorName: string, count: number, moderatorHours?: number, auditorHours?: number, gateKeeperHours?: number }[];
    questionSourceBreakdown?: { whatsapp: number; ajrasakha: number };
    questionsAnsweredWithin120Min?: { whatsapp: number; ajrasakha: number };
    averageResponseTime?: { whatsapp: number; ajrasakha: number };
    questionsAnsweredAfter120Min?: { whatsapp: number; ajrasakha: number }; 
    questionStateBreakdown?: QuestionStateBreakdownBySource;
    paeMetrics?: { assigned: number; submitted: number; closed: number }

  }>;

  /**
   * get custom date range analytics.
   * @param customStartDateTime - Start date and time in ISO format.
   * @param customEndDateTime - End date and time in ISO format.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to custom range analytics data
   */
  getCustomRangeAnalytics(
    customStartDateTime: string,
    customEndDateTime: string,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
    session?: ClientSession,
  ): Promise<{
    customData: GoldenDatasetEntry[];
    totalEntriesByType: number;
    totalVerifiedByType: number;
    moderatorBreakdown?: { moderatorName: string, count: number, moderatorHours?: number, auditorHours?: number, gateKeeperHours?: number }[];
    questionSourceBreakdown?: { whatsapp: number; ajrasakha: number };
    questionsAnsweredWithin120Min?: { whatsapp: number; ajrasakha: number };
    averageResponseTime?: { whatsapp: number; ajrasakha: number };
    questionsAnsweredAfter120Min?: { whatsapp: number; ajrasakha: number }; 
  }>;

  /**
   * get daily analytics.
   * @param timeRange - timeRange.
   * @param session - Optional MongoDB client session for transactions.
   */
  getCountBySource(
    timeRange: string,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
    session?: ClientSession,
  ): Promise<DashboardResponse['questionContributionTrend']>;

  /**
   * get count of questoins on each status.
   * @param session - Optional MongoDB client session for transactions.
   */
  getQuestionOverviewByStatus(
    isTrainingUser?: boolean,
    isAdmin?: boolean,
    session?: ClientSession,
  ): Promise<QuestionStatusOverview[]>;

  /**
   * @param startTime: string,
   * @param endTime - string.
   * @param session - Optional MongoDB client session for transactions.
   */
  getQuestionAnalytics(
    startTime?: string,
    endTime?: string,
    session?: ClientSession,
    status?: string[],
    state?: string[],
    source?: string[],
    crop?: string[],
    isTrainingUser?: boolean,
    isAdmin?: boolean,
  ): Promise<{analytics: Analytics}>;

  /**
   * @param currentUserId - requested userId
   * @param session
   */

  getModeratorApprovalRate(
    currentUserId: string,
    session?: ClientSession,
    isTrainingUser?: boolean,
    isAdmin?: boolean
  ): Promise<ModeratorApprovalRate>;
  getAll(session?: ClientSession): Promise<IQuestion[]>;

  getByStatus(
    status: IQuestion['status'],
    session?: ClientSession,
  ): Promise<IQuestion[]>;

  getQuestionsAndReviewLevel(
    query: GetDetailedQuestionsQuery & {searchEmbedding: number[] | null},
    session?: ClientSession,
  ): Promise<QuestionLevelResponse>;

  findByDateRangeAndSource(
    startDate: Date,
    endDate: Date,
    sources: 'AJRASAKHA',
  ): Promise<IQuestion[]>
  getMonthlyQuestionStats(
    startDate?: Date,
    endDate?: Date,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
    session?: ClientSession,
  ): Promise<Array<{
    year: number;
    month: string;
    totalQuestions: number;
    modifiedAnswers: number;
    rejectedAnswers: number;
  }>>;

  getQuestionsByFilters(
    filters: any,
    session?: ClientSession,
    useDuplicateCollection?: boolean,
    limit?: number,
  ): Promise<IQuestion[]>;

  getAllQuestionEmbeddings(
    session?: ClientSession,
  ): Promise<IQuestionEmbedding[]>;
  findTopSimilarQuestions(
    embedding: number[],
    k?: number,
    filter?: { state?: string; district?: string; crop?: string; domain?: string; season?: string },
    session?: ClientSession,
  ): Promise<(ISimilarQuestion & { _vectorSearchScore: number })[]>

  //  Backfill normalised crop
  backfillNormalisedCrop(
    name: string,
    aliases: string[],
  ): Promise<number>;

  getQuestionsWithAnswerDetails(
    questionIds?:string[],
    session?: ClientSession,
  ):Promise<ICheckStatusResponse[]>

  /**
   * Returns total question count and count grouped by status.
   * @param session - Optional MongoDB client session for transactions.
   */
  getQuestionStatusSummary(
    query: GetDetailedQuestionsQuery,
    body: DetailedQuestionsBodyDto,
    session?: ClientSession,
  ): Promise<{ totalQuestions: number; statuses: { status: string; count: number }[]; sourceCounts: { source: string; count: number }[] }>

  /**
   * Get PAE (Principal Agri Experts) metrics totals across all sources.
   * @param session - Optional MongoDB client session for transactions.
   * @param startDate - Optional start date filter
   * @param endDate - Optional end date filter
   * @param customStartTime - optional start time filter (HH:mm format)
   * @param customEndTime - optional end time filter (HH:mm format)
   * @returns PAE metrics totals
   */
  getPAEMetrics(
    session?: ClientSession,
    startDate?: Date,
    endDate?: Date,
    customStartTime?: string,
    customEndTime?: string,
  ): Promise<{
    assigned: number;
    submitted: number;
    closed: number;
  }>;

  getQuestionsWithEmptyEmbeddings(
    limit?: number,
  ): Promise<{ _id: ObjectId; question: string; text?: string }[]>;

  updateQuestionEmbedding(questionId: string, embedding: number[]): Promise<void>;
  getShiftBasedMetrics(
    startDate:string,
    // endDate:string,
    shift: string,
    source: string,
    from: string,
    to: string,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
    session?: ClientSession
  ): Promise<any>;

  getShiftBasedTrends(
    startDate:string,
    // endDate:string,
    shift: string,
    source: string,
    from: string,
    to: string,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
    session?: ClientSession
  ): Promise<any>;

  getQuestionStatusDistribution(
    startDate: string,
    // endDate: string,
    shift: string,
    source: string,
    from: string,
    to: string,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
    session?: ClientSession,
  ): Promise<any>;

  getQuestionLevelDistribution(
    startDate: string,
    // endDate: string,
    shift: string,
    source: string,
    from: string,
    to: string,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
    session?: ClientSession
  ): Promise<any>

  getShiftBasedTopExperts(
    startDate: string,
    // endDate: string,
    shift: string,
    source: string,
    from: string,
    to: string,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
    session?: ClientSession
  ): Promise<any> 

  getShiftBasedTopApprovingExperts(
    startDate: string,
    // endDate: string,
    shift: string,
    source: string,
    from: string,
    to: string,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
    session?: ClientSession
  ): Promise<any>

  findUnassignedInReviewQuestions(sources?: QuestionSource[], isTrainingUser?: boolean, isAdmin?: boolean): Promise<IQuestion[]>
  findModeratorAssignedQuestions(sources?: QuestionSource[], isTrainingUser?: boolean, isAdmin?: boolean): Promise<IQuestion[]>
  findQuestionsWithOpenFeedbacks(
    requireAutoAllocate?: boolean,
  ): Promise<IQuestion[]>;
  updateModeratorId(questionId: string, moderatorId: string | null): Promise<void>

  /** Gate-keeper / auditor role allocation helpers. */
  findUnassignedQuestionsForRole(
    statuses: QuestionStatus[],
    assigneeField: 'gateKeeperId' | 'auditorId',
    autoAllocateField: 'autoAllocateGateKeeper' | 'autoAllocateAuditor',
  ): Promise<IQuestion[]>;
  findQuestionsAssignedToRole(
    assigneeField: 'gateKeeperId' | 'auditorId',
    statuses: QuestionStatus[],
  ): Promise<IQuestion[]>;
  getRoleAssigneeDashboard(
    userId: string,
    assigneeField: 'gateKeeperId' | 'auditorId',
    finishedField: 'gateKeeperFinishedAt' | 'auditorFinishedAt',
    assignedAtField: 'gateKeeperAssignedAt' | 'auditorAssignedAt',
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
  setRoleAssignee(
    questionId: string,
    assigneeField: 'gateKeeperId' | 'auditorId',
    assignedAtField: 'gateKeeperAssignedAt' | 'auditorAssignedAt',
    assigneeId: string | null,
    session?: ClientSession,
  ): Promise<void>;
  markRoleFinished(
    questionId: string,
    finishedAtField: 'gateKeeperFinishedAt' | 'auditorFinishedAt',
    finishedAt: Date,
    session?: ClientSession,
  ): Promise<void>;

  addOrUpdateFeedbackStatus(
    questionId: string,
    source: "DATASET" | "WEB_APPLICATION" | "PAE_Validation",
  ): Promise<number>;

  /** Find all questions with paeValidation status of 'pending' that are ready for
   *  PAE expert validation. Questions are sorted by createdAt in ascending order
   *  (oldest first).
   *  @param session Optional MongoDB client session for transactions
   *  @returns Promise resolving to array of questions pending PAE validation */
  findQuestionsPendingPaeValidation(session?: ClientSession): Promise<IQuestion[]>;

  /** Update the paeValidation status on a question.
   *  @param questionId The question ID to update
   *  @param paeValidation The new paeValidation status ('pending' | 'in-progress' | 'completed')
   *  @param session Optional MongoDB client session for transactions */
  updatePaeValidationStatus(
    questionId: string,
    paeValidation: 'pending' | 'in-progress' | 'completed',
    session?: ClientSession,
  ): Promise<{ modifiedCount: number }>;

  /** Update the paeValidation array in the question's submission document.
   *  @param questionId The question ID to update
   *  @param paeValidationEntry The new PAE validation entry to push
   *  @param session Optional MongoDB client session for transactions */
  addPaeValidationEntry(
    questionId: string,
    paeValidationEntry: {
      paeAssignedAt: Date;
      paeId: string | ObjectId;
      paeStatus: 'in-progress' | 'completed';
      paeFinishedAt?: Date | null;
    },
    session?: ClientSession,
  ): Promise<void>;

  /** Find questions by their IDs with pagination and join final answers in a single aggregation.
   *  Uses $lookup to join with the answers collection and get final answers with sources.
   *  @param ids - Array of question ObjectIds to fetch
   *  @param page - Page number (1-indexed)
   *  @param limit - Number of items per page
   *  @param session - Optional MongoDB client session for transactions
   *  @returns Promise resolving to paginated questions with answers joined
   */
  findByIdsWithAnswers(
    ids: ObjectId[],
    page: number,
    limit: number,
    session?: ClientSession,
  ): Promise<{
    questions: Array<{
      _id: ObjectId;
      question: string;
      status: QuestionStatus;
      source: QuestionSource;
      priority?: string;
      totalAnswersCount?: number;
      createdAt: Date;
      state?: string;
      district?: string;
      crop?: string;
      domain?: string;
      season?: string;
      normalised_crop?: string;
      answer?: {
        _id: ObjectId;
        answer: string;
        sources: Array<{
          source: string;
          sourceType?: string;
          sourceName?: string;
          page?: string | number;
        }>;
        authorId: ObjectId;
        isFinalAnswer: boolean;
      };
    }>;
    totalCount: number;
    totalPages: number;
    currentPage: number;
  }>;

  /**
   * Adds a feedback entry to the question's feedbacks array.
   * @param questionId The question ID to update
   * @param feedbackEntry The feedback entry to add
   * @param session Optional MongoDB client session for transactions
   */
  addFeedback(
    questionId: string,
    feedbackEntry: {
      source: string;
      status: string;
      recentFeedback?: Date;
    },
    session?: ClientSession,
  ): Promise<{ modifiedCount: number }>;

  findQuestionsWithOpenPaeValidation(
    requireAutoAllocate?: boolean,
  ): Promise<IQuestion[]>;
}
