import {
  GetDetailedQuestionsQuery,
  QuestionResponse,
} from '#root/modules/core/classes/validators/QuestionValidators.js';
import {IQuestion, IUser} from '#root/shared/interfaces/models.js';
import {ClientSession} from 'mongodb';

/**
 * Interface representing a repository for question-related operations.
 */
export interface IQuestionRepository {
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
   * Retrieves all questions for a specific context.
   * @param contextId - The ID of the context.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to an array of questions.
   */
  getByContextId(
    contextId: string,
    session?: ClientSession,
  ): Promise<IQuestion[]>;

  /**
   * Retrieves all questions for a specific context.
   * @param questionId - The ID of the question.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to an array of questions.
   */
  getById(questionId: string, session?: ClientSession): Promise<IQuestion>;

  /**
   * Retrieves all questions for a specific context.
   * @param questionId - The ID of the question.
   * @param userId - The ID of the user.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to an array of questions.
   */
  getQuestionWithFullData(questionId: string, userId: string): Promise<any>;

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
    // userPreference: IUser['preference'] | null,
    session?: ClientSession,
  ): Promise<QuestionResponse[]>;
  /**
   * @param query - Advance query filters.
   * @returns A promise that resolves to an array of detailed questions.
   */
  findDetailedQuestions(
  query: GetDetailedQuestionsQuery & { searchEmbedding: number[] | null }
  ): Promise<{questions: IQuestion[]; totalPages: number; totalCount: number}>;

  /**
   * Updates a specific question.
   * @param questionId - The ID of the question to update.
   * @param updates - Partial object containing the fields to update.
   * @param session - Optional MongoDB client session for transactions.
   * @param addText - To add text field without filtering it.
   * @returns A promise that resolves to an object containing the number of modified documents.
   */
  updateQuestion(
    questionId: string,
    updates: Partial<IQuestion>,
    session?: ClientSession,
    addText?: boolean,
  ): Promise<{modifiedCount: number}>;

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


  insertMany(questions: IQuestion[]): Promise<string[]>

  updateQuestionStatus(id: string, status: string, errorMessage?: string, session?: ClientSession): Promise<void>

  // findById(id: string, session?: ClientSession): Promise<IQuestion | null>
}
