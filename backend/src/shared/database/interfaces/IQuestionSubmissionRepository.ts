import {GetHeatMapQuery} from '#root/modules/dashboard/validators/DashboardValidators.js';
import {
  IQuestionSubmission,
  IReviewerHeatmapResponse,
  ISubmissionHistory,
  LevelReportStat,
  QuestionSource,
} from '#root/shared/interfaces/models.js';
import {ClientSession, ObjectId} from 'mongodb';
import {ExpertReviewLevelDto} from '#root/modules/user/validators/UserValidators.js';
import {IReviewWiseStats} from '#root/utils/getDailyStats.js';
import {HistoryItem} from '#root/modules/question/classes/validators/QuestionVaidators.js';

export interface IQuestionSubmissionRepository {
  /**
   * Insert a new question submission
   * @param submission IQuestionSubmission object
   * @param session Optional MongoDB session for transaction
   */
  addSubmission(
    submission: IQuestionSubmission,
    session?: ClientSession,
  ): Promise<IQuestionSubmission>;
  /**
   * update submission
   * @param questionId
   * @param userSubmissionData
   * @param session Optional MongoDB session for transaction
   */
  update(
    questionId: string,
    userSubmissionData: ISubmissionHistory,
    session?: ClientSession,
    reviewDelayNotificationSent?: boolean
  ): Promise<void>;

  /**
   * update submission history
   * @param questionId
   * @param userId
   * @param updatedDoc
   * @param session Optional MongoDB session for transaction
   */
  updateHistoryByUserId(
    questionId: string,
    userId: string,
    updatedDoc: Partial<ISubmissionHistory>,
    session?: ClientSession,
  ): Promise<void>;

  /**
   * update submission history
   * @param questionId
   * @param session Optional MongoDB session for transaction
   */
  getDetailedSubmissionHistory(
    questionId: string,
    session?: ClientSession,
  ): Promise<HistoryItem[]>;

  /**
   * allocateExperts (push expertIds to queue)
   * @param questionId
   * @param expertIds
   * @param session Optional MongoDB session for transaction
   */
  allocateExperts(
    questionId: string,
    expertIds: ObjectId[],
    session?: ClientSession,
  ): Promise<IQuestionSubmission>;

  /**
   * allocateExperts (push expertIds to queue)
   * @param questionId
   * @param index
   * @param session Optional MongoDB session for transaction
   */
  removeExpertFromQueuebyIndex(
    questionId: string,
    index: number,
    session?: ClientSession,
  ): Promise<IQuestionSubmission | null>;

  /** Admin utility: remove a single submission history entry by its 0-based index. */
  removeHistoryEntryByIndex(
    questionId: string,
    index: number,
    session?: ClientSession,
  ): Promise<IQuestionSubmission | null>;

  /** Admin data-fix: remove a single expert from a submission's queue by its 0-based index. */
  removeQueueEntryByIndex(
    questionId: string,
    index: number,
    session?: ClientSession,
  ): Promise<IQuestionSubmission | null>;

  /** Admin utility: append an expert to a submission's queue. */
  addQueueEntry(
    questionId: string,
    expertId: string,
    session?: ClientSession,
  ): Promise<IQuestionSubmission | null>;

  /** Admin utility: append a pre-built history entry to a submission's history. */
  addHistoryEntry(
    questionId: string,
    entry: ISubmissionHistory,
    session?: ClientSession,
  ): Promise<IQuestionSubmission | null>;

  /**
   * allocateExperts (push expertIds to queue)
   * @param questionId
   * @param queue
   * @param session Optional MongoDB session for transaction
   */
  updateQueue(
    questionId: string,
    queue: ObjectId[],
    session?: ClientSession,
  ): Promise<IQuestionSubmission | null>;

  /**
   * allocateExperts (push expertIds to queue)
   * @param questionId
   * @param expertIds
   * @param session Optional MongoDB session for transaction
   */
  getByQuestionId(
    questionId: string,
    session?: ClientSession,
  ): Promise<IQuestionSubmission | null>;

  /**
   * Find all submissions where the given expert appears in the queue.
   * @param expertId - Expert user id
   * @param session - Optional MongoDB session for transaction
   */
  findByQueuedExpertId(
    expertId: string,
    session?: ClientSession,
  ): Promise<IQuestionSubmission[]>;

  /**
   * to get count of what level review level passed
   */
  getReviewWiseCount(): Promise<IReviewWiseStats>;

  /**
   * @param questionId
   * @param session Optional MongoDB session for transaction
   */

  deleteByQuestionId(
    questionId: string,
    session?: ClientSession,
  ): Promise<void>;

  heatMapResultsForReviewer(
    query: GetHeatMapQuery,
    isTrainingUser?: boolean,
    isAdmin?: boolean
  ): Promise<IReviewerHeatmapResponse | null>;

  /**
   * @param userId - Userid of the expeet
   * @param session Optional MongoDB session for transaction
   */
  getUserActivityHistory(
    userId: string,
    page: number,
    limit: number,
    dateRange?: {from: string; to: string},
    session?: ClientSession,
    selectedHistoryId?: string | undefined,
  );
  getUserReviewLevel(query: ExpertReviewLevelDto, isTrainingUser?: boolean, isAdmin?: boolean ): Promise<any>;
  getModeratorReviewLevel(query: ExpertReviewLevelDto,isTrainingUser?: boolean, isAdmin?: boolean): Promise<any>;

  getAbsentSubmissions(
    absentExpertIds: string[],
    session?: ClientSession,
  ): Promise<IQuestionSubmission[]>;
  findQuestionsNeedingEscalation(
    limit?: number,
    session?: ClientSession,
  ): Promise<IQuestionSubmission[]>;
  updateById(id?: string, update?: any, session?: any);
  assignFeedbackReviewer(
    questionId: string,
    reviewerId: string,
    assignedAt: Date,
    session?: ClientSession,
  ): Promise<boolean>;
  finishOpenFeedbackReviews(
    questionId: string,
    finishedAt: Date,
    session?: ClientSession,
  ): Promise<number>;
  findOpenFeedbackReviews(): Promise<
    {questionId: string; reviewerId: string; assignedAt: Date}[]
  >;
  reassignOpenFeedbackReviewer(
    questionId: string,
    reviewerId: string,
    assignedAt: Date,
    session?: ClientSession,
  ): Promise<boolean>;
  reassignFeedbackReviewerByIndex(
    questionId: string,
    index: number,
    reviewerId: string,
    assignedAt: Date,
    session?: ClientSession,
  ): Promise<boolean>;
  removeFeedbackReviewByIndex(
    questionId: string,
    index: number,
    session?: ClientSession,
  ): Promise<boolean>;
  addClosedFeedbackToOpenRound(
    questionId: string,
    feedbackId: string,
    closedAt: Date,
    session?: ClientSession,
  ): Promise<boolean>;
  getLevelWiseReport(
    startDate: string,
    endDate: string,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
    session?: ClientSession,
  ): Promise<LevelReportStat[]>;

  /**
   * @param questionId - Question ID of the question
   * @param update - Update parameters for the submission state
   * @param session -   Optional MongoDB session for transaction
   */
  updateSubmissionState(
    questionId: string,
    update: {
      queue?: ObjectId[];
      popHistory?: boolean;
      expertIdToRemove?: string;
    },
    session?: ClientSession,
  ): Promise<void>;
  findSubmissionsByActiveReviewers(
    expertIds: string[],
    session?: ClientSession,
  ): Promise<IQuestionSubmission[]>;

  findSubmissionsWithExpertsInQueue(
    expertIds: string[],
    session?: ClientSession,
    limit?: number,
  ): Promise<IQuestionSubmission[]>;

  findReallocationQuestionsByIds(
    questionIds: string[],
    session?: ClientSession,
  ): Promise<IQuestionSubmission[]>;

  getDelayedReviews(session?: ClientSession): Promise<{ _id: ObjectId; questionId: ObjectId; userId: ObjectId }[]>;
  markDelayedNotificationsSent(notifiedSubmissionIds: ObjectId[], session?: ClientSession): Promise<void>;

  /** Mark that the current expert has opened a time-bound question.
   *  Sets currentExpertOpenedAt if not already set and expertId is the current assignee.
   *  Once set, the question is excluded from 45-min auto-reallocation. */
  markQuestionOpenedByExpert(questionId: string, expertId: string, isTimeBound?: boolean): Promise<void>;

  /** Reset the 45-min allocation clock for the current expert.
   *  Called on initial allocation and on every reallocation. Clears currentExpertOpenedAt. */
  setCurrentExpertAllocatedAt(questionId: string, allocatedAt: Date, session?: ClientSession): Promise<void>;

  /** Clear currentExpertAllocatedAt + currentExpertOpenedAt after expert submits their response. */
  clearCurrentExpertTracking(questionId: string, session?: ClientSession): Promise<void>;

  /** Find all time-bound (WHATSAPP/AJRASAKHA) submissions where:
   *  - currentExpertAllocatedAt > 45 min ago
   *  - currentExpertOpenedAt is null (expert has NOT opened the question)
   *  - question is not on hold, not closed/pass/duplicate/draft */
  findTimeBoundQuestionsForReallocation(
    sources?: QuestionSource[],
    requirePaeReviewNotDone?: boolean,
    isTrainingUser?: boolean,
    isAdmin?: boolean
  ): Promise<IQuestionSubmission[]>;

  /** Find all single-allocation submissions that were never allocated — queue is
   *  empty and currentExpertAllocatedAt is null/missing. Defaults to time-bound
   *  sources; pass MANUAL_SOURCES + requirePaeReviewNotDone for manual questions. */
  findUnallocatedTimeBoundQuestions(
    sources?: QuestionSource[],
    requirePaeReviewNotDone?: boolean,
    isTrainingUser?: boolean,
    isAdmin?: boolean
  ): Promise<IQuestionSubmission[]>;

  /** Find time-bound submissions the current expert opened > 45 min ago but still
   *  hasn't answered (latest history entry has no answer/approved/modified/rejected).
   *  Distinct from stuck (allocated but never opened). */
  findOpenedButIdleTimeBoundQuestions(
    sources?: QuestionSource[],
  ): Promise<IQuestionSubmission[]>;

  /** Find submissions where the initial answer was submitted (last history entry
   *  has an answer) but status is still open/delayed — needs a reviewer. */
  findAnsweredQuestionsNeedingReviewer(
    sources?: QuestionSource[],
    requirePaeReviewNotDone?: boolean,
    isTrainingUser?: boolean,
    isAdmin?: boolean
  ): Promise<IQuestionSubmission[]>;

  /** Atomically push reviewer into queue, add an in-review history entry, and
   *  reset the 45-min allocation clock (currentExpertAllocatedAt/OpenedAt). */
  assignTimeBoundReviewer(questionId: string, reviewerId: string, now: Date, session?: ClientSession): Promise<void>;

  /** Single aggregation: returns a Map<expertId, count> of active time-bound
   *  questions per expert. Used to enforce the 3-question hard cap. */
 // getTimeBoundActiveCountPerExpert(): Promise<Map<string, number>>;

  /**
   * Remove the second entry from history and queue arrays in a question submission.
   * This is used for migration purposes to fix duplicate entries.
   * @param submissionId - The submission document ID
   */
  backgroundProcessAction(submissionId: string): Promise<{ modifiedCount: number }>;
  /** Single aggregation: returns a Map<expertId, count> of active single-allocation
   *  questions per expert (defaults to time-bound sources). Used to enforce the cap. */
  getTimeBoundActiveCountPerExpert(sources?: QuestionSource[]): Promise<Map<string, number>>;

   assignPaeValidationReviewer(
    questionId: string,
    reviewerId: string,
    assignedAt: Date,
    session?: ClientSession,
  ): Promise<boolean>;
  
  removePaeValidationReviewByIndex(
    questionId: string,
    index: number,
    session?: ClientSession,
  ): Promise<boolean>;
  /**
   * Update the PAE validation status in the question submission's paeValidation array.
   * Finds the entry matching the given paeId and updates its paeStatus and paeFinishedAt.
   * @param questionId - The question ID
   * @param paeId - The PAE expert's user ID to match in the array
   * @param paeStatus - The new status ('in-progress' | 'completed')
   * @param paeFinishedAt - The completion timestamp (null for in-progress)
   * @param session - Optional MongoDB client session for transactions
   */
  updatePaeValidationStatus(
    questionId: string,
    paeId: string,
    paeStatus: 'in-progress' | 'completed',
    paeFinishedAt: Date | null,
    session?: ClientSession,
  ): Promise<{ modifiedCount: number }>;

  findOpenPaeValidationReviews(): Promise<
    {questionId: string; reviewerId: string; assignedAt: Date}[]
  >;

}
