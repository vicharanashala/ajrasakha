// import {injectable, inject} from 'inversify';
// import {GLOBAL_TYPES} from '#root/types.js';
// import {
//   BaseService,
//   IQuestion,
//   IRequest,
//   IRequestResponse,
//   MongoDatabase,
//   RequestStatus,
// } from '#root/shared/index.js';
// import {
//   CreateRequestBodyDto,
//   GetAllRequestsQueryDto,
// } from '../classes/validators/RequestValidators.js';
// import {IRequestRepository} from '#root/shared/database/interfaces/IRequestRepository.js';
// import {
//   BadRequestError,
//   InternalServerError,
//   NotFoundError,
//   UnauthorizedError,
// } from 'routing-controllers';
// import {IUserRepository} from '#root/shared/database/interfaces/IUserRepository.js';
// import {IQuestionRepository} from '#root/shared/database/interfaces/IQuestionRepository.js';

// @injectable()
// export class RequestService extends BaseService {
//   constructor(
//     @inject(GLOBAL_TYPES.RequestRepository)
//     private readonly requestRepository: IRequestRepository,

//     @inject(GLOBAL_TYPES.QuestionRepository)
//     private readonly questionRepo: IQuestionRepository,

//     @inject(GLOBAL_TYPES.UserRepository)
//     private readonly userRepo: IUserRepository,
//     @inject(GLOBAL_TYPES.Database)
//     private readonly mongoDatabase: MongoDatabase,
//   ) {
//     super(mongoDatabase);
//   }

//   async createRequest(
//     data: CreateRequestBodyDto,
//     userId: string,
//   ): Promise<IRequest> {
//     try {
//       return await this._withTransaction(async session => {
//         return this.requestRepository.createRequest(data, userId, session);
//       });
//     } catch (error) {
//       throw new InternalServerError(`Failed to create this request ${error}`);
//     }
//   }

//   async getAllRequests(
//     userId: string,
//     query: GetAllRequestsQueryDto,
//   ): Promise<{
//     requests: (IRequest & {userName: string})[];
//     totalPages: number;
//     totalCount: number;
//   }> {
//     try {
//       return await this._withTransaction(async session => {
//         const user = await this.userRepo.findById(userId, session);
//         if (!user || user.role == 'expert') {
//           throw new UnauthorizedError(
//             `You don't have permission to add question`,
//           );
//         }
//         const {requests, totalPages, totalCount} =
//           await this.requestRepository.getAllRequests(query);

//         const sanitizedRequests: (IRequest & {userName: string})[] =
//           requests.map(req => ({
//             ...req,
//             userName: `${user.firstName} ${user.lastName}`,
//           }));

//         return {
//           requests: sanitizedRequests,
//           totalPages,
//           totalCount,
//         };
//       });
//     } catch (error) {
//       throw error;
//     }
//   }

//   async updateStatus(
//     requestId: string,
//     status: RequestStatus,
//     response: string,
//     userId: string,
//   ): Promise<IRequestResponse> {
//     try {
//       return await this._withTransaction(async session => {
//         const request = await this.requestRepository.getRequestById(requestId);
//         if (!request) throw new NotFoundError(`Failed to get request`);

//         if (request.status == 'approved' || request.status == 'rejected') {
//           throw new BadRequestError('Request already closed!');
//         }

//         if (status == 'approved') {
//           const entityId = request.entityId.toString();
//           if (request.requestType == 'question_flag') {
//             const requestDetails: Partial<IQuestion> = request.details;
//             await this.questionRepo.updateQuestion(
//               entityId,
//               requestDetails,
//               session,
//             );
//           }
//         }
//         return this.requestRepository.updateStatus(
//           requestId,
//           status,
//           response,
//           userId,
//           session,
//         );
//       });
//     } catch (error) {
//       throw error;
//     }
//   }
//   async getRequestDiff(
//     userId: string,
//     requestId: string,
//   ): Promise<{
//     currentDoc: any;
//     existingDoc: any;
//     responses: IRequestResponse[];
//   }> {
//     try {
//       return await this._withTransaction(async session => {
//         const request = await this.requestRepository.getRequestById(requestId);
//         if (!request) {
//           throw new NotFoundError('Request not found');
//         }

//         const responses = request.responses.map(res => {
//           return {
//             ...res,
//             reviewedBy: res.reviewedBy.toString(),
//           };
//         });
//         const entityId = request.entityId.toString();
//         if (request.requestType == 'question_flag') {
//           const question = await this.questionRepo.getById(entityId, session);
//           const requestedDetails = request.details || question;
//           if (!question)
//             throw new NotFoundError(`Question not found for ID: ${entityId}`);

//           const {
//             _id,
//             createdAt,
//             updatedAt,
//             userId,
//             contextId,
//             text,
//             metrics,
//             embedding,
//             ...questionWithoutMeta
//           } = question;
//           const {
//             _id: rid,
//             createdAt: rCreated,
//             updatedAt: rUpdated,
//             userId: rUserId,
//             contextId: rContext,
//             text: rtext,
//             metrics: rMetrics,
//             embedding: rembedding,
//             ...requestedWithoutMeta
//           } = requestedDetails || {};

//           const currentDoc = {...questionWithoutMeta, ...requestedWithoutMeta};
//           const existingDoc = questionWithoutMeta;
//           if ('text' in currentDoc) {
//             delete currentDoc.text;
//           }

//           return {currentDoc, existingDoc, responses};
//         }
//         return {currentDoc: null, existingDoc: null, responses: []};
//       });
//     } catch (error) {
//       throw error;
//     }
//   }
// }



import {injectable, inject} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {
  BaseService,
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
import { INotificationRepository } from '#root/shared/database/interfaces/INotificationRepository.js';

@injectable()
export class RequestService extends BaseService {
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
        const request= this.requestRepository.createRequest(data, userId, session);
        let type = data.details.requestType.toString()
        const moderators = await this.userRepo.findModerators()
        let message =`A new Question Flag raised QuestionId ${data.entityId}`
        let title= "New Flag Raised"
        for(let mod of moderators){
          const notification = await this.notificationRepository.addNotification(mod._id.toString(),data.entityId.toString(),type,message,title)
        }
        return request
      });
    } catch (error) {
      throw new InternalServerError(`Failed to create this request ${error}`);
    }
  }

  async getAllRequests(
    userId: string,
    query: GetAllRequestsQueryDto,
  ): Promise<{
    requests: (IRequest & {userName: string})[];
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

        const sanitizedRequests: (IRequest & {userName: string})[] =
          requests.map(req => ({
            ...req,
            userName: `${user.firstName} ${user.lastName}`,
          }));

        return {
          requests: sanitizedRequests,
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
        return this.requestRepository.updateStatus(
          requestId,
          status,
          response,
          userId,
          session,
        );
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
}
