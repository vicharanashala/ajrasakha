import {IQuestionRepository} from '#root/shared/database/interfaces/IQuestionRepository.js';
import {
  IAnswer,
  IQuestion,
  IQuestionSubmission,
  IUser,
} from '#root/shared/interfaces/models.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject} from 'inversify';
import {ClientSession, Collection, ObjectId} from 'mongodb';
import {MongoDatabase} from '../MongoDatabase.js';
import {isValidObjectId} from '#root/utils/isValidObjectId.js';
import {BadRequestError, InternalServerError} from 'routing-controllers';
import {QuestionResponse} from '#root/modules/core/classes/validators/QuestionValidators.js';

import {GetDetailedQuestionsQuery} from '#root/modules/core/classes/validators/ContextValidators.js';
import {detailsArray, sources} from '#root/modules/core/utils/questionGen.js';

export class QuestionRepository implements IQuestionRepository {
  private QuestionCollection: Collection<IQuestion>;
  private QuestionSubmissionCollection: Collection<IQuestionSubmission>;
  private UsersCollection!: Collection<IUser>;
  private AnswersCollection: Collection<IAnswer>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init() {
    this.QuestionCollection = await this.db.getCollection<IQuestion>(
      'questions',
    );
    this.QuestionSubmissionCollection =
      await this.db.getCollection<IQuestionSubmission>('question_submissions');
    this.UsersCollection = await this.db.getCollection<IUser>('users');
    this.AnswersCollection = await this.db.getCollection<IAnswer>('answers');
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

        return {
          question,
          userId: new ObjectId(userId),
          context: new ObjectId(contextId),
          status: 'open',
          details: randomDetails,
          source: randomSource,
          totalAnswersCount: 0,
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
  async addQuestion(
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

      const newQuestion: IQuestion = {
        question,
        userId: new ObjectId(userId),
        context: new ObjectId(contextId),
        status: 'open',
        details: randomDetails,
        source: randomSource,
        totalAnswersCount: 0,
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
        context: q.context?.toString(),
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

      const formattedQuestion: IQuestion = {
        ...question,
        _id: question._id?.toString(),
        userId: question.userId?.toString(),
        context: question.context?.toString(),
      };

      return formattedQuestion;
    } catch (error) {
      throw new InternalServerError(`Failed to get Question:, More/ ${error}`);
    }
  }

  async findDetailedQuestions(
    query: GetDetailedQuestionsQuery,
  ): Promise<IQuestion[]> {
    try {
      await this.init();

      const {
        search,
        status,
        source,
        state,
        crop,
        answersCountMin,
        answersCountMax,
        dateRange,
        page = 1,
        limit = 10,
      } = query;

      const filter: any = {};

      // --- Filters ---
      if (status && status !== 'all') filter.status = status;
      if (source && source !== 'all') filter.source = source;
      if (state && state !== 'all') filter['details.state'] = state;
      if (crop && crop !== 'all') filter['details.crop'] = crop;

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

      // --- Search filter ---
      if (search) {
        filter.$or = [
          {question: {$regex: search, $options: 'i'}},
          {'details.crop': {$regex: search, $options: 'i'}},
          {'details.state': {$regex: search, $options: 'i'}},
        ];
      }

      // --- Paginated data ---
      const result = await this.QuestionCollection.find(filter)
        .sort({createdAt: -1})
        .skip((page - 1) * limit)
        .limit(limit)
        .project({userId: 0, updatedAt: 0, context: 0})
        .toArray();

      // --- Convert ObjectIds to string ---
      const formattedQuestions: IQuestion[] = result.map((q: any) => ({
        ...q,
        _id: q._id.toString(),
        details: {...q.details},
      }));

      return formattedQuestions;
    } catch (error) {
      throw new InternalServerError(`Failed to get Questions: ${error}`);
    }
  }

  async getUnAnsweredQuestions(
    userId: string,
    page = 1,
    limit = 10,
    filter: 'newest' | 'oldest' | 'leastResponses' | 'mostResponses',
    session?: ClientSession,
  ): Promise<QuestionResponse[]> {
    try {
      await this.init();

      const skip = (page - 1) * limit;

      const pipeline: any = [
        {
          $match: {status: 'open'},
        },
        {
          $lookup: {
            from: 'answers',
            let: {questionId: '$_id'},
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      {$eq: ['$questionId', '$$questionId']},
                      {$eq: ['$authorId', new ObjectId(userId)]},
                    ],
                  },
                },
              },
            ],
            as: 'userAnswers',
          },
        },
        {
          $match: {userAnswers: {$size: 0}},
        },
      ];

      if (filter === 'newest') {
        pipeline.push({$sort: {createdAt: -1}});
      } else if (filter === 'oldest') {
        pipeline.push({$sort: {createdAt: 1}});
      } else if (filter === 'leastResponses') {
        pipeline.push({$sort: {totalAnwersCount: 1}});
      } else if (filter === 'mostResponses') {
        pipeline.push({$sort: {totalAnwersCount: -1}});
      }

      // Pagination
      pipeline.push({$skip: skip});
      pipeline.push({$limit: limit});
      // Projection.
      pipeline.push({
        $project: {
          id: {$toString: '$_id'},
          text: '$question',
          createdAt: {
            $dateToString: {format: '%d-%m-%Y %H:%M:%S', date: '$createdAt'},
          },
          updatedAt: {
            $dateToString: {format: '%d-%m-%Y %H:%M:%S', date: '$updatedAt'},
          },
          totalAnswersCount: 1,
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
      // 1️⃣ Fetch the question
      const question = await this.QuestionCollection.findOne(
        {
          _id: questionObjectId,
        },
        {projection: {context: 0, userId: 0}},
      );
      if (!question) return null;

      // 2️⃣ Fetch submissions for this question
      const submission = await this.QuestionSubmissionCollection.findOne({
        questionId: questionObjectId,
      });

      // 3️⃣ Collect all user IDs for lastRespondedBy
      const lastRespondedId = submission?.lastRespondedBy?.toString();

      // 4️⃣ Collect all updatedBy and answer IDs from submission histories
      const allUpdatedByIds: ObjectId[] = [];
      const allAnswerIds: ObjectId[] = [];

      submission.history.forEach(h => {
        if (h.updatedBy) allUpdatedByIds.push(h.updatedBy as ObjectId);
        if (h.answer) allAnswerIds.push(h.answer as ObjectId);
      });

      // 5️⃣ Fetch all related users
      const users = await this.UsersCollection.find({
        _id: {$in: [lastRespondedId, ...allUpdatedByIds]},
      }).toArray();

      const usersMap = new Map(users.map(u => [u._id?.toString(), u]));

      // 6️⃣ Fetch all related answers
      const answers = await this.AnswersCollection.find({
        _id: {$in: allAnswerIds},
      }).toArray();

      const answersMap = new Map(answers.map(a => [a._id?.toString(), a]));
      const isAlreadySubmitted = allUpdatedByIds
        .map(id => id.toString())
        .includes(userId);

      // 7️⃣ Populate submissions manually
      const populatedSubmissions = {
        _id: submission._id?.toString(),
        questionId: submission.questionId?.toString(),
        lastRespondedBy: lastRespondedId
          ? {
              _id: submission.lastRespondedBy?.toString(),
              name: usersMap.get(lastRespondedId)?.firstName,
              email: usersMap.get(submission.lastRespondedBy?.toString())
                ?.email,
            }
          : null,
        history: submission.history.map(h => ({
          updatedBy: h.updatedBy
            ? {
                _id: h.updatedBy?.toString(),
                name: usersMap.get(h.updatedBy?.toString())?.firstName,
                email: usersMap.get(h.updatedBy?.toString())?.email,
              }
            : null,
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
                threshold: answersMap.get(h.answer?.toString())?.threshold,
                createdAt: answersMap.get(h.answer?.toString())?.createdAt,
                updatedAt: answersMap.get(h.answer?.toString())?.updatedAt,
              }
            : null,
          isFinalAnswer: h.isFinalAnswer,
          updatedAt: h.updatedAt,
        })),
        createdAt: submission.createdAt,
        updatedAt: submission.updatedAt,
      };
      
      // 8️⃣ Final assembled question
      const result = {
        ...question,
        _id: question._id?.toString(),
        userId: question.userId?.toString(),
        isAlreadySubmitted,
        submissions: populatedSubmissions,
      };

      return result;
    } catch (error) {
      throw new InternalServerError(
        `Failed to fetch full question data: ${error}`,
      );
    }
  }

  async updateQuestion(
    questionId: string,
    updates: Partial<IQuestion>,
    session?: ClientSession,
  ): Promise<{modifiedCount: number}> {
    try {
      await this.init();

      if (!questionId || !isValidObjectId(questionId)) {
        throw new BadRequestError('Invalid or missing questionId');
      }
      if (!updates || Object.keys(updates).length === 0) {
        throw new BadRequestError('Updates object cannot be empty');
      }

      const result = await this.QuestionCollection.updateOne(
        {_id: new ObjectId(questionId)},
        {$set: {...updates, updatedAt: new Date()}},
        {session},
      );

      return {modifiedCount: result.modifiedCount};
    } catch (error) {
      throw new InternalServerError(
        `Error while updating Question:, More/ ${error}`,
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
