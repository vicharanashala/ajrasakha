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
import { InternalServerError } from 'routing-controllers';

@injectable()
export class RequestService extends BaseService {
  constructor(
    @inject(GLOBAL_TYPES.RequestRepository)
    private readonly requestRepository: IRequestRepository,
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
  ): Promise<{data: IRequest[]; totalPages: number; totalCount: number}> {
    try {
      return await this._withTransaction(async session => {
        return this.requestRepository.getAllRequests(userId, query, session);
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
