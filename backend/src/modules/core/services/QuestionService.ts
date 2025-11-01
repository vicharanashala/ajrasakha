import {IQuestionRepository} from '#root/shared/database/interfaces/IQuestionRepository.js';
import {BaseService, MongoDatabase} from '#root/shared/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject, injectable} from 'inversify';
import {ClientSession, ObjectId} from 'mongodb';
import {
  IQuestion,
  IQuestionSubmission,
  ISubmissionHistory,
} from '#root/shared/interfaces/models.js';
import {
  BadRequestError,
  InternalServerError,
  NotFoundError,
} from 'routing-controllers';
import {
  AddQuestionBodyDto,
  GeneratedQuestionResponse,
  GetDetailedQuestionsQuery,
  QuestionResponse,
} from '../classes/validators/QuestionValidators.js';
import {IAnswerRepository} from '#root/shared/database/interfaces/IAnswerRepository.js';
import {CORE_TYPES} from '../types.js';
import {AiService} from './AiService.js';
import {IQuestionSubmissionRepository} from '#root/shared/database/interfaces/IQuestionSubmissionRepository.js';
import {IUserRepository} from '#root/shared/database/interfaces/IUserRepository.js';
import {IRequestRepository} from '#root/shared/database/interfaces/IRequestRepository.js';
import {dummyEmbeddings} from '../utils/questionGen.js';
import {IContextRepository} from '#root/shared/database/interfaces/IContextRepository.js';
import {PreferenceDto} from '../classes/validators/UserValidators.js';
import {INotificationRepository} from '#root/shared/database/interfaces/INotificationRepository.js';
import {notifyUser} from '#root/utils/pushNotification.js';
import {NotificationService} from './NotificationService.js';

@injectable()
export class QuestionService extends BaseService {
  constructor(
    @inject(CORE_TYPES.AIService)
    private readonly aiService: AiService,

    @inject(GLOBAL_TYPES.ContextRepository)
    private readonly contextRepo: IContextRepository,

    @inject(GLOBAL_TYPES.QuestionRepository)
    private readonly questionRepo: IQuestionRepository,

    @inject(GLOBAL_TYPES.UserRepository)
    private readonly userRepo: IUserRepository,

    @inject(GLOBAL_TYPES.QuestionSubmissionRepository)
    private readonly questionSubmissionRepo: IQuestionSubmissionRepository,

    @inject(GLOBAL_TYPES.RequestRepository)
    private readonly requestRepository: IRequestRepository,

    @inject(GLOBAL_TYPES.AnswerRepository)
    private readonly answerRepo: IAnswerRepository,

    @inject(GLOBAL_TYPES.NotificationRepository)
    private readonly notificationRepository: INotificationRepository,

    @inject(GLOBAL_TYPES.NotificationService)
    private readonly notificationService: NotificationService,

    @inject(GLOBAL_TYPES.Database)
    private readonly mongoDatabase: MongoDatabase,
  ) {
    super(mongoDatabase);
  }

  async addDummyQuestions(
    userId: string,
    contextId: string,
    questions: string[],
    session?: ClientSession,
  ) {
    try {
      if (!Array.isArray(questions) || questions.length === 0) {
        throw new BadRequestError('Questions must be a non-empty array');
      }

      if (session) {
        const insertedQuestions = [];

        for (const questionText of questions) {
          const question = await this.questionRepo.addDummyQuestion(
            userId,
            contextId,
            questionText,
            session,
          );

          const submissionData: IQuestionSubmission = {
            questionId: question._id,
            lastRespondedBy: null,
            history: [],
            queue: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          await this.questionSubmissionRepo.addSubmission(
            submissionData,
            session,
          );

          insertedQuestions.push(question);
        }

        return insertedQuestions;
      }

      return this._withTransaction(
        async (transactionSession: ClientSession) => {
          const insertedQuestions = [];

          for (const questionText of questions) {
            const question = await this.questionRepo.addDummyQuestion(
              userId,
              contextId,
              questionText,
              transactionSession,
            );

            const submissionData: IQuestionSubmission = {
              questionId: question._id,
              lastRespondedBy: null,
              history: [],
              queue: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            await this.questionSubmissionRepo.addSubmission(
              submissionData,
              transactionSession,
            );

            insertedQuestions.push(question);
          }

          return insertedQuestions;
        },
      );
    } catch (error) {
      throw new InternalServerError(`Failed to add questions: ${error}`);
    }
  }

  async getByContextId(contextId: string): Promise<IQuestion[]> {
    try {
      return this._withTransaction(async (session: ClientSession) => {
        return this.questionRepo.getByContextId(contextId, session);
      });
    } catch (error) {
      throw new InternalServerError(`Failed to get questions: ${error}`);
    }
  }

  async getAllocatedQuestions(
    userId: string,
    query: GetDetailedQuestionsQuery,
  ): Promise<QuestionResponse[]> {
    try {
      return this._withTransaction(async (session: ClientSession) => {
        return this.questionRepo.getAllocatedQuestions(userId, query, session);
      });
    } catch (error) {
      throw new InternalServerError(
        `Failed to get unanswered questions: ${error}`,
      );
    }
  }
  // async getAllocatedQuestions(
  //   userId: string,
  //   query: GetDetailedQuestionsQuery,
  // ): Promise<QuestionResponse[]> {
  //   try {
  //     return this._withTransaction(async (session: ClientSession) => {
  //       // 1. Fetch the user and extract their preference details
  //       const user = await this.userRepo.findById(userId, session);
  //       const userPreference = user.preference || null;

  //       // 2. Build a query object (userQuery) based on the user's preferences (state, crop, domain)
  //       const userQuery: Record<string, any> = {};
  //       if (userPreference.state && userPreference.state !== 'all') {
  //         userQuery.state = userPreference.state;
  //       }
  //       if (userPreference.crop && userPreference.crop !== 'all') {
  //         userQuery.crop = userPreference.crop;
  //       }
  //       if (userPreference.domain && userPreference.domain !== 'all') {
  //         userQuery.domain = userPreference.domain;
  //       }

  //       // 3. Get unanswered questions based purely on user preference
  //       const userPreferenceQuestions =
  //         await this.questionRepo.getUnAnsweredQuestions(
  //           userId,
  //           userQuery,
  //           session,
  //         );

  //       // 4. Define preference keys to be checked (state, crop, domain)
  //       const keys = ['state', 'crop', 'domain'] as const;

  //       // 5. Check if the given query matches the user's preference-based query
  //       const isQueryMatchingPreference = keys.every(key => {
  //         const prefValue = userQuery[key];
  //         const queryValue = query[key];

  //         if (prefValue && queryValue) return prefValue === queryValue;
  //         if (!prefValue) return true;
  //         return false;
  //       });

  //       // 6. If query matches preference and no questions exist for that preference,
  //       //    delete matching keys from query to widen the filter
  //       if (isQueryMatchingPreference && userPreferenceQuestions.length === 0) {
  //         keys.forEach(key => {
  //           const prefValue = userQuery[key];
  //           const queryValue = query[key];

  //           if (prefValue && queryValue && prefValue === queryValue) {
  //             delete query[key];
  //           }
  //         });
  //       }

  //       // 7. If user still has unanswered preference-based questions,
  //       //    return those first before applying broader filters
  //       if (
  //         !isQueryMatchingPreference &&
  //         userPreferenceQuestions.length > 0 &&
  //         Object.keys(userQuery).length > 0
  //       ) {
  //         console.log(
  //           'Returning user preference questions as they are pending',
  //         );
  //         return userPreferenceQuestions;
  //       }

  //       // 8. If no preference-based questions or filters remain,
  //       //    return general unanswered questions using the updated query
  //       return this.questionRepo.getUnAnsweredQuestions(userId, query, session);
  //     });
  //   } catch (error) {
  //     throw new InternalServerError(
  //       `Failed to get unanswered questions: ${error}`,
  //     );
  //   }
  // }

  async getDetailedQuestions(
    query: GetDetailedQuestionsQuery,
  ): Promise<{questions: IQuestion[]; totalPages: number}> {
    return this.questionRepo.findDetailedQuestions(query);
  }

  async getQuestionFromRawContext(
    // While text to speech
    context: string,
  ): Promise<GeneratedQuestionResponse[]> {
    const questions = await this.aiService.getQuestionByContext(context);
    const uniqueQuestions = Array.from(
      new Map(questions.map(q => [q.question, q])).values(),
    ).map(q => ({
      ...q,
      id: new ObjectId().toString(),
    }));
    return uniqueQuestions;
  }

  async addQuestion(
    userId: string,
    body: AddQuestionBodyDto,
  ): Promise<Partial<IQuestion>> {
    try {
      return this._withTransaction(async (session: ClientSession) => {
        const {question, priority, source, details, context} = body;
        // Prevent duplicate questoin entry
        const isQuestionExisit =
          await this.questionRepo.getQuestionByQuestionText(
            body?.question || '',
            session,
          );

        if (isQuestionExisit)
          throw new BadRequestError(
            `This question already exsist in database, try adding new one!`,
          );

        // 1. If context is provided, create context first and get contextId
        let contextId: ObjectId | null = null;

        if (context) {
          //i) Create Context entry
          const {insertedId} = await this.contextRepo.addContext(
            context,
            session,
          );
          //ii) convert insertedId to ObjectId
          contextId = new ObjectId(insertedId);
        }

        // 2. Create Embedding for the question based on text
        const text = `Question: ${question}`;
        // const {embedding} = await this.aiService.getEmbedding(text);
        const embedding = [];
        // 3. Create Question entry
        const newQuestion: IQuestion = {
          userId: userId && userId.trim() !== '' ? new ObjectId(userId) : null,
          question,
          priority,
          source,
          status: 'open',
          totalAnswersCount: 0,
          contextId,
          details,
          isAutoAllocate: true,
          embedding,
          metrics: null,
          text,
          // createdAt: new Date(),
          createdAt: body.createdAt ? new Date(body.createdAt) : new Date(),
          updatedAt: new Date(),
        };
        // 4. Save Question to DB
        const savedQuestion = await this.questionRepo.addQuestion(newQuestion);

        // 5. Fetch userId based on provided preference and create queue
        // i) Find users matching the preference
        const users = await this.userRepo.findExpertsByPreference(
          details as PreferenceDto,
          session,
        );

        // ii) Create queue from the users found
        const intialUsersToAllocate = users.slice(0, 3);

        const queue = intialUsersToAllocate // Limit to first 3 experts
          .map(user => new ObjectId(user._id.toString()));

        for (const user of intialUsersToAllocate) {
          const IS_INCREMENT = true;
          const userId = user._id.toString();
          await this.userRepo.updateReputationScore(
            userId,
            IS_INCREMENT,
            session,
          );
        }
        // 6. Create an empty QuestionSubmission entry for the newly created question
        const submissionData: IQuestionSubmission = {
          questionId: new ObjectId(savedQuestion._id.toString()),
          lastRespondedBy: null,
          history: [],
          queue,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        //send notification to the first assigned expert
        let message = `A Question has been assigned for answering`;
        let title = 'Answer Creation Assigned';
        let entityId = savedQuestion._id.toString();
        const user = intialUsersToAllocate[0]._id.toString();
        const type = 'answer_creation';
        await this.notificationService.saveTheNotifications(
          message,
          title,
          entityId,
          user,
          type,
        );
        // 6. Save QuestionSubmission to DB
        await this.questionSubmissionRepo.addSubmission(
          submissionData,
          session,
        );

        // 7. Return the saved question
        return newQuestion;
      });
    } catch (error) {
      console.error(error);
      throw new InternalServerError(`Failed to add question: ${error}`);
    }
  }

  async getQuestionById(questionId: string): Promise<QuestionResponse> {
    try {
      return this._withTransaction(async (session: ClientSession) => {
        const currentQuestion = await this.questionRepo.getById(questionId);

        if (!currentQuestion)
          throw new NotFoundError(
            `Failed to find question with id: ${questionId}`,
          );

        const currentAnswers = await this.answerRepo.getByQuestionId(
          questionId,
          session,
        );

        const questionSubmissions =
          await this.questionSubmissionRepo.getByQuestionId(
            questionId,
            session,
          );

        if (!questionSubmissions)
          throw new NotFoundError(
            `Failed to find question submission document of questionId: ${questionId}`,
          );

        const submissionHistory =
          await this.questionSubmissionRepo.getDetailedSubmissionHistory(
            questionId,
            session,
          );

        return {
          id: currentQuestion._id.toString(),
          text: currentQuestion.question,
          source: currentQuestion.source,
          details: currentQuestion.details,
          priority: currentQuestion.priority,
          createdAt: new Date(currentQuestion.createdAt).toLocaleString(),
          updatedAt: new Date(currentQuestion.updatedAt).toLocaleString(),
          totalAnswersCount: currentQuestion.totalAnswersCount,
          history: submissionHistory,
          currentAnswers: currentAnswers.map(currentAnswer => ({
            id: currentAnswer._id.toString(),
            answer: currentAnswer.answer,
            isFinalAnswer: currentAnswer.isFinalAnswer,
            createdAt: currentAnswer.createdAt,
          })),
        };
      });
    } catch (error) {
      throw new InternalServerError(
        `Failed to get unanswered questions: ${error}`,
      );
    }
  }

  async updateQuestion(
    questionId: string,
    updates: Partial<IQuestion>,
  ): Promise<{modifiedCount: number}> {
    try {
      return this._withTransaction(async (session: ClientSession) => {
        const existingQuestion = await this.questionRepo.getById(
          questionId,
          session,
        );

        if (!existingQuestion) {
          throw new BadRequestError(`Question with ID ${questionId} not found`);
        }

        const answers = await this.answerRepo.getByQuestionId(
          questionId,
          session,
        );
        if (
          updates.status === 'closed' &&
          answers.every(answer => answer.isFinalAnswer === false)
        ) {
          throw new BadRequestError(
            `Cannot close this question as it has non-final answers`,
          );
        }

        return this.questionRepo.updateQuestion(questionId, updates, session);
      });
    } catch (error) {
      throw new InternalServerError(`Failed to update question: ${error}`);
    }
  }

  async autoAllocateExperts(
    questionId: string,
    session?: ClientSession,
    BATCH_EXPECTED_TO_ADD: number = 6,
  ): Promise<boolean> {
    const TOTAL_EXPERTS_LIMIT = 10;

    const question = await this.questionRepo.getById(questionId, session);
    if (!question) throw new NotFoundError('Question not found');

    if (question.status !== 'open') {
      console.log(
        'This question is currently being reviewed or has been closed. Please check back later!',
      );
      return false;
    }

    const details = question.details as PreferenceDto;

    const questionSubmission =
      await this.questionSubmissionRepo.getByQuestionId(questionId, session);

    if (!questionSubmission) {
      throw new NotFoundError('Question submission not found');
    }

    const EXISTING_QUEUE_COUNT = questionSubmission.queue.length || 0;
    const EXISTING_HISTORY_COUNT = questionSubmission.history.length || 0;

    if (EXISTING_QUEUE_COUNT >= TOTAL_EXPERTS_LIMIT) {
      console.log('Cannot auto allocate as queue is full');
      return false;
    }

    const [users, preferredExperts] = await Promise.all([
      this.userRepo.findAll(),
      this.userRepo.findExpertsByPreference(details, session),
    ]);

    const expertIdsSet = new Set<string>();
    preferredExperts.forEach(user => expertIdsSet.add(user._id.toString()));
    users
      .filter(user => user.role === 'expert')
      .forEach(user => expertIdsSet.add(user._id.toString()));

    const allExpertIds = Array.from(expertIdsSet);

    if (
      EXISTING_QUEUE_COUNT < 3 ||
      (EXISTING_QUEUE_COUNT === EXISTING_HISTORY_COUNT &&
        EXISTING_QUEUE_COUNT < allExpertIds.length)
    ) {
      const answeredExperts = new Set(
        questionSubmission.history.map(h => h.updatedBy.toString()),
      );

      const unAnsweredExpertIds = allExpertIds.filter(
        expertId => !answeredExperts.has(expertId),
      );

      const CURRENT_BATCH_SIZE = TOTAL_EXPERTS_LIMIT - EXISTING_QUEUE_COUNT;

      // To ensure allocation will not overflow total limit
      const FINAL_BATCH_SIZE = Math.min(
        BATCH_EXPECTED_TO_ADD,
        CURRENT_BATCH_SIZE,
      );

      const existingQueueIds = questionSubmission.queue.map(id =>
        id.toString(),
      );

      const filteredExperts = unAnsweredExpertIds.filter(
        id => !existingQueueIds.includes(id.toString()),
      );

      if (filteredExperts.length === 0) {
        await this.questionRepo.updateQuestion(
          questionId,
          {status: 'in-review'},
          session,
        );
      }

      const expertsToAdd = filteredExperts.slice(0, FINAL_BATCH_SIZE);

      // Add entry for first expert in the queue as status in-review (only after intial 3 allocation)
      if (EXISTING_QUEUE_COUNT >= 3) {
        const nextExpertId = expertsToAdd[0]?.toString();
        const nextAllocatedSubmissionData: ISubmissionHistory = {
          updatedBy: new ObjectId(nextExpertId),
          status: 'in-review',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await this.questionSubmissionRepo.update(
          questionId,
          nextAllocatedSubmissionData,
          session,
        );
        let message = `A new Review has been assigned to you`;
        let title = 'New Review Assigned';
        let entityId = questionId.toString();
        const user = nextExpertId.toString();
        const type = 'peer_review';
        await this.notificationService.saveTheNotifications(
          message,
          title,
          entityId,
          user,
          type,
        );
      }

      for (const expertId of expertsToAdd) {
        const IS_INCREMENT = true;
        await this.userRepo.updateReputationScore(
          expertId,
          IS_INCREMENT,
          session,
        );
      }
      const updatedQueue = [...questionSubmission.queue, ...expertsToAdd]
        .slice(0, TOTAL_EXPERTS_LIMIT)
        .map(id => new ObjectId(id));

      await this.questionSubmissionRepo.updateQueue(
        questionId,
        updatedQueue,
        session,
      );
    }
    return true;
  }

  async toggleAutoAllocate(questionId: string): Promise<{message: string}> {
    try {
      return this._withTransaction(async (session: ClientSession) => {
        //1. Validate question existence
        const question = await this.questionRepo.getById(questionId, session);
        if (!question) throw new NotFoundError('Question not found');

        const updated = await this.questionRepo.updateAutoAllocate(
          questionId,
          question?.isAutoAllocate,
          session,
        );
        const currentStatus = question.isAutoAllocate;
        // If currentStatus is false, then we need to set it to true and vice versa

        if (!currentStatus) {
          const submission = await this.questionSubmissionRepo.getByQuestionId(
            questionId,
            session,
          );

          const CURRENT_QUEUE_LENGTH = submission.queue.length || 0;
          let BATCH_EXPECTED_TO_ADD = 6;

          // If removing first 3 intial allocation, so allocate only 3 intially
          if (CURRENT_QUEUE_LENGTH < 3)
            BATCH_EXPECTED_TO_ADD = 3 - CURRENT_QUEUE_LENGTH;

          const out = await this.autoAllocateExperts(
            questionId,
            session,
            BATCH_EXPECTED_TO_ADD,
          );

          if (!out) {
            return {
              message: 'Auto allocate toggled, but queue is already full',
            };
          }
        }

        return {
          message: `Auto allocate is now set to ${updated.isAutoAllocate}`,
        };
      });
    } catch (error) {
      throw new InternalServerError(`Failed to toggle auto allocate: ${error}`);
    }
  }

  async allocateExperts(
    questionId: string,
    experts: string[],
  ): Promise<IQuestionSubmission> {
    try {
      return this._withTransaction(async (session: ClientSession) => {
        //1. Validate question existence
        const question = await this.questionRepo.getById(questionId, session);
        if (!question) throw new NotFoundError('Question not found');

        if (question.status !== 'open') {
          console.log(
            'This question is currently being reviewed or has been closed. Please check back later!',
          );
          return;
        }

        //2. Validate question submission existence
        const questionSubmission =
          await this.questionSubmissionRepo.getByQuestionId(
            questionId,
            session,
          );
        if (!questionSubmission)
          throw new NotFoundError('Question submission not found');

        //3. Validate experts array
        if (!experts || experts.length === 0)
          throw new BadRequestError('Experts list cannot be empty');

        // Check if adding these experts exceeds the limit of 10
        const totalAllocatedExperts = questionSubmission.queue.length;
        if (totalAllocatedExperts + experts.length > 10)
          throw new BadRequestError(
            `Cannot allocate more than 10 experts. Currently allocated: ${totalAllocatedExperts}`,
          );

        //4. Allocate experts
        const expertIds = experts.map(e => new ObjectId(e));

        // if the last expert is  reviewing other question means (if status is not reviewed or not submitted an answer)
        const lastSubmission = questionSubmission.history.at(-1);
        if (
          questionSubmission.history.length >= 0 && // if there is no history there
          (lastSubmission?.answer || lastSubmission?.status == 'reviewed')
        ) {
          const expertId = expertIds[0];
          const userSubmissionData: ISubmissionHistory = {
            updatedBy: expertId,
            createdAt: new Date(),
            status: 'in-review',
            updatedAt: new Date(),
          };
          //need to add here
          let message = `A new Review has been assigned to you`;
          let title = 'New Review Assigned';
          let entityId = questionId.toString();
          const user = expertId.toString();
          const type = 'peer_review';
          await this.notificationService.saveTheNotifications(
            message,
            title,
            entityId,
            user,
            type,
          );
          await this.questionSubmissionRepo.update(
            questionId,
            userSubmissionData,
            session,
          );
        }
        //5. Update question submission with new experts
        const updated = await this.questionSubmissionRepo.allocateExperts(
          questionId,
          expertIds,
          session,
        );

        //6. Return updated question submission
        return updated;
      });
    } catch (error) {
      throw new InternalServerError(`Failed to allocate experts: ${error}`);
    }
  }

  async removeExpertFromQueue(
    questionId: string,
    index: number,
  ): Promise<IQuestionSubmission> {
    try {
      return this._withTransaction(async (session: ClientSession) => {
        //1. Validate that the question exists
        const question = await this.questionRepo.getById(questionId, session);
        if (!question) throw new NotFoundError('Question not found');

        //2. Validate that the corresponding question submission exists
        const questionSubmission =
          await this.questionSubmissionRepo.getByQuestionId(
            questionId,
            session,
          );
        if (!questionSubmission)
          throw new NotFoundError('Question submission not found');

        //3. Get the current expert queue from the question submission
        const submissionQueue = questionSubmission.queue || [];

        //4. Extract the expert ID based on the provided index
        const expertId = submissionQueue[index]?.toString();

        //5. Decrease the expert's reputation score (since being removed)
        const IS_INCREMENT = false;
        await this.userRepo.updateReputationScore(
          expertId,
          IS_INCREMENT,
          session,
        );

        //6. Remove the expert from the queue by index
        const updated =
          await this.questionSubmissionRepo.removeExpertFromQueuebyIndex(
            questionId,
            Number(index),
            session,
          );

        //7. Handle auto reallocation logic if autoAllocate is enabled
        if (index >= 0 && question.isAutoAllocate) {
          // Get updated queue and history lengths
          const UPDATED_QUEUE_LENGTH = updated?.queue.length || 0;
          const UPDATED_HISTORY_LENGTH = updated?.history.length || 0;
          let BATCH_EXPECTED_TO_ADD = 6;

          // Adjust batch size if initial allocation (<3) experts are being removed
          if (UPDATED_QUEUE_LENGTH < 3)
            BATCH_EXPECTED_TO_ADD = 3 - UPDATED_QUEUE_LENGTH;

          // If all previous experts have responded and queue is not full, trigger auto allocation
          if (
            UPDATED_QUEUE_LENGTH < 3 ||
            (UPDATED_HISTORY_LENGTH == UPDATED_QUEUE_LENGTH &&
              UPDATED_QUEUE_LENGTH < 10)
          ) {
            await this.autoAllocateExperts(
              questionId,
              session,
              BATCH_EXPECTED_TO_ADD,
            );
          }
        }

        //8. Return the updated question submission
        return updated;
      });
    } catch (error) {
      throw new InternalServerError(
        `Failed to remove expert from queue: ${error}`,
      );
    }
  }

  async deleteQuestion(questionId: string): Promise<{deletedCount: number}> {
    try {
      return this._withTransaction(async (session: ClientSession) => {
        const question = await this.questionRepo.getById(questionId, session);
        if (!question) {
          throw new BadRequestError(`Question with ID ${questionId} not found`);
        }
        await this.answerRepo.deleteByQuestionId(questionId, session);

        const questionSubmission =
          await this.questionSubmissionRepo.getByQuestionId(
            questionId,
            session,
          );

        if (!questionSubmission) {
          throw new NotFoundError(
            `No question submission found for question ID: ${questionId}`,
          );
        }

        const history = questionSubmission.history || [];
        if (history.length > 0) {
          // Get the last history entry
          const lastHistoryEntry = history[history.length - 1];

          if (!lastHistoryEntry) {
            throw new BadRequestError(
              `Invalid submission history for question ID: ${questionId}`,
            );
          }

          // Check if the last entry is still under review and no answer provided yet
          const isUnderReviewWithoutAnswer =
            lastHistoryEntry.status === 'in-review' && !lastHistoryEntry.answer;

          if (isUnderReviewWithoutAnswer) {
            const IS_INCREMENT = false;
            const expertId = lastHistoryEntry.updatedBy?.toString();

            if (!expertId) {
              throw new BadRequestError(
                `Expert ID missing in the last history entry for question ID: ${questionId}`,
              );
            }

            await this.userRepo.updateReputationScore(
              expertId,
              IS_INCREMENT,
              session,
            );
          }
        }

        await this.questionSubmissionRepo.deleteByQuestionId(
          questionId,
          session,
        );
        await this.requestRepository.deleteByEntityId(questionId, session);
        return this.questionRepo.deleteQuestion(questionId, session);
      });
    } catch (error) {
      throw new InternalServerError(`Failed to delete question: ${error}`);
    }
  }

  async getQuestionFullData(
    questionId: string,
    userId: string,
  ): Promise<IQuestion | null> {
    try {
      const question = await this.questionRepo.getQuestionWithFullData(
        questionId,
        userId,
      );
      if (!question) {
        return null;
      }
      return question;
    } catch (error) {
      throw new InternalServerError(`Failed to fetch question data: ${error}`);
    }
  }
}
