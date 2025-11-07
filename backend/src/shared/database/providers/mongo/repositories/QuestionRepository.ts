import {IQuestionRepository} from '#root/shared/database/interfaces/IQuestionRepository.js';
import {
  IAnswer,
  IContext,
  IQuestion,
  IQuestionSubmission,
  IUser,
} from '#root/shared/interfaces/models.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject} from 'inversify';
import {ClientSession, Collection, ObjectId} from 'mongodb';
import {MongoDatabase} from '../MongoDatabase.js';
import {isValidObjectId} from '#root/utils/isValidObjectId.js';
import {
  BadRequestError,
  InternalServerError,
  NotFoundError,
} from 'routing-controllers';
import {
  GetDetailedQuestionsQuery,
  QuestionResponse,
} from '#root/modules/core/classes/validators/QuestionValidators.js';

import {
  detailsArray,
  dummyEmbeddings,
  priorities,
  questionStatus,
  sources,
} from '#root/modules/core/utils/questionGen.js';

const VECTOR_INDEX_NAME = 'questions_vector_index';
const EMBEDDING_FIELD = 'embedding';
const VECTOR_NUM_CANDIDATES = 200;
const VECTOR_COUNT_LIMIT = 20000;

export class QuestionRepository implements IQuestionRepository {
  private QuestionCollection: Collection<IQuestion>;
  private QuestionSubmissionCollection: Collection<IQuestionSubmission>;
  private AnswersCollection: Collection<IAnswer>;
  private UsersCollection!: Collection<IUser>;
  private ContextCollection: Collection<IContext>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init() {
    this.ContextCollection = await this.db.getCollection<IContext>('contexts');

    this.QuestionCollection =
      await this.db.getCollection<IQuestion>('questions');
    this.QuestionSubmissionCollection =
      await this.db.getCollection<IQuestionSubmission>('question_submissions');
    this.UsersCollection = await this.db.getCollection<IUser>('users');
    this.AnswersCollection = await this.db.getCollection<IAnswer>('answers');
  }

  private async ensureIndexes() {
    try {
      await this.QuestionCollection.createIndex({status: 1, createdAt: 1});
    } catch (error) {
      console.error('Failed to create index:', error);
    }
  }

  private async getEmbeddingForText(text: string): Promise<number[]> {
    throw new Error(
      'getEmbeddingForText not implemented. Replace with your embedding call.',
    );
  }

  async addQuestions(
    userId: string,
    contextId: string,
    questions: string[],
    session?: ClientSession,
  ): Promise<{insertedCount: number}> {
    try {
      await this.init();

      if (!userId || !isValidObjectId(userId)) {
        throw new BadRequestError('Invalid or missing userId');
      }
      if (!contextId || !isValidObjectId(contextId)) {
        throw new BadRequestError('Invalid or missing contextId');
      }
      if (!Array.isArray(questions) || questions.length === 0) {
        throw new BadRequestError('Questions must be a non-empty array');
      }

      const uploadData: IQuestion[] = questions.map((question: string) => {
        const randomDetails =
          detailsArray[Math.floor(Math.random() * detailsArray.length)];
        const randomSource =
          sources[Math.floor(Math.random() * sources.length)];
        const randomPrioriy =
          priorities[Math.floor(Math.random() * priorities.length)];

        return {
          question,
          userId: new ObjectId(userId),
          context: new ObjectId(contextId),
          status: 'open',
          details: randomDetails,
          source: randomSource,
          embedding: dummyEmbeddings,
          metrics: null,
          text: `Question: ${question}`,
          totalAnswersCount: 0,
          isAutoAllocate: true,
          priority: randomPrioriy,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      });

      const result = await this.QuestionCollection.insertMany(uploadData, {
        session,
      });

      return {insertedCount: result.insertedCount};
    } catch (error) {
      throw new InternalServerError(
        `Error while adding questions, More/ ${error}`,
      );
    }
  }
  async addDummyQuestion(
    userId: string,
    contextId: string,
    question: string,
    session?: ClientSession,
  ): Promise<IQuestion> {
    try {
      await this.init();

      if (!userId || !isValidObjectId(userId)) {
        throw new BadRequestError('Invalid or missing userId');
      }
      if (!contextId || !isValidObjectId(contextId)) {
        throw new BadRequestError('Invalid or missing contextId');
      }
      if (!question || typeof question !== 'string') {
        throw new BadRequestError('Question must be a non-empty string');
      }

      const randomDetails =
        detailsArray[Math.floor(Math.random() * detailsArray.length)];
      const randomSource = sources[Math.floor(Math.random() * sources.length)];
      const randomPrioriy =
        priorities[Math.floor(Math.random() * priorities.length)];
      const randomStatus =
        questionStatus[Math.floor(Math.random() * questionStatus.length)];

      const newQuestion: IQuestion = {
        question,
        userId: new ObjectId(userId),
        contextId: new ObjectId(contextId),
        status: randomStatus,
        details: randomDetails,
        source: randomSource,
        embedding: dummyEmbeddings,
        metrics: null,
        text: `Question: ${question}`,
        totalAnswersCount: 0,
        isAutoAllocate: true,
        priority: randomPrioriy,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await this.QuestionCollection.insertOne(newQuestion, {
        session,
      });

      return {...newQuestion, _id: result.insertedId};
    } catch (error) {
      throw new InternalServerError(`Error while adding question: ${error}`);
    }
  }

  async addQuestion(
    question: IQuestion,
    session?: ClientSession,
  ): Promise<IQuestion> {
    try {
      await this.init();
      if (!question._id) question._id = new ObjectId();

      await this.QuestionCollection.insertOne(question, {session});

      return {...question, _id: question._id.toString()};
    } catch (error) {
      throw new InternalServerError(`Failed to add question ${error}`);
    }
  }

  async getByContextId(
    contextId: string,
    session?: ClientSession,
  ): Promise<IQuestion[]> {
    try {
      await this.init();

      if (!contextId || !isValidObjectId(contextId)) {
        throw new BadRequestError('Invalid or missing contextId');
      }

      const questions = await this.QuestionCollection.find(
        {
          context: new ObjectId(contextId),
        },
        {session},
      ).toArray();

      const formattedQuestions: IQuestion[] = questions.map(q => ({
        ...q,
        _id: q._id?.toString(),
        userId: q.userId?.toString(),
        contextId: q.contextId?.toString(),
      }));
      return formattedQuestions;
    } catch (error) {
      throw new InternalServerError(`Failed to get Question:, More/ ${error}`);
    }
  }

  async getById(
    questionId: string,
    session?: ClientSession,
  ): Promise<IQuestion> {
    try {
      await this.init();

      if (!questionId || !isValidObjectId(questionId)) {
        throw new BadRequestError('Invalid or missing questionId');
      }

      const question = await this.QuestionCollection.findOne(
        {
          _id: new ObjectId(questionId),
        },
        {session},
      );

      if (!question)
        throw new NotFoundError(`Faile to find question ${questionId}`);

      const formattedQuestion: IQuestion = {
        ...question,
        _id: question._id?.toString(),
        userId: question.userId?.toString(),
        contextId: question.contextId?.toString(),
      };

      return formattedQuestion;
    } catch (error) {
      throw new InternalServerError(`Failed to get Question:, More/ ${error}`);
    }
  }

  async findDetailedQuestions(
    query: GetDetailedQuestionsQuery & {searchEmbedding: number[] | null},
  ): Promise<{questions: IQuestion[]; totalPages: number; totalCount: number}> {
    try {
      await this.init();

      const {
        search,
        searchEmbedding,
        status,
        source,
        state,
        crop,
        priority,
        answersCountMin,
        answersCountMax,
        dateRange,
        domain,
        user,
        page = 1,
        limit = 10,
      } = query;

      const filter: any = {};

      // --- Filters ---
      if (status && status !== 'all') filter.status = status;
      if (source && source !== 'all') filter.source = source;
      if (priority && priority !== 'all') filter.priority = priority;
      if (state && state !== 'all') filter['details.state'] = state;
      if (crop && crop !== 'all') filter['details.crop'] = crop;
      if (domain && domain !== 'all') filter['details.domain'] = domain;

      if (answersCountMin !== undefined || answersCountMax !== undefined) {
        filter.totalAnswersCount = {};
        if (answersCountMin !== undefined)
          filter.totalAnswersCount.$gte = answersCountMin;
        if (answersCountMax !== undefined)
          filter.totalAnswersCount.$lte = answersCountMax;
      }

      // --- Date range ---
      if (dateRange && dateRange !== 'all') {
        const now = new Date();
        let startDate: Date | undefined;
        switch (dateRange) {
          case 'today':
            startDate = new Date(now.setHours(0, 0, 0, 0));
            break;
          case 'week':
            startDate = new Date(now.setDate(now.getDate() - 7));
            break;
          case 'month':
            startDate = new Date(now.setMonth(now.getMonth() - 1));
            break;
          case 'quarter':
            startDate = new Date(now.setMonth(now.getMonth() - 3));
            break;
          case 'year':
            startDate = new Date(now.setFullYear(now.getFullYear() - 1));
            break;
        }
        if (startDate) filter.createdAt = {$gte: startDate};
      }

      let questionIdsByUser: string[] | null = null;
      if (user && user !== 'all') {
        const submissions = await this.QuestionSubmissionCollection.find({
          'history.updatedBy': new ObjectId(user),
        })
          .project({questionId: 1})
          .toArray();

        questionIdsByUser = submissions.map(s => s.questionId.toString());

        if (questionIdsByUser.length === 0) {
          return {questions: [], totalPages: 0, totalCount: 0};
        }

        filter._id = {$in: questionIdsByUser.map(id => new ObjectId(id))};
      }

      let totalCount = 0;
      let result = [];

      if (searchEmbedding && searchEmbedding.length > 0) {
        const countPipeline = [
          {
            $vectorSearch: {
              index: 'review_questions_vector_index',
              path: 'embedding',
              queryVector: searchEmbedding,
              numCandidates: 500,
              limit,
            },
          },
          {$match: filter},
          {$count: 'count'},
        ];

        const countResult =
          await this.QuestionCollection.aggregate(countPipeline).toArray();
        totalCount = countResult[0]?.count ?? 0;

        const totalPages = Math.ceil(totalCount / limit);

        if (totalCount === 0) {
          return {questions: [], totalPages, totalCount};
        }

        // --- DATA FETCH with vector search ---
        const pipeline = [
          {
            $vectorSearch: {
              index: 'review_questions_vector_index',
              path: 'embedding',
              queryVector: searchEmbedding,
              numCandidates: 200,
              limit,
            },
          },
          {$match: filter},
          {$sort: {createdAt: -1}},
          {$skip: (page - 1) * limit},
          {$limit: limit},
          {
            $project: {
              userId: 0,
              updatedAt: 0,
              contextId: 0,
              metrics: 0,
              embedding: 0,
              score: {$meta: 'vectorSearchScore'},
            },
          },
        ];

        result = await this.QuestionCollection.aggregate(pipeline).toArray();

        const formattedQuestions: IQuestion[] = result.map((q: any) => ({
          ...q,
          _id: q._id.toString(),
          details: {...q.details},
        }));

        return {questions: formattedQuestions, totalPages, totalCount};
      }

      if (search && search.trim() !== '') {
        filter.$or = [
          {question: {$regex: search, $options: 'i'}},
          {'details.crop': {$regex: search, $options: 'i'}},
          {'details.state': {$regex: search, $options: 'i'}},
          {'details.domain': {$regex: search, $options: 'i'}},
          {
            $expr: {
              $regexMatch: {
                input: {$toString: '$_id'},
                regex: search,
                options: 'i',
              },
            },
          },
        ];
      }

      totalCount = await this.QuestionCollection.countDocuments(filter);
      const totalPages = Math.ceil(totalCount / limit);

      result = await this.QuestionCollection.find(filter)
        .sort({createdAt: -1})
        .skip((page - 1) * limit)
        .limit(limit)
        .project({
          userId: 0,
          updatedAt: 0,
          contextId: 0,
          metrics: 0,
          embedding: 0,
        })
        .toArray();

      // // --- Total count for pagination ---
      // const totalCount = await this.QuestionCollection.countDocuments(filter);
      // const totalPages = Math.ceil(totalCount / limit);

      // // --- Paginated data ---
      // const result = await this.QuestionCollection.find(filter)
      //   .sort({createdAt: -1})
      //   .skip((page - 1) * limit)
      //   .limit(limit)
      //   .project({
      //     userId: 0,
      //     updatedAt: 0,
      //     contextId: 0,
      //     metrics: 0,
      //     embedding: 0,
      //   })
      //   .toArray();

      // --- Convert ObjectIds to string ---
      const formattedQuestions: IQuestion[] = result.map((q: any) => ({
        ...q,
        _id: q._id.toString(),
        details: {...q.details},
      }));

      return {questions: formattedQuestions, totalPages, totalCount};
    } catch (error) {
      throw new InternalServerError(`Failed to get Questions: ${error}`);
    }
  }

  async getAllocatedQuestions(
    userId: string,
    query: GetDetailedQuestionsQuery,
    // userPreference: IUser['preference'] | null,
    session?: ClientSession,
  ): Promise<QuestionResponse[]> {
    try {
      await this.init();

      const {filter: sortFilter, page = 1, limit = 10} = query;

      const skip = (page - 1) * limit;

      const userObjectId = new ObjectId(userId);

      const submissions = await this.QuestionSubmissionCollection.aggregate([
        {
          $addFields: {
            lastHistory: {$arrayElemAt: ['$history', -1]},
            historyCount: {$size: {$ifNull: ['$history', []]}},
            firstInQueue: {$arrayElemAt: ['$queue', 0]},
          },
        },
        {
          $match: {
            $or: [
              {
                'lastHistory.updatedBy': userObjectId,
                'lastHistory.status': 'in-review',
                $or: [
                  {'lastHistory.answer': {$exists: false}},
                  {'lastHistory.answer': null},
                  {'lastHistory.answer': ''},
                ],
              },
              {
                historyCount: 0, // if there is no history means , there is no submision yet so this is the first expert who is submitting
                firstInQueue: userObjectId,
              },
            ],
          },
        },
      ]).toArray();

      const questionIdsToAttempt = submissions.map(
        sub => new ObjectId(sub.questionId),
      );

      const filter: any = {
        status: {$in: ['open', 'delayed']},
        _id: {$in: questionIdsToAttempt},
      };

      const pipeline: any = [{$match: filter}];

      // if (sortFilter === 'newest') {
      //   pipeline.push({$sort: {createdAt: -1}});
      // } else if (sortFilter === 'oldest') {
      //   pipeline.push({$sort: {createdAt: 1}});
      // } else if (sortFilter === 'leastResponses') {
      //   pipeline.push({$sort: {totalAnswersCount: 1}});
      // } else if (sortFilter === 'mostResponses') {
      //   pipeline.push({$sort: {totalAnswersCount: -1}});
      // }

      pipeline.push({
        $addFields: {
          priorityOrder: {
            $switch: {
              branches: [
                {case: {$eq: ['$priority', 'high']}, then: 1},
                {case: {$eq: ['$priority', 'medium']}, then: 2},
                {case: {$eq: ['$priority', 'low']}, then: 3},
              ],
              default: 4,
            },
          },
        },
      });

      pipeline.push({$sort: {priorityOrder: 1}});

      pipeline.push({$skip: skip});
      pipeline.push({$limit: limit});

      pipeline.push({
        $project: {
          id: {$toString: '$_id'},
          text: '$question',
          priority: '$priority',
          createdAt: '$createdAt',
          updatedAt: '$updatedAt',
          totalAnswersCount: 1,
          'details.crop': 1,
          'details.state': 1,
          source: 1,
          _id: 0,
        },
      });

      const results = await this.QuestionCollection.aggregate<QuestionResponse>(
        pipeline,
        {session},
      ).toArray();

      return results;
    } catch (error) {
      throw new InternalServerError(
        `Failed to fetch unanswered questions: ${error}`,
      );
    }
  }

  async getQuestionWithFullData(questionId: string, userId: string) {
    await this.init();

    const questionObjectId = new ObjectId(questionId);

    try {
      // 1 Fetch the question
      const question = await this.QuestionCollection.findOne(
        {
          _id: questionObjectId,
        },
        {projection: {userId: 0, embedding: 0}},
      );
      if (!question) return null;
      // 2 Fetch submissions for this question
      const submission = await this.QuestionSubmissionCollection.findOne({
        questionId: questionObjectId,
      });

      // 3 Collect all user IDs for lastRespondedBy
      const lastRespondedId = submission?.lastRespondedBy?.toString();

      // 4 Collect all updatedBy and answer IDs from submission histories
      const allUpdatedByIds: ObjectId[] = [];
      const allAnswerIds: ObjectId[] = [];

      submission?.history?.forEach(h => {
        if (h.updatedBy) allUpdatedByIds.push(h.updatedBy as ObjectId);
        if (h.answer) allAnswerIds.push(h.answer as ObjectId);
      });

      // 5 Fetch all related users
      const users = await this.UsersCollection.find({
        // _id: {$in: [lastRespondedId, ...allUpdatedByIds]},
      }).toArray();

      const usersMap = new Map(users.map(u => [u._id?.toString(), u]));

      // 6 Fetch all related answers
      const answers = await this.AnswersCollection.find({
        _id: {$in: allAnswerIds},
      }).toArray();

      const answersMap = new Map(answers.map(a => [a._id?.toString(), a]));
      const isAlreadySubmitted = allUpdatedByIds
        .map(id => id.toString())
        .includes(userId);

      // 7 Populate submissions manually
      const populatedSubmission = {
        _id: submission?._id?.toString(),
        questionId: submission?.questionId?.toString(),
        lastRespondedBy: lastRespondedId
          ? {
              _id: submission?.lastRespondedBy?.toString(),
              name: usersMap.get(lastRespondedId)?.firstName,
              email: usersMap.get(submission?.lastRespondedBy?.toString())
                ?.email,
            }
          : null,
        queue: submission?.queue?.map(q => ({
          _id: q.toString(),
          name: usersMap.get(q.toString())?.firstName,
          email: usersMap.get(q.toString())?.email,
        })),
        history: submission?.history.map(h => ({
          updatedBy: h.updatedBy
            ? {
                _id: h.updatedBy?.toString(),
                name: usersMap.get(h.updatedBy?.toString())?.firstName,
                email: usersMap.get(h.updatedBy?.toString())?.email,
              }
            : [],
          answer: h.answer
            ? {
                _id: h.answer?.toString(),
                authorId: answersMap
                  .get(h.answer?.toString())
                  ?.authorId?.toString(),
                answerIteration: answersMap.get(h.answer?.toString())
                  ?.answerIteration,
                isFinalAnswer: answersMap.get(h.answer?.toString())
                  ?.isFinalAnswer,
                answer: answersMap.get(h.answer?.toString())?.answer,
                sources: answersMap.get(h.answer?.toString())?.sources,
                approvalCount: answersMap.get(h.answer?.toString())
                  ?.approvalCount,
                createdAt: answersMap.get(h.answer?.toString())?.createdAt,
                updatedAt: answersMap.get(h.answer?.toString())?.updatedAt,
              }
            : null,
          status: h.status,
          approvedAnswer: h.approvedAnswer?.toString(),
          rejectedAnswer: h.rejectedAnswer?.toString(),
        })),
        createdAt: submission?.createdAt,
        updatedAt: submission?.updatedAt,
      };

      // 8 Attach context
      const contextId = question.contextId || '';
      let context = '';
      if (isValidObjectId(contextId.toString())) {
        const contextData = await this.ContextCollection.findOne({
          _id: contextId,
        });
        context = contextData.text || '';
      }

      // 9 Final assembled question
      const result = {
        ...{
          ...question,
          contextId: question.contextId?.toString(),
          isAutoAllocate: question.isAutoAllocate ?? true,
        },
        _id: question._id?.toString(),
        userId: question.userId?.toString(),
        isAlreadySubmitted,
        context,
        submission: populatedSubmission,
      };

      return result;
    } catch (error) {
      throw new InternalServerError(
        `Failed to fetch full question data: ${error}`,
      );
    }
  }

  async updateExpiredAfterFourHours(): Promise<void> {
    try {
      await this.init();
      await this.ensureIndexes();

      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);

      // const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000);

      const result = await this.QuestionCollection.updateMany(
        {
          status: {$nin: ['closed', 'in-review']},
          createdAt: {$lte: fourHoursAgo},
        },
        {$set: {status: 'delayed'}},
      );

      console.log(
        ` Updated ${result.modifiedCount} questions to "delayed" status`,
      );
    } catch (error) {
      console.error('Error updating expired questions', error);
    }
  }

  async updateAutoAllocate(
    questionId: string,
    isAutoAllocate: boolean,
    session?: ClientSession,
  ): Promise<IQuestion | null> {
    try {
      await this.init();
      const autoAllocateValue =
        typeof isAutoAllocate === 'boolean' ? !isAutoAllocate : false;
      return await this.QuestionCollection.findOneAndUpdate(
        {_id: new ObjectId(questionId)},
        {$set: {isAutoAllocate: autoAllocateValue}},
        {session, returnDocument: 'after'},
      );
    } catch (error) {
      throw new InternalServerError(
        `Error while updating auto allocate field: ${error}`,
      );
    }
  }

  async getQuestionByQuestionText(
    text: string,
    session?: ClientSession,
  ): Promise<IQuestion> {
    try {
      await this.init();
      return this.QuestionCollection.findOne({question: text}, {session});
    } catch (error) {
      throw new InternalServerError(
        `Failed to find question by text /More: ${error}`,
      );
    }
  }

  async updateQuestion(
    questionId: string,
    updates: Partial<IQuestion>,
    session?: ClientSession,
    addText?: boolean,
  ): Promise<{modifiedCount: number}> {
    try {
      await this.init();

      if (!questionId || !isValidObjectId(questionId)) {
        throw new BadRequestError('Invalid or missing questionId');
      }
      if (!updates || Object.keys(updates).length === 0) {
        throw new BadRequestError('Updates object cannot be empty');
      }

      const forbiddenFields = ['_id', 'id', 'createdAt', 'updatedAt'];

      if (!addText) {
        forbiddenFields.push('text');
      }

      for (const field of forbiddenFields) {
        delete (updates as any)[field];
      }

      const result = await this.QuestionCollection.updateOne(
        {_id: new ObjectId(questionId)},
        {$set: {...updates, updatedAt: new Date()}},
        {session},
      );

      if (updates.status === 'in-review') {
        const submission = await this.QuestionSubmissionCollection.findOne(
          {questionId: new ObjectId(questionId)},
          {session},
        );

        if (submission) {
          const history = submission.history || [];
          const queue = submission.queue || [];

          const lastHistory = history.at(-1);
          const lastUpdatedById = lastHistory?.updatedBy?.toString();

          if (lastUpdatedById && queue.length > 0) {
            const currentIndex = queue.findIndex(
              (id: any) => id?.toString() === lastUpdatedById,
            );

            // 🔹 If found, remove all users that come after this index
            if (currentIndex !== -1 && currentIndex < queue?.length - 1) {
              const remainingQueue = queue?.slice(0, currentIndex + 1);

              await this.QuestionSubmissionCollection.updateOne(
                {questionId: new ObjectId(questionId)},
                {$set: {queue: remainingQueue}},
                {session},
              );
            }
          }
        }
      }

      return {modifiedCount: result.modifiedCount};
    } catch (error) {
      throw new InternalServerError(
        `Error while updating Question: More info: ${error}`,
      );
    }
  }

  async deleteQuestion(
    questionId: string,
    session?: ClientSession,
  ): Promise<{deletedCount: number}> {
    try {
      await this.init();

      if (!questionId || !isValidObjectId(questionId)) {
        throw new BadRequestError('Invalid or missing questionId');
      }

      const result = await this.QuestionCollection.deleteOne(
        {_id: new ObjectId(questionId)},
        {session},
      );

      return {deletedCount: result.deletedCount};
    } catch (error) {
      throw new InternalServerError(
        `Error while deleting Question::, More/ ${error}`,
      );
    }
  }
}
