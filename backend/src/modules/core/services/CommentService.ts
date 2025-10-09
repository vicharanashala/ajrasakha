import {ICommentRepository} from '#root/shared/database/interfaces/ICommentRepository.js';
import {BaseService, IComment, MongoDatabase} from '#root/shared/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject} from 'inversify';
import {ClientSession} from 'mongodb';
import {CORE_TYPES} from '../types.js';
import {InternalServerError, NotFoundError} from 'routing-controllers';

export class CommentService extends BaseService {
  constructor(
    @inject(CORE_TYPES.CommentRepository)
    private readonly commentRepo: ICommentRepository,

    @inject(GLOBAL_TYPES.Database)
    private readonly mongoDatabase: MongoDatabase,
  ) {
    super(mongoDatabase);
  }

  async getComments(
    questionId: string,
    answerId: string,
    page: number,
    limit: number,
  ): Promise<IComment[]> {
    try {
      const comments = await this._withTransaction(
        async (session: ClientSession) => {
          return this.commentRepo.getComments(
            questionId,
            answerId,
            page,
            limit,
            session,
          );
        },
      );

      return comments;
    } catch (err: any) {
      console.error(
        `Error fetching comments for question ${questionId} and answer ${answerId}:`,
        err,
      );
      throw new InternalServerError('Failed to fetch comments');
    }
  }

  async addComment(
    questionId: string,
    answerId: string,
    text: string,
    userId: string,
  ): Promise<boolean> {
    try {
      await this._withTransaction(async (session: ClientSession) => {
        const comment = await this.commentRepo.addComment(
          questionId,
          answerId,
          text,
          userId,
          session,
        );

        if (!comment) {
          throw new InternalServerError('Failed to add comment, Try again!');
        }
      });
      return true;
    } catch (err: any) {
      console.error(
        `Error adding comment for question ${questionId} and answer ${answerId}:`,
        err,
      );
      throw new InternalServerError('Failed to add comment');
    }
  }
}
