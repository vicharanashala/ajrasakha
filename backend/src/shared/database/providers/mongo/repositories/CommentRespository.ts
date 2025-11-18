import {ICommentRepository} from '#root/shared/database/interfaces/ICommentRepository.js';
import {IComment} from '#root/shared/interfaces/models.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject} from 'inversify';
import {ClientSession, Collection, ObjectId} from 'mongodb';
import {MongoDatabase} from '../MongoDatabase.js';
import {InternalServerError} from 'routing-controllers';

export class CommentRepository implements ICommentRepository {
  private CommentsCollection: Collection<IComment>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init() {
    this.CommentsCollection = await this.db.getCollection<IComment>('comments');
  }
  // async getComments(
  //   questionId: string,
  //   answerId: string,
  //   page: number,
  //   limit: number,
  //   session?: ClientSession,
  // ): Promise<IComment[]> {
  //   await this.init();
  //   const skip = (page - 1) * limit;

  //   try {
  //     const comments = await this.CommentsCollection.aggregate(
  //       [
  //         {
  //           $match: {
  //             questionId: new ObjectId(questionId),
  //             answerId: new ObjectId(answerId),
  //           },
  //         },
  //         {
  //           $lookup: {
  //             from: 'users',
  //             localField: 'userId',
  //             foreignField: '_id',
  //             as: 'userInfo',
  //           },
  //         },
  //         {
  //           $unwind: {
  //             path: '$userInfo',
  //             preserveNullAndEmptyArrays: true, // keeps comments even if user missing
  //           },
  //         },
  //         {
  //           $project: {
  //             _id: {$toString: '$_id'},
  //             questionId: {$toString: '$questionId'},
  //             answerId: {$toString: '$answerId'},
  //             userId: {$toString: '$userId'},
  //             text: 1,
  //             createdAt: 1,
  //             updatedAt: 1,
  //             userName: {
  //               $trim: {
  //                 input: {
  //                   $ifNull: [
  //                     {
  //                       $concat: [
  //                         {$ifNull: ['$userInfo.firstName', '']},
  //                         ' ',
  //                         {$ifNull: ['$userInfo.lastName', '']},
  //                       ],
  //                     },
  //                     'Unknown User',
  //                   ],
  //                 },
  //               },
  //             },
  //           },
  //         },
  //         {$sort: {createdAt: -1}},
  //         {$skip: skip},
  //         {$limit: limit},
  //       ],
  //       {session},
  //     ).toArray();

  //     return comments as IComment[];
  //   } catch (err: any) {
  //     console.error(
  //       `Error fetching comments for question ${questionId} and answer ${answerId}:`,
  //       err,
  //     );
  //     throw new InternalServerError('Failed to fetch comments');
  //   }
  // }

  async getComments(
    questionId: string,
    answerId: string,
    page: number,
    limit: number,
    session?: ClientSession,
  ): Promise<{comments: IComment[]; total: number}> {
    await this.init();
    const skip = (page - 1) * limit;

    try {
      const result = await this.CommentsCollection.aggregate(
        [
          {
            $match: {
              questionId: new ObjectId(questionId),
              answerId: new ObjectId(answerId),
            },
          },

          {
            $facet: {
              data: [
                {
                  $lookup: {
                    from: 'users',
                    localField: 'userId',
                    foreignField: '_id',
                    as: 'userInfo',
                  },
                },
                {
                  $unwind: {
                    path: '$userInfo',
                    preserveNullAndEmptyArrays: true,
                  },
                },
                {
                  $project: {
                    _id: {$toString: '$_id'},
                    questionId: {$toString: '$questionId'},
                    answerId: {$toString: '$answerId'},
                    userId: {$toString: '$userId'},
                    text: 1,
                    createdAt: 1,
                    updatedAt: 1,
                    userName: {
                      $trim: {
                        input: {
                          $ifNull: [
                            {
                              $concat: [
                                {$ifNull: ['$userInfo.firstName', '']},
                                ' ',
                                {$ifNull: ['$userInfo.lastName', '']},
                              ],
                            },
                            'Unknown User',
                          ],
                        },
                      },
                    },
                  },
                },
                {$sort: {createdAt: -1}},
                {$skip: skip},
                {$limit: limit},
              ],

              totalCount: [{$count: 'count'}],
            },
          },
        ],
        {session},
      ).toArray();

      const comments = result[0].data;
      const total = result[0].totalCount[0]?.count || 0;

      return {comments, total};
    } catch (err) {
      console.error(`Error fetching comments:`, err);
      throw new InternalServerError('Failed to fetch comments');
    }
  }

  async addComment(
    questionId: string,
    answerId: string,
    text: string,
    userId: string,
    session?: ClientSession,
  ): Promise<{insertedId: string}> {
    await this.init();
    const newComment: IComment = {
      questionId: new ObjectId(questionId),
      answerId: new ObjectId(answerId),
      text,
      userId: new ObjectId(userId),
      createdAt: new Date(),
    };

    try {
      const result = await this.CommentsCollection.insertOne(newComment, {
        session,
      });

      if (!result.insertedId) {
        throw new Error('Failed to insert comment');
      }
      return {insertedId: result.insertedId.toString()};
    } catch (err: any) {
      console.error(
        `Error adding comment for question ${questionId} and answer ${answerId}:`,
        err,
      );
      throw new InternalServerError('Failed to add comment');
    }
  }
}
