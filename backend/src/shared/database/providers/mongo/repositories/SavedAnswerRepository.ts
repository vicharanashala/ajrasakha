import { inject } from 'inversify';
import { ClientSession, Collection, ObjectId } from 'mongodb';
import { MongoDatabase } from '../MongoDatabase.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { isValidObjectId } from '#root/utils/isValidObjectId.js';
import { BadRequestError, InternalServerError } from 'routing-controllers';
import { ISavedAnswer, ISavedAnswerRepository } from '#root/shared/database/interfaces/ISavedAnswerRepository.js';

export class SavedAnswerRepository implements ISavedAnswerRepository {
  private SavedAnswerCollection: Collection<ISavedAnswer>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init() {
    this.SavedAnswerCollection = await this.db.getCollection<ISavedAnswer>('saved_answers');
  }

  async saveAnswer(
    userId: string,
    answerId: string,
    note?: string,
    session?: ClientSession,
  ): Promise<{ insertedId: string }> {
    try {
      await this.init();

      if (!userId || !isValidObjectId(userId)) {
        throw new BadRequestError('Invalid or missing userId');
      }
      if (!answerId || !isValidObjectId(answerId)) {
        throw new BadRequestError('Invalid or missing answerId');
      }

      // Avoid duplicate bookmarks of the same answer by the same user
      const existing = await this.SavedAnswerCollection.findOne(
        { userId: new ObjectId(userId), answerId: new ObjectId(answerId) },
        { session },
      );
      if (existing) {
        return { insertedId: existing._id!.toString() };
      }

      const doc: ISavedAnswer = {
        userId: new ObjectId(userId),
        answerId: new ObjectId(answerId),
        note,
        createdAt: new Date(),
      };

      const result = await this.SavedAnswerCollection.insertOne(doc as any, { session });
      return { insertedId: result.insertedId.toString() };
    } catch (error) {
      throw new InternalServerError(`Error while saving answer, More/ ${error}`);
    }
  }

  async getSavedAnswers(userId: string, session?: ClientSession): Promise<any[]> {
    try {
      await this.init();

      if (!userId || !isValidObjectId(userId)) {
        throw new BadRequestError('Invalid or missing userId');
      }

      const results = await this.SavedAnswerCollection.aggregate(
        [
          { $match: { userId: new ObjectId(userId) } },
          {
            $lookup: {
              from: 'answers',
              localField: 'answerId',
              foreignField: '_id',
              as: 'answer',
            },
          },
          { $unwind: { path: '$answer', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'questions',
              localField: 'answer.questionId',
              foreignField: '_id',
              as: 'question',
            },
          },
          { $unwind: { path: '$question', preserveNullAndEmptyArrays: true } },
          { $sort: { createdAt: -1 } },
        ],
        { session },
      ).toArray();

      return results.map(r => ({
        _id: r._id?.toString(),
        note: r.note,
        createdAt: r.createdAt,
        answer: r.answer
          ? {
              _id: r.answer._id?.toString(),
              answer: r.answer.answer,
              sources: r.answer.sources,
              isFinalAnswer: r.answer.isFinalAnswer,
            }
          : null,
        question: r.question
          ? { _id: r.question._id?.toString(), text: r.question.question }
          : null,
      }));
    } catch (error) {
      throw new InternalServerError(`Failed to fetch saved answers, More/ ${error}`);
    }
  }

  async removeSavedAnswer(
    userId: string,
    savedAnswerId: string,
    session?: ClientSession,
  ): Promise<{ deletedCount: number }> {
    try {
      await this.init();

      if (!savedAnswerId || !isValidObjectId(savedAnswerId)) {
        throw new BadRequestError('Invalid or missing savedAnswerId');
      }

      const result = await this.SavedAnswerCollection.deleteOne(
        { _id: new ObjectId(savedAnswerId), userId: new ObjectId(userId) },
        { session },
      );
      return { deletedCount: result.deletedCount };
    } catch (error) {
      throw new InternalServerError(`Error while removing saved answer, More/ ${error}`);
    }
  }

  async isAlreadySaved(userId: string, answerId: string, session?: ClientSession): Promise<boolean> {
    await this.init();
    const existing = await this.SavedAnswerCollection.findOne(
      { userId: new ObjectId(userId), answerId: new ObjectId(answerId) },
      { session },
    );
    return !!existing;
  }
}