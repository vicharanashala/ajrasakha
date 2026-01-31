// #root/modules/request/interfaces/IRequestService.ts

import {
  IRequest,
  IRequestResponse,
  RequestStatus,
} from '#root/shared/index.js';
import {
  CreateRequestBodyDto,
  GetAllRequestsQueryDto,
} from '../classes/validators/RequestValidators.js';

export interface IRequestService {
  /**
   * Create a new flag / request
   */
  createRequest(
    data: CreateRequestBodyDto,
    userId: string
  ): Promise<IRequest>;

  /**
   * Get paginated list of all requests (moderator/admin)
   */
  getAllRequests(
    userId: string,
    query: GetAllRequestsQueryDto
  ): Promise<{
    requests: IRequest[];
    totalPages: number;
    totalCount: number;
  }>;

  /**
   * Approve / Reject a request
   */
  updateStatus(
    requestId: string,
    status: RequestStatus,
    response: string,
    userId: string
  ): Promise<IRequestResponse>;

  /**
   * Get diff view between requested changes & existing entity
   */
  getRequestDiff(
    userId: string,
    requestId: string
  ): Promise<{
    currentDoc: any;
    existingDoc: any;
    responses: IRequestResponse[];
  }>;

  softDeleteRequest(
    requestId: string,
    userId: string,
  ): Promise<void>;
}

