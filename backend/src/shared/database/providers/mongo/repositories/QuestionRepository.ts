import {IQuestionRepository} from '#root/shared/database/interfaces/IQuestionRepository.js';
import {IQuestion} from '#root/shared/interfaces/models.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject} from 'inversify';
import {ClientSession, Collection, ObjectId} from 'mongodb';
import {MongoDatabase} from '../MongoDatabase.js';
import {isValidObjectId} from '#root/utils/isValidObjectId.js';
import {BadRequestError, InternalServerError} from 'routing-controllers';
import {instanceToPlain, plainToInstance} from 'class-transformer';
import {Question} from '#root/modules/core/classes/transformers/Question.js';
import {QuestionResponse} from '#root/modules/core/classes/validators/QuestionValidators.js';

export class QuestionRepository implements IQuestionRepository {
  private QuestionCollection: Collection<IQuestion>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init() {
    this.QuestionCollection = await this.db.getCollection<IQuestion>(
      'questions',
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

      const uploadData: IQuestion[] = questions.map((question: string) => ({
        question,
        userId: new ObjectId(userId),
        context: new ObjectId(contextId),
        status: 'open',
        totalAnwersCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

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
          totalAnwersCount: 1,
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
