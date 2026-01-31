import {
  CreateRequestBodyDto,
  GetAllRequestsQueryDto,
} from '#root/modules/request/classes/validators/RequestValidators.js';
import {IRequest, IRequestResponse, RequestStatus} from '#root/shared/index.js';
import {ClientSession} from 'mongodb';

export interface IRequestRepository {
  /**
   * Creates a new request for a user.
   * @param data - Data for creating the request.
   * @param userId - ID of the user creating the request.
   * @param session - Optional mongoose session for transactions.
   * @returns A promise resolving to the created request.
   */
  createRequest(
    data: CreateRequestBodyDto,
    userId: string,
    session?: ClientSession,
  ): Promise<IRequest>;

  /**
   * Retrieves all requests for a user.
   * @param query - fiter options.
   * @param session - Optional mongoose session for transactions.
   * @returns A promise resolving to an array of requests.
   */
  getAllRequests(
    query: GetAllRequestsQueryDto,
    session?: ClientSession,
  ): Promise<{requests: IRequest[]; totalPages: number; totalCount: number}>;

  /**
   * Retrieves  requests by id.
   * @param requestId - request id
   * @param session - Optional mongoose session for transactions.
   * @returns A promise resolving to an array of requests.
   */
  getRequestById(
    requestId: string,
    session?: ClientSession,
  ): Promise<IRequest | null>;

  /**
   * Updates the status of a request.
   * @param requestId - ID of the request to update.
   * @param status - New status for the request.
   * @param userId - ID of the user performing the update.
   * @param session - Optional mongoose session for transactions.
   * @returns A promise resolving to the updated response.
   */
  updateStatus(
    requestId: string,
    status: RequestStatus,
    response:string,
    userId: string,
    session?: ClientSession,
  ): Promise<IRequestResponse>;

  /**
   * @param userId - ID of the user performing the update.
   * @param session - Optional mongoose session for transactions.
   * @returns A promise resolving to the updated request.
   */
  deleteByEntityId(entityId: string, session?: ClientSession): Promise<void>;


  softDeleteById(
  requestId: string,
  deletedBy: string,
  session?: ClientSession,
): Promise<void>;
}


