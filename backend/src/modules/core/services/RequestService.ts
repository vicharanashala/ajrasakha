import {injectable, inject} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {
  BaseService,
  IRequest,
  MongoDatabase,
  RequestStatus,
} from '#root/shared/index.js';
import {
  CreateRequestBodyDto,
  GetAllRequestsQueryDto,
} from '../classes/validators/RequestValidators.js';
import {IRequestRepository} from '#root/shared/database/interfaces/IRequestRepository.js';
import {InternalServerError, UnauthorizedError} from 'routing-controllers';
import {IUserRepository} from '#root/shared/database/interfaces/IUserRepository.js';

@injectable()
export class RequestService extends BaseService {
  constructor(
    @inject(GLOBAL_TYPES.RequestRepository)
    private readonly requestRepository: IRequestRepository,

    @inject(GLOBAL_TYPES.UserRepository)
    private readonly userRepo: IUserRepository,
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
        return this.requestRepository.createRequest(data, userId, session);
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
    userId: string,
  ): Promise<IRequest> {
    try {
      return await this._withTransaction(async session => {
        return this.requestRepository.updateStatus(
          requestId,
          status,
          userId,
          session,
        );
      });
    } catch (error) {
      throw error;
    }
  }
}
