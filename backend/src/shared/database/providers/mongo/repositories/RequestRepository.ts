import {inject, injectable} from 'inversify';
import {
  IQuestion,
  IRequest,
  IRequestResponse,
  MongoDatabase,
  RequestStatus,
} from '#root/shared/index.js';
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
    query: GetAllRequestsQueryDto,
    session?: ClientSession,
  ): Promise<{requests: IRequest[]; totalPages: number; totalCount: number}> {
    try {
      await this.init();
      const page = query.page ?? 1;
      const limit = query.limit ?? 10;
      const skip = (page - 1) * limit;

      const filter: any = {};
      if (query.status && query.status !== 'all') {
        filter.status = query.status;
      }
      if (query.requestType && query.requestType !== 'all') {
        filter.requestType = query.requestType;
      }

      const sort: Record<string, 1 | -1> = {};
      if (query.sortOrder === 'oldest') {
        sort.createdAt = 1;
      } else {
        sort.createdAt = -1;
      }

      const totalCount = await this.RequestCollection.countDocuments(filter);

      const data = await this.RequestCollection.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .toArray();

      const totalPages = Math.ceil(totalCount / limit);
      const sanitizedData: IRequest[] = data.map(req => {
        const responses: IRequestResponse[] =
          req.responses?.map(r => ({
            ...r,
            reviewedBy: r.reviewedBy?.toString(),
          })) || [];

        const details =
          req.requestType === 'question_flag'
            ? (req.details as IQuestion | null)
            : (req.details as Record<string, any> | null);

        return {
          ...req,
          _id: req._id?.toString(),
          requestedBy: req.requestedBy?.toString(),
          entityId: req.entityId?.toString(),
          responses,
          details,
          createdAt:
            req.createdAt instanceof Date
              ? req.createdAt.toISOString()
              : req.createdAt,
          updatedAt:
            req.updatedAt instanceof Date
              ? req.updatedAt.toISOString()
              : req.updatedAt,
        } as IRequest;
      });

      return {requests: sanitizedData, totalPages, totalCount};
    } catch (error) {
      throw new InternalServerError(`Failed to create request /More: ${error}`);
    }
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
