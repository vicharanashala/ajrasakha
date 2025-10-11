import {
  CreateRequestBodyDto,
  GetAllRequestsQueryDto,
} from '#root/modules/core/classes/validators/RequestValidators.js';
import {IRequest, RequestStatus} from '#root/shared/index.js';
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
   * @param userId - ID of the user whose requests are fetched.
   * @param query - fiter options.
   * @param session - Optional mongoose session for transactions.
   * @returns A promise resolving to an array of requests.
   */
  getAllRequests(
    userId: string,
    query: GetAllRequestsQueryDto,
    session?: ClientSession,
  ): Promise<{data: IRequest[]; totalPages: number; totalCount: number}>;

  /**
   * Updates the status of a request.
   * @param requestId - ID of the request to update.
   * @param status - New status for the request.
   * @param userId - ID of the user performing the update.
   * @param session - Optional mongoose session for transactions.
   * @returns A promise resolving to the updated request.
   */
  updateStatus(
    requestId: string,
    status: RequestStatus,
    userId: string,
    session?: ClientSession,
  ): Promise<IRequest>;

  /**
   * @param userId - ID of the user performing the update.
   * @param session - Optional mongoose session for transactions.
   * @returns A promise resolving to the updated request.
   */
  deleteByEntityId(entityId: string, session?: ClientSession): Promise<void>;
}
