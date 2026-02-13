import {inject, injectable} from 'inversify';
import {
  IQuestion,
  IRequest,
  IRequestResponse,
  IUser,
  MongoDatabase,
  RequestStatus,
} from '#root/shared/index.js';
import {IRequestRepository} from '#root/shared/database/interfaces/IRequestRepository.js';
import {
  CreateRequestBodyDto,
  GetAllRequestsQueryDto,
} from '#root/modules/request/classes/validators/RequestValidators.js';
import {ClientSession, Collection, ObjectId} from 'mongodb';
import {InternalServerError, NotFoundError} from 'routing-controllers';
import {GLOBAL_TYPES} from '#root/types.js';

@injectable()
export class RequestRepository implements IRequestRepository {
  private RequestCollection: Collection<IRequest>;
  private usersCollection!: Collection<IUser>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init() {
    this.RequestCollection = await this.db.getCollection<IRequest>('requests');
    this.usersCollection = await this.db.getCollection<IUser>('users');
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
        const {_id, createdAt, updatedAt,metrics,embedding, ...allowedFields} =
          details.details as Record<string, any>;
        cleanedDetails = allowedFields;
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

      const filter: any = {
        isDeleted: {$ne: true},
      };
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
      const sanitizedData: IRequest[] = await Promise.all(
        data.map(async req => {
          const responses: IRequestResponse[] =
            req.responses?.map(r => ({
              ...r,
              reviewedBy: r.reviewedBy?.toString(),
            })) || [];

          const requestedUser = await this.usersCollection.findOne({
            _id: req.requestedBy,
          },
          {
        projection: {
          firstName: 1,
          lastName: 1,
        },
      },
        );

          return {
            ...req,
            _id: req._id?.toString(),
            requestedBy: req.requestedBy?.toString(),
            entityId: req.entityId?.toString(),
            responses,
            createdAt:
              req.createdAt instanceof Date
                ? req.createdAt.toISOString()
                : req.createdAt,
            updatedAt:
              req.updatedAt instanceof Date
                ? req.updatedAt.toISOString()
                : req.updatedAt,
            requestedUser: requestedUser
              ? {
                  _id: requestedUser._id.toString(),
                  firstName: requestedUser.firstName,
                  lastName: requestedUser.lastName,
                }
              : null,
          } as IRequest;
        }),
      );

      return {requests: sanitizedData, totalPages, totalCount};
    } catch (error) {
      throw new InternalServerError(`Failed to create request /More: ${error}`);
    }
  }

  async updateStatus(
    requestId: string,
    status: RequestStatus,
    response: string,
    userId: string,
    session?: ClientSession,
  ): Promise<IRequestResponse> {
    try {
      const user = await this.usersCollection.findOne({
        _id: new ObjectId(userId),
      });
      if (!user) throw new NotFoundError('Failed to get user');

      const responsePayload: IRequestResponse = {
        reviewedBy: new ObjectId(userId),
        reviewerName: `${user.firstName} ${user.lastName}`,
        role: user.role,
        status,
        response,
        reviewedAt: new Date(),
      };

      const updatedRequest = await this.RequestCollection.findOneAndUpdate(
        {_id: new ObjectId(requestId),
        },
        {
          $set: {status},
          $push: {responses: responsePayload},
        },
        {returnDocument: 'after', session},
      );

      return responsePayload;
    } catch (error) {
      throw new InternalServerError(`Failed to update request: ${error}`);
    }
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

  async getRequestById(
    requestId: string,
    session?: ClientSession,
  ): Promise<IRequest | null> {
    try {
      await this.init();
      return await this.RequestCollection.findOne(
        {_id: new ObjectId(requestId),
          isDeleted: { $ne: true },
        },
        {session},
      );
    } catch (error) {
      throw new InternalServerError(`Failed to get request, More/ ${error}`);
    }
  }

  async softDeleteById(
    requestId: string,
    deletedBy: string,
    session?: ClientSession,
  ): Promise<void> {
    try {
      await this.init();

      await this.RequestCollection.updateOne(
        {
          _id: new ObjectId(requestId),
        isDeleted: {$ne: true},
        },
        {
          $set: {
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: new ObjectId(deletedBy),
          },
        },
      {session},
      );

    } catch (error) {
      throw new InternalServerError(`Failed to soft delete request: ${error}`);
    }
  }

}
