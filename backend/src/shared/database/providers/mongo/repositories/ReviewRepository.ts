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
    reRoutedReview?:boolean,
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
      reRoutedReview,
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

  // async findsubmissionHistory(userId: string,
  //   page: number,
  //   limit: number,
  //   session?: ClientSession,){
  //       async getUserActivityHistory(userId: string, page = 1, limit = 20) {
  //   const skip = (Math.max(1, page) - 1) * Math.max(1, limit);

  //   const pipeline: any[] = [
  //     {
  //       $match: {
  //         updatedBy: new ObjectId(userId)
  //       }
  //     },
  //     { $sort: { createdAt: -1 } },
  //     { $skip: skip },
  //     { $limit: limit },

  //     // Get the review document (if any)
  //     {
  //       $lookup: {
  //         from: Collections.Review,
  //         localField: "reviewId",
  //         foreignField: "_id",
  //         as: "review"
  //       }
  //     },
  //     { $unwind: { path: "$review", preserveNullAndEmptyArrays: true } },

  //     // Lookup the main answer referenced in this history
  //     {
  //       $lookup: {
  //         from: Collections.Answer,
  //         localField: "answer",
  //         foreignField: "_id",
  //         as: "answerDoc"
  //       }
  //     },
  //     { $unwind: { path: "$answerDoc", preserveNullAndEmptyArrays: true } },

  //     // Lookup the rejectedAnswer (if any)
  //     {
  //       $lookup: {
  //         from: Collections.Answer,
  //         localField: "rejectedAnswer",
  //         foreignField: "_id",
  //         as: "rejectedAnswerDoc"
  //       }
  //     },
  //     { $unwind: { path: "$rejectedAnswerDoc", preserveNullAndEmptyArrays: true } },

  //     // Lookup the question via answer.questionId (if answer exists)
  //     {
  //       $lookup: {
  //         from: Collections.Question,
  //         localField: "answerDoc.questionId",
  //         foreignField: "_id",
  //         as: "question"
  //       }
  //     },
  //     { $unwind: { path: "$question", preserveNullAndEmptyArrays: true } },

  //     // --- NEW: For author detection: find earliest submissionHistory for the same answer ---
  //     {
  //       $lookup: {
  //         from: Collections.SubmissionHistory,
  //         let: { thisAnswer: "$answer" },
  //         pipeline: [
  //           {
  //             $match: {
  //               $expr: {
  //                 // match when both answers are equal and not null
  //                 $and: [
  //                   { $ne: ["$$thisAnswer", null] },
  //                   { $eq: ["$answer", "$$thisAnswer"] }
  //                 ]
  //               }
  //             }
  //           },
  //           {
  //             $group: {
  //               _id: "$answer",
  //               firstCreatedAt: { $min: "$createdAt" },
  //               firstId: { $first: "$_id" }
  //             }
  //           }
  //         ],
  //         as: "firstHistoryForAnswer"
  //       }
  //     },
  //     // Might be empty if answer is null or no other histories
  //     { $unwind: { path: "$firstHistoryForAnswer", preserveNullAndEmptyArrays: true } },

  //     // Add computed fields and final action mapping
  //     {
  //       $addFields: {
  //         // isAuthor if:
  //         // - there is a firstHistoryForAnswer and this.createdAt == that firstCreatedAt
  //         // OR
  //         // - answer is null and reviewId is null (fallback heuristic)
  //         isAuthor: {
  //           $cond: [
  //             {
  //               $or: [
  //                 {
  //                   $and: [
  //                     { $ne: ["$firstHistoryForAnswer", null] },
  //                     { $eq: ["$createdAt", "$firstHistoryForAnswer.firstCreatedAt"] }
  //                   ]
  //                 },
  //                 {
  //                   $and: [
  //                     { $eq: ["$answer", null] },
  //                     { $eq: ["$reviewId", null] }
  //                   ]
  //                 }
  //               ]
  //             },
  //             true,
  //             false
  //           ]
  //         }
  //       }
  //     },

  //     {
  //       $addFields: {
  //         action: {
  //           $switch: {
  //             branches: [
  //               { case: { $eq: ["$isAuthor", true] }, then: "author" },
  //               { case: { $eq: ["$review.action", "accepted"] }, then: "approved" },
  //               { case: { $eq: ["$review.action", "rejected"] }, then: "rejected" },
  //               { case: { $eq: ["$review.action", "modified"] }, then: "modify" }
  //             ],
  //             default: "created"
  //           }
  //         }
  //       }
  //     },

  //     // Project into the response shape you asked for
  //     {
  //       $project: {
  //         _id: 1,
  //         createdAt: 1,
  //         updatedAt: 1,
  //         action: 1,
  //         reviewType: "$review.reviewType",
  //         reason: "$review.reason",            // reason on review (if any)
  //         remarks: "$answerDoc.remarks",       // remarks if stored on answer
  //         review: {
  //           parameters: "$review.parameters"
  //         },
  //         question: {
  //           _id: "$question._id",
  //           question: "$question.question"
  //         },
  //         answer: {
  //           _id: "$answerDoc._id",
  //           answer: "$answerDoc.answer"
  //         },
  //         rejectedAnswer: {
  //           _id: "$rejectedAnswerDoc._id",
  //           answer: "$rejectedAnswerDoc.answer"
  //         },
  //         // include some raw fields that might be useful for frontend logic:
  //         raw: {
  //           submissionStatus: "$status",
  //           reviewId: "$reviewId",
  //           updatedBy: "$updatedBy"
  //         }
  //       }
  //     }
  //   ];

  //   const results = await this.db
  //     .collection(Collections.SubmissionHistory)
  //     .aggregate(pipeline)
  //     .toArray();

  //   // Convert ObjectId => string recursively
  //   const stringifyIds = (obj: any): any => {
  //     if (obj === null || obj === undefined) return obj;
  //     if (obj instanceof ObjectId) return obj.toString();
  //     if (Array.isArray(obj)) return obj.map(stringifyIds);
  //     if (typeof obj === "object") {
  //       const out: any = {};
  //       for (const [k, v] of Object.entries(obj)) out[k] = stringifyIds(v);
  //       return out;
  //     }
  //     return obj;
  //   };

  //   return results.map((r) => stringifyIds(r));
  // }
  //   }
}
