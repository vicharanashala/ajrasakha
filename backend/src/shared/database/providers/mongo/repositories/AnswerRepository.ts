import {IAnswer} from '#root/shared/interfaces/models.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject} from 'inversify';
import {ClientSession, Collection, ObjectId} from 'mongodb';
import {MongoDatabase} from '../MongoDatabase.js';
import {isValidObjectId} from '#root/utils/isValidObjectId.js';
import {BadRequestError, InternalServerError} from 'routing-controllers';
import {IAnswerRepository} from '#root/shared/database/interfaces/IAnswerRepository.js';
import {SubmissionResponse} from '#root/modules/core/classes/validators/AnswerValidators.js';

export class AnswerRepository implements IAnswerRepository {
  private AnswerCollection: Collection<IAnswer>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init() {
    this.AnswerCollection = await this.db.getCollection<IAnswer>('answers');
  }

  async addAnswer(
    questionId: string,
    authorId: string,
    answer: string,
    sources: string[],
    embedding: number[],
    isFinalAnswer: boolean = false,
    answerIteration: number = 1,
    session?: ClientSession,
  ): Promise<{insertedId: string}> {
    try {
      await this.init();

      if (!questionId || !isValidObjectId(questionId)) {
        throw new BadRequestError('Invalid or missing questionId');
      }
      if (!authorId || !isValidObjectId(authorId)) {
        throw new BadRequestError('Invalid or missing authorId');
      }
      if (!answer || typeof answer !== 'string') {
        throw new BadRequestError('Answer must be a non-empty string');
      }

      const doc: IAnswer = {
        questionId: new ObjectId(questionId),
        authorId: new ObjectId(authorId),
        answer,
        isFinalAnswer,
        answerIteration,
        approvalCount: 0,
        embedding,
        sources,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await this.AnswerCollection.insertOne(doc, {session});

      return {insertedId: result.insertedId.toString()};
    } catch (error) {
      throw new InternalServerError(
        `Error while adding answer, More/ ${error}`,
      );
    }
  }

  async getByQuestionId(
    questionId: string,
    session?: ClientSession,
  ): Promise<Partial<IAnswer>[]> {
    try {
      await this.init();

      if (!questionId || !isValidObjectId(questionId)) {
        throw new BadRequestError('Invalid or missing questionId');
      }

      const answers = await this.AnswerCollection.find(
        {questionId: new ObjectId(questionId)},
        {session},
      )
        .sort({createdAt: 1})
        .toArray();

      return answers.map(a => ({
        _id: a._id?.toString(),
        answer: a.answer,
        isFinalAnswer: a.isFinalAnswer,
        createdAt: a.createdAt,
      }));
    } catch (error) {
      throw new InternalServerError(`Failed to fetch answers, More/ ${error}`);
    }
  }
  async getById(answerId: string, session?: ClientSession): Promise<IAnswer> {
    try {
      await this.init();

      if (!answerId || !isValidObjectId(answerId)) {
        throw new BadRequestError('Invalid or missing answerId');
      }

      const answer = await this.AnswerCollection.findOne(
        {
          _id: new ObjectId(answerId),
        },
        {session},
      );
      return {
        ...answer,
        _id: answer._id?.toString(),
        questionId: answer.questionId?.toString(),
        authorId: answer.authorId?.toString(),
      };
    } catch (error) {
      throw new InternalServerError(`Failed to fetch answers, More/ ${error}`);
    }
  }

  async getByAuthorId(
    authorId: string,
    questionId: string,
    session?: ClientSession,
  ): Promise<IAnswer | null> {
    try {
      await this.init();

      return await this.AnswerCollection.findOne(
        {
          authorId: new ObjectId(authorId),
          questionId: new ObjectId(questionId),
        },
        {session},
      );
    } catch (error) {
      throw new InternalServerError(`Failed to fetch answer, More/ ${error}`);
    }
  }

  async getAllSubmissions(
    userId: string,
    page: number,
    limit: number,
    session?: ClientSession,
  ): Promise<SubmissionResponse[]> {
    try {
      await this.init();
      const skip = (page - 1) * limit;

      const submissions = await this.AnswerCollection.aggregate([
        {$match: {authorId: new ObjectId(userId)}},
        {
          $lookup: {
            from: 'questions',
            localField: 'questionId',
            foreignField: '_id',
            as: 'question',
          },
        },
        {$unwind: '$question'},
        {
          $group: {
            _id: '$question._id',
            text: {$first: '$question.question'},
            createdAt: {$first: '$question.createdAt'},
            updatedAt: {$first: '$question.updatedAt'},
            totalAnswersCount: {$sum: 1},
            responses: {
              $push: {
                answer: '$answer',
                id: {$toString: '$_id'},
                isFinalAnswer: '$isFinalAnswer',
                createdAt: '$createdAt',
              },
            },
          },
        },
        {$sort: {createdAt: -1}},
        {$skip: skip},
        {$limit: limit},
      ]).toArray();

      return submissions.map(sub => ({
        id: sub._id.toString(),
        text: sub.text,
        createdAt: sub.createdAt.toISOString(),
        updatedAt: sub.updatedAt.toISOString(),
        totalAnwersCount: sub.totalAnswersCount,
        reponse: sub.responses[0],
      }));
    } catch (error) {
      throw new InternalServerError(`Failed to fetch submissions: ${error}`);
    }
  }

  async updateAnswer(
    answerId: string,
    updates: Partial<IAnswer>,
    session?: ClientSession,
  ): Promise<{modifiedCount: number}> {
    try {
      await this.init();

      if (!answerId || !isValidObjectId(answerId)) {
        throw new BadRequestError('Invalid or missing answerId');
      }
      if (!updates || Object.keys(updates).length === 0) {
        throw new BadRequestError('Updates object cannot be empty');
      }

      const result = await this.AnswerCollection.updateOne(
        {_id: new ObjectId(answerId)},
        {$set: {...updates, updatedAt: new Date()}},
        {session},
      );

      return {modifiedCount: result.modifiedCount};
    } catch (error) {
      throw new InternalServerError(
        `Error while updating answer, More/ ${error}`,
      );
    }
  }

  async deleteAnswer(
    answerId: string,
    session?: ClientSession,
  ): Promise<{deletedCount: number}> {
    try {
      await this.init();

      if (!answerId || !isValidObjectId(answerId)) {
        throw new BadRequestError('Invalid or missing answerId');
      }

      const result = await this.AnswerCollection.deleteOne(
        {_id: new ObjectId(answerId)},
        {session},
      );

      return {deletedCount: result.deletedCount};
    } catch (error) {
      throw new InternalServerError(
        `Error while deleting answer, More/ ${error}`,
      );
    }
  }

  async deleteByQuestionId(
    questionId: string,
    session?: ClientSession,
  ): Promise<void> {
    try {
      await this.init();
      await this.AnswerCollection.deleteMany(
        {questionId: new ObjectId(questionId)},
        {session},
      );
    } catch (error) {
      throw new InternalServerError(
        `Error while deleting answer, More/ ${error}`,
      );
    }
  }
}
