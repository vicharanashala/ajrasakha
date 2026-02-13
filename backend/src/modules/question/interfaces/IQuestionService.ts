// #root/modules/question/interfaces/IQuestionService.ts

import {
  IQuestion,
  IQuestionSubmission,
} from '#root/shared/interfaces/models.js';
import {
  AddQuestionBodyDto,
  GeneratedQuestionResponse,
  GetDetailedQuestionsQuery,
  QuestionResponse,
} from '../classes/validators/QuestionVaidators.js';
import { QuestionLevelResponse } from '#root/modules/core/classes/transformers/QuestionLevel.js';
import { ClientSession } from 'mongodb';

export interface IQuestionService {
  /** Bulk insert questions (CSV / upload / AI generated) */
  createBulkQuestions(
    userId: string,
    questions: any[]
  ): Promise<string[]>;

  /** Add dummy questions linked to a context */
  addDummyQuestions(
    userId: string,
    contextId: string,
    questions: string[],
    session?: any
  ): Promise<IQuestion[]>;

  /** Get questions under a context */
  getByContextId(contextId: string): Promise<IQuestion[]>;

  /** Questions allocated to an expert */
  getAllocatedQuestions(
    userId: string,
    query: GetDetailedQuestionsQuery
  ): Promise<QuestionResponse[]>;

  /** Paginated + searchable question list */
  getDetailedQuestions(
    query: GetDetailedQuestionsQuery
  ): Promise<{
    questions: IQuestion[];
    totalPages: number;
  }>;

  /** Generate questions from raw context (AI) */
  getQuestionFromRawContext(
    context: string
  ): Promise<GeneratedQuestionResponse[]>;

  /** Create a new question */
  addQuestion(
    userId: string,
    body: AddQuestionBodyDto
  ): Promise<Partial<IQuestion>>;

  /** Question detail page */
  getQuestionById(questionId: string): Promise<QuestionResponse>;

  /** Update question fields */
  updateQuestion(
    questionId: string,
    updates: Partial<IQuestion>
  ): Promise<{ modifiedCount: number }>;

  /** Auto allocate experts */
  autoAllocateExperts(
    questionId: string,
    session?: any,
    batchSize?: number
  ): Promise<boolean>;

  /** Toggle auto allocation on/off */
  toggleAutoAllocate(
    questionId: string
  ): Promise<{ message: string }>;

  /** Manually allocate experts */
  allocateExperts(
    userId: string,
    questionId: string,
    experts: string[]
  ): Promise<IQuestionSubmission>;

  /** Remove expert from allocation queue */
  removeExpertFromQueue(
    userId: string,
    questionId: string,
    index: number
  ): Promise<IQuestionSubmission>;

  /** Delete a question (cascade delete) */
  deleteQuestion(
    questionId: string,
    session?: any
  ): Promise<{ deletedCount: number }>;

  /** Bulk delete (max 50) */
  bulkDeleteQuestions(
    questionIds: string[]
  ): Promise<{ deletedCount: number }>;

  /** Fetch question with answers, history & permissions */
  getQuestionFullData(
    questionId: string,
    userId: string
  ): Promise<IQuestion | null>;

  /** Get expert’s allocated question page */
  getAllocatedQuestionPage(
    userId: string,
    questionId: string
  ): Promise<any>;

  /** Get table data with review levels */
  getQuestionAndReviewLevel(
    query: GetDetailedQuestionsQuery
  ): Promise<QuestionLevelResponse>;

  cleanupQuestionSubmissions(
      absentExpertIds: string[],
      session: ClientSession,
    ): Promise<void>

    balanceWorkload(
      session?: ClientSession,
    ): Promise<{message: string;
      expertsInvolved: number;
      submissionsProcessed: number;}>
  runAbsentScript()

  // getQuestionsByDateRange(
  //   startDate: string,
  //   endDate: string,
  // ):Promise<IQuestion[]>

  sendOutReachQuestionsMail(
    startDate: string,
    endDate: string,
    emails: string | string[],
  ): Promise<{ success: boolean; message: string }>
}
