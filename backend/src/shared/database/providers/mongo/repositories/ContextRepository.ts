import {IContext} from '#root/shared/interfaces/models.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject, injectable} from 'inversify';
import {ClientSession, Collection, ObjectId} from 'mongodb';
import {MongoDatabase} from '../MongoDatabase.js';
import {isValidObjectId} from '#root/utils/isValidObjectId.js';
import {BadRequestError, InternalServerError} from 'routing-controllers';
import {IContextRepository} from '#root/shared/database/interfaces/IContextRepository.js';
import {instanceToPlain, plainToInstance} from 'class-transformer';
import { ContextResponseDto } from '#root/modules/context/dtos/ContextResponseDto.js';
import { getProjectionFromDto } from '#root/shared/utils/projection.js';

@injectable()
export class ContextRepository implements IContextRepository {
  private ContextCollection: Collection<IContext>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init() {
    this.ContextCollection = await this.db.getCollection<IContext>('contexts');
  }

  async addContext(
    text: string,
    session?: ClientSession,
  ): Promise<{insertedId: string}> {
    try {
      await this.init();

      if (!text || typeof text !== 'string') {
        throw new BadRequestError('Context text must be a non-empty string');
      }

      const uploadData: IContext = {
        text,
        createdAt: new Date(),
      };

      const result = await this.ContextCollection.insertOne(uploadData, {
        session,
      });
      return {insertedId: result.insertedId.toString()};
    } catch (error) {
      throw new InternalServerError(
        `Error while adding context, More/ ${error}`,
      );
    }
  }

  async getById(
    contextId: string,
    session?: ClientSession,
  ): Promise<ContextResponseDto | null> {
    try {
      await this.init();

      if (!contextId || !isValidObjectId(contextId)) {
        throw new BadRequestError('Invalid or missing contextId');
      }

      const projection = getProjectionFromDto(ContextResponseDto);
      const context = await this.ContextCollection.findOne(
        {
          _id: new ObjectId(contextId),
        },
        {session, projection},
      );

      if (!context) return null;

      // Transform and return plain object to ensure only exposed fields are sent
      const instance = plainToInstance(ContextResponseDto, {
        ...context,
        _id: context._id.toString()
      }, { excludeExtraneousValues: true });
      
      return instanceToPlain(instance) as any;
      
    } catch (error) {
      throw new InternalServerError(
        `Error while fetching context, More/ ${error}`,
      );
    }
  }
}
