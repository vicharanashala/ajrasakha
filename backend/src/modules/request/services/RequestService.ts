import {injectable, inject} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {
  BaseService,
  INotificationType,
  IQuestion,
  IRequest,
  IRequestResponse,
  MongoDatabase,
  RequestStatus,
} from '#root/shared/index.js';
import {
  CreateRequestBodyDto,
  GetAllRequestsQueryDto,
} from '../classes/validators/RequestValidators.js';
import {IRequestRepository} from '#root/shared/database/interfaces/IRequestRepository.js';
import {
  BadRequestError,
  InternalServerError,
  NotFoundError,
  UnauthorizedError,
} from 'routing-controllers';
import {IUserRepository} from '#root/shared/database/interfaces/IUserRepository.js';
import {IQuestionRepository} from '#root/shared/database/interfaces/IQuestionRepository.js';
import {INotificationRepository} from '#root/shared/database/interfaces/INotificationRepository.js';
import {notifyUser} from '#root/utils/pushNotification.js';
import { IRequestService } from '../interfaces/IRequestService.js';
import { log } from 'console';

@injectable()
export class RequestService extends BaseService implements IRequestService{
  constructor(
    @inject(GLOBAL_TYPES.RequestRepository)
    private readonly requestRepository: IRequestRepository,

    @inject(GLOBAL_TYPES.QuestionRepository)
    private readonly questionRepo: IQuestionRepository,

    @inject(GLOBAL_TYPES.UserRepository)
    private readonly userRepo: IUserRepository,

    @inject(GLOBAL_TYPES.NotificationRepository)
    private readonly notificationRepository: INotificationRepository,

    @inject(GLOBAL_TYPES.Database)
    private readonly mongoDatabase: MongoDatabase,
  ) {
    super(mongoDatabase);
  }

  async createRequest(
    data: CreateRequestBodyDto,
    userId: string,
  ): Promise<IRequest> {
    try {
      return await this._withTransaction(async session => {
        const request = this.requestRepository.createRequest(
          data,
          userId,
          session,
        );
        let type: INotificationType = 'flag';
        const moderators = await this.userRepo.findModerators();
        let message = `A new Question Flag raised QuestionId ${data.entityId}`;
        let title = 'New Flag Raised';
        for (let mod of moderators) {
          const notification =
            await this.notificationRepository.addNotification(
              mod._id.toString(),
              data.entityId.toString(),
              type,
              message,
              title,
            );
        }
        return request;
      });
    } catch (error) {
      throw new InternalServerError(`Failed to create this request ${error}`);
    }
  }

  async getAllRequests(
    userId: string,
    query: GetAllRequestsQueryDto,
  ): Promise<{
    requests: IRequest[];
    totalPages: number;
    totalCount: number;
  }> {
    try {
      return await this._withTransaction(async session => {
        const user = await this.userRepo.findById(userId, session);
        if (!user || user.role == 'expert') {
          throw new UnauthorizedError(
            `You don't have permission to add question`,
          );
        }
        const {requests, totalPages, totalCount} =
          await this.requestRepository.getAllRequests(query);

        return {
          requests,
          totalPages,
          totalCount,
        };
      });
    } catch (error) {
      throw error;
    }
  }

  async updateStatus(
    requestId: string,
    status: RequestStatus,
    response: string,
    userId: string,
  ): Promise<IRequestResponse> {
    try {
      return await this._withTransaction(async session => {
        const request = await this.requestRepository.getRequestById(requestId);
        if (!request) throw new NotFoundError(`Failed to get request`);

        if (request.status == 'approved' || request.status == 'rejected') {
          throw new BadRequestError('Request already closed!');
        }
        let requestedUserId = request.requestedBy.toString();
        let entityId = request.entityId.toString();
        let title = `Your Flag has Been ${status}`;
        let message = `Response: ${response}`;
        let type: INotificationType = 'flag_response';
        if (status == 'approved') {
          const entityId = request.entityId.toString();
          if (request.requestType == 'question_flag') {
            const requestDetails: Partial<IQuestion> = request.details;
            await this.questionRepo.updateQuestion(
              entityId,
              requestDetails,
              session,
            );
          }
        }
        const result = await this.requestRepository.updateStatus(
          requestId,
          status,
          response,
          userId,
          session,
        );

        await this.notificationRepository.addNotification(
          requestedUserId,
          entityId,
          type,
          message,
          title,
          session,
        );
        const subscription =
          await this.notificationRepository.getSubscriptionByUserId(
            requestedUserId,
          );
        await notifyUser(requestedUserId, title, subscription);
        return result;
      });
    } catch (error) {
      throw error;
    }
  }
  async getRequestDiff(
    userId: string,
    requestId: string,
  ): Promise<{
    currentDoc: any;
    existingDoc: any;
    responses: IRequestResponse[];
  }> {
    try {
      return await this._withTransaction(async session => {
        const request = await this.requestRepository.getRequestById(requestId);
        if (!request) {
          throw new NotFoundError('Request not found');
        }

        const responses = request.responses.map(res => {
          return {
            ...res,
            reviewedBy: res.reviewedBy.toString(),
          };
        });
        const entityId = request.entityId.toString();
        if (request.requestType == 'question_flag') {
          const question = await this.questionRepo.getById(entityId, session);
          const requestedDetails = request.details || question;
          if (!question)
            throw new NotFoundError(`Question not found for ID: ${entityId}`);

          const {
            _id,
            createdAt,
            updatedAt,
            userId,
            contextId,
            text,
            metrics,
            embedding,
            ...questionWithoutMeta
          } = question;
          const {
            _id: rid,
            createdAt: rCreated,
            updatedAt: rUpdated,
            userId: rUserId,
            contextId: rContext,
            text: rtext,
            metrics: rMetrics,
            embedding: rembedding,
            ...requestedWithoutMeta
          } = requestedDetails || {};

          const currentDoc = {...questionWithoutMeta, ...requestedWithoutMeta};
          const existingDoc = questionWithoutMeta;
          if ('text' in currentDoc) {
            delete currentDoc.text;
          }

          return {currentDoc, existingDoc, responses};
        }
        return {currentDoc: null, existingDoc: null, responses: []};
      });
    } catch (error) {
      throw error;
    }
  }

  async softDeleteRequest(
    requestId: string,
    userId: string,
  ): Promise<void> {
    return this._withTransaction(async session => {
      const user = await this.userRepo.findById(userId, session);

      if (!user || user.role !== 'moderator') {
        throw new UnauthorizedError('Only moderators can delete requests');
      }

      const request = await this.requestRepository.getRequestById(
        requestId,
        session,
      );

      log(request);

      if (!request || request.isDeleted) {
        throw new NotFoundError('Request not found');
      }

      await this.requestRepository.softDeleteById(
        requestId,
        userId,
        session,
      );
    });
  }

}
