import { IFeedbackRepository } from '#root/shared/database/interfaces/IFeedbackRepository.js';
import { IFeedback } from '#root/shared/interfaces/models.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { inject } from 'inversify';
import { ClientSession, Collection, ObjectId } from 'mongodb';
import { MongoDatabase } from '../MongoDatabase.js';

export class FeedbackRepository implements IFeedbackRepository {
  private FeedbacksCollection: Collection<IFeedback>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init() {
    this.FeedbacksCollection = await this.db.getCollection<IFeedback>('feedbacks');
  }

  /**
   * Creates a new feedback entry in the feedbacks collection.
   */
  async create(
    feedback: Omit<IFeedback, '_id'>,
    session?: ClientSession,
  ): Promise<IFeedback> {
    await this.init();
    
    const now = new Date();
    const feedbackWithTimestamp: IFeedback = {
      ...feedback,
      createdAt: now,
    };

    const result = await this.FeedbacksCollection.insertOne(
      feedbackWithTimestamp as any,
      { session },
    );

    return {
      ...feedbackWithTimestamp,
      _id: result.insertedId,
    };
  }

  /**
   * Finds feedbacks by question ID.
   */
  async findByQuestionId(
    questionId: string,
    session?: ClientSession,
  ): Promise<IFeedback[]> {
    await this.init();
    
    return this.FeedbacksCollection
      .find(
        { questionId: new ObjectId(questionId) } as any,
        { session },
      )
      .toArray();
  }

  /**
   * Finds a feedback by its ID.
   */
  async findById(
    feedbackId: string,
    session?: ClientSession,
  ): Promise<IFeedback | null> {
    await this.init();
    
    return this.FeedbacksCollection.findOne(
      { _id: new ObjectId(feedbackId) } as any,
      { session },
    );
  }
}