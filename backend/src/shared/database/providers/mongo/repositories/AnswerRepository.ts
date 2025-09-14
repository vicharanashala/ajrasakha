import {IAnswer} from '#root/shared/interfaces/models.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject} from 'inversify';
import {ClientSession, Collection, ObjectId} from 'mongodb';
import {MongoDatabase} from '../MongoDatabase.js';
import {isValidObjectId} from '#root/utils/isValidObjectId.js';
import {BadRequestError, InternalServerError} from 'routing-controllers';
import {IAnswerRepository} from '#root/shared/database/interfaces/IAnswerRepository.js';

export class AnswerRepository implements IAnswerRepository {
  private answersCollection: Collection<IAnswer>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init() {
    this.answersCollection = await this.db.getCollection<IAnswer>('answers');
  }

  async addAnswer(
    questionId: string,
    authorId: string,
    answer: string,
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
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await this.answersCollection.insertOne(doc, {session});

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

      const answers = await this.answersCollection
        .find({questionId: new ObjectId(questionId)}, {session})
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

      const answer = await this.answersCollection.findOne(
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
      return await this.answersCollection.findOne(
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

      const result = await this.answersCollection.updateOne(
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

      const result = await this.answersCollection.deleteOne(
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
}
