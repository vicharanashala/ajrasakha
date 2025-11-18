import {ICommentRepository} from '#root/shared/database/interfaces/ICommentRepository.js';
import {BaseService, IComment, INotificationType, MongoDatabase} from '#root/shared/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject} from 'inversify';
import {ClientSession} from 'mongodb';
import {CORE_TYPES} from '../types.js';
import {InternalServerError, NotFoundError} from 'routing-controllers';
import {IAnswerRepository} from '#root/shared/database/interfaces/IAnswerRepository.js';
import {NotificationService} from './NotificationService.js';

export class CommentService extends BaseService {
  constructor(
    @inject(CORE_TYPES.CommentRepository)
    private readonly commentRepo: ICommentRepository,

    @inject(GLOBAL_TYPES.AnswerRepository)
    private readonly answerRepo: IAnswerRepository,

    @inject(GLOBAL_TYPES.NotificationService)
    private readonly notificationService: NotificationService,

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
  ): Promise<{comments: IComment[]; total: number}> {
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
        // need to find the userId from answerId and call

        if (!comment) {
          throw new InternalServerError('Failed to add comment, Try again!');
        }
        const answer = await this.answerRepo.getById(answerId);
        const authourId = answer.authorId.toString();
        let message = `A new Comment has been added to your Answer`;
        let title = 'New Comment added';
        let entityId = questionId.toString();
        const type:INotificationType = 'comment';
        await this.notificationService.saveTheNotifications(message,title,entityId,authourId,type)
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
