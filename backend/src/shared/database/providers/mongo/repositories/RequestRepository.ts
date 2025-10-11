import {inject, injectable} from 'inversify';
import {IRequest, MongoDatabase, RequestStatus} from '#root/shared/index.js';
import {IRequestRepository} from '#root/shared/database/interfaces/IRequestRepository.js';
import {
  CreateRequestBodyDto,
  GetAllRequestsQueryDto,
} from '#root/modules/core/classes/validators/RequestValidators.js';
import {ClientSession, Collection, ObjectId} from 'mongodb';
import {InternalServerError} from 'routing-controllers';
import {GLOBAL_TYPES} from '#root/types.js';

@injectable()
export class RequestRepository implements IRequestRepository {
  private RequestCollection: Collection<IRequest>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init() {
    this.RequestCollection = await this.db.getCollection<IRequest>('requests');
  }

  async createRequest(
    data: CreateRequestBodyDto,
    userId: string,
    session?: ClientSession,
  ): Promise<IRequest> {
    try {
      await this.init();

      const {entityId, reason, details} = data;

      const requestType: 'others' | 'question_flag' =
        details?.requestType || 'others';

      let cleanedDetails: any = details;

      if (
        details &&
        typeof details === 'object' &&
        'details' in details &&
        details.details
      ) {
        const {_id, id, createdAt, text, updatedAt, requestType, ...rest} =
          details.details as Record<string, any>;
        cleanedDetails =
          requestType === 'question_flag' ? {...rest} : {...rest, text};
      }

      const payload: IRequest = {
        requestedBy: new ObjectId(userId),
        entityId: new ObjectId(entityId),
        reason,
        details: cleanedDetails,
        requestType,
        responses: [],
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const {insertedId} = await this.RequestCollection.insertOne(payload, {
        session,
      });

      return {
        _id: insertedId,
        ...payload,
      } as IRequest;
    } catch (error) {
      throw new InternalServerError(`Failed to create request /More: ${error}`);
    }
  }

  async getAllRequests(
    userId: string,
    query: GetAllRequestsQueryDto,
    session?: ClientSession,
  ): Promise<{data: IRequest[]; totalPages: number; totalCount: number}> {
    // Implementation here
    throw new Error('Method not implemented.');
  }

  async updateStatus(
    requestId: string,
    status: RequestStatus,
    userId: string,
    session?: ClientSession,
  ): Promise<IRequest> {
    // Implementation here
    throw new Error('Method not implemented.');
  }

  async deleteByEntityId(
    entityId: string,
    session?: ClientSession,
  ): Promise<void> {
    try {
      await this.init();
      await this.RequestCollection.deleteMany(
        {
          entityId: new ObjectId(entityId),
        },
        {session},
      );
    } catch (error) {
      throw new InternalServerError(
        `Error while removing related entities, More/ ${error}`,
      );
    }
  }
}
