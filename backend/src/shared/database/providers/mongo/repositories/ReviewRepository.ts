import { IReviewRepository } from "#root/shared/database/interfaces/IReviewRepository.js";
import { IReview, ReviewAction, ReviewType } from "#root/shared/interfaces/models.js";
import { GLOBAL_TYPES } from "#root/types.js";
import { inject, injectable } from "inversify";
import { Collection, ClientSession, ObjectId } from "mongodb";
import { MongoDatabase } from "../MongoDatabase.js";


@injectable()
export class ReviewRepository implements IReviewRepository {
  private ReviewCollection: Collection<IReview>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase
  ) {}

  private async init() {
    this.ReviewCollection = await this.db.getCollection<IReview>("reviews");
  }

  /**
   * Ensures collection is initialized before each method call.
   */
  private async ensureInit() {
    if (!this.ReviewCollection) {
      await this.init();
    }
  }

  async createReview(
    reviewType: ReviewType,
    action: ReviewAction,
    questionId: string ,
    reviewerId: string ,
    answerId?: string ,
    reason?: string,
    parameters?: any,
    session?: ClientSession
  ): Promise<{ insertedId: string }> {
    await this.ensureInit();

    const newReview: IReview = {
      reviewType,
      action,
      questionId: new ObjectId(questionId),
      reviewerId: new ObjectId(reviewerId),
      answerId: answerId ? new ObjectId(answerId) : undefined,
      reason,
      parameters,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await this.ReviewCollection.insertOne(newReview, { session });

    return { insertedId: result.insertedId.toString() };
  }

  async getReviewsByAnswerId(answerId: string | ObjectId): Promise<IReview[]> {
    await this.ensureInit();
    return this.ReviewCollection.find({
      answerId: new ObjectId(answerId),
    }).toArray();
  }

  async getReviewsByReviewer(reviewerId: string | ObjectId): Promise<IReview[]> {
    await this.ensureInit();
    return this.ReviewCollection.find({
      reviewerId: new ObjectId(reviewerId),
    }).toArray();
  }

  async getReviewsByQuestionId(questionId: string | ObjectId): Promise<IReview[]> {
    await this.ensureInit();
    return this.ReviewCollection.find({
      questionId: new ObjectId(questionId),
    }).toArray();
  }

  async findById(id: string | ObjectId): Promise<IReview | null> {
    await this.ensureInit();
    return this.ReviewCollection.findOne({
      _id: new ObjectId(id),
    });
  }
}
