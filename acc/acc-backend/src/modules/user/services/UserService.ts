import { injectable, inject } from 'inversify';
import { ClientSession } from 'mongodb';
import { BadRequestError, ForbiddenError, InternalServerError, NotFoundError, getFromContainer } from 'routing-controllers';
import { GLOBAL_TYPES } from '#root/types.js';
import type { IUserRepository } from '#shared/database/interfaces/IUserRepository.js';
import { MongoDatabase } from '#shared/database/providers/mongo/MongoDatabase.js';
import { BaseService } from '#shared/classes/BaseService.js';
import type { IUser } from '#shared/interfaces/models.js';
import { FirebaseAuthService } from '#root/modules/auth/services/FirebaseAuthService.js';

@injectable()
export class UserService extends BaseService {
  constructor(
    @inject(GLOBAL_TYPES.UserRepository)
    private readonly userRepo: IUserRepository,
    @inject(GLOBAL_TYPES.Database)
    private readonly database: MongoDatabase,
  ) {
    super(database);
  }

  async getCallAgents(): Promise<IUser[]> {
    return await this._withTransaction(async (session: ClientSession) => {
      return await this.userRepo.findCallAgents(session);
    });
  }

  async setCallAgentStatus(
    userId: string,
    isCallAgent: boolean,
    isCallAgentActive: boolean,
    requestingUserRole?: string,
  ): Promise<IUser> {
    return await this._withTransaction(async (session: ClientSession) => {
      if (requestingUserRole !== 'admin') {
        throw new ForbiddenError('Only admin can manage call agents');
      }
      const user = await this.userRepo.findById(userId, session);
      if (!user) {
        throw new NotFoundError(`User with ID ${userId} not found`);
      }

      const updatedUser = await this.userRepo.edit(userId, {
        isCallAgent,
        isCallAgentActive,
      }, session);

      return updatedUser;
    });
  }

  async toggleCallAgentActive(userId: string, requestingUserRole?: string): Promise<IUser> {
    return await this._withTransaction(async (session: ClientSession) => {
      if (requestingUserRole !== 'admin') {
        throw new ForbiddenError('Only admin can toggle call agent active status');
      }
      const user = await this.userRepo.findById(userId, session);
      if (!user) {
        throw new NotFoundError(`User with ID ${userId} not found`);
      }

      const updatedUser = await this.userRepo.edit(userId, {
        isCallAgentActive: !user.isCallAgentActive,
      }, session);

      return updatedUser;
    });
  }

  async setAgentOnline(userId: string): Promise<IUser> {
    return await this._withTransaction(async (session: ClientSession) => {
      const user = await this.userRepo.findById(userId, session);
      if (!user) {
        throw new NotFoundError(`User with ID ${userId} not found`);
      }

      const updatedUser = await this.userRepo.edit(userId, {
        isCallAgentActive: true,
        isBusy: false,
      }, session);

      return updatedUser;
    });
  }

  async setAgentOffline(userId: string): Promise<IUser> {
    return await this._withTransaction(async (session: ClientSession) => {
      const user = await this.userRepo.findById(userId, session);
      if (!user) {
        throw new NotFoundError(`User with ID ${userId} not found`);
      }

      const updatedUser = await this.userRepo.edit(userId, {
        isCallAgentActive: false,
        isBusy: true,
      }, session);

      return updatedUser;
    });
  }

  async setAgentBusy(userId: string, callUuid: string): Promise<IUser> {
    return await this._withTransaction(async (session: ClientSession) => {
      const user = await this.userRepo.findById(userId, session);
      if (!user) {
        throw new NotFoundError(`User with ID ${userId} not found`);
      }

      const updatedUser = await this.userRepo.edit(userId, {
        isBusy: true,
        currentCallUuid: callUuid
      }, session);

      return updatedUser;
    });
  }

  async markAgentAsAvailable(userId: string): Promise<IUser> {
    return await this._withTransaction(async (session: ClientSession) => {
      const user = await this.userRepo.findById(userId, session);
      if (!user) {
        throw new NotFoundError(`User with ID ${userId} not found`);
      }

      const updatedUser = await this.userRepo.edit(userId, {
        isBusy: false,
        currentCallUuid: null
      }, session);

      return updatedUser;
    });
  }

  async findAvailableAgent(): Promise<IUser | null> {
    return await this._withTransaction(async (session: ClientSession) => {
      const activeAgents = await this.userRepo.findCallAgents(session);
      const availableAgents = activeAgents.filter(
        agent => 
          agent.isCallAgentActive === true && 
          agent.isBusy === false && 
          agent.agent && 
          agent.agent !== 'not_available'
      );

      if (availableAgents.length === 0) {
        return null;
      }

      availableAgents.sort((a, b) => {
        const numA = parseInt(a.agent?.replace('agent_', '') || '999');
        const numB = parseInt(b.agent?.replace('agent_', '') || '999');
        return numA - numB;
      });

      return availableAgents[0];
    });
  }

  async findAndMarkAvailableAgent(callUuid: string): Promise<IUser | null> {
    return await this.userRepo.findAndMarkAvailableAgent(callUuid);
  }

  async getUserById(userId: string): Promise<IUser | null> {
    return await this._withTransaction(async (session: ClientSession) => {
      return await this.userRepo.findById(userId, session);
    });
  }

  async getUserByEmail(email: string): Promise<IUser | null> {
    return await this._withTransaction(async (session: ClientSession) => {
      return await this.userRepo.findByEmail(email, session);
    });
  }

  async updateUser(userId: string, data: Partial<IUser>): Promise<IUser> {
    try {
      if (!userId) throw new NotFoundError('User ID is required');

      const editableFields = [
        'firstName',
        'lastName',
        'mobile',
        'university',
        'preference',
        'avatar',
      ] as const;
      const sanitizedData: Partial<IUser> = {};

      for (const field of editableFields) {
        if (Object.prototype.hasOwnProperty.call(data, field)) {
          (sanitizedData as any)[field] = (data as any)[field];
        }
      }

      if (
        Object.keys(sanitizedData).length === 0 &&
        Object.keys(data).length > 0
      ) {
        throw new BadRequestError('No editable profile fields provided');
      }

      if (sanitizedData.firstName !== undefined && !sanitizedData.firstName.trim())
        throw new BadRequestError('Firstname cannot be empty or blank space');

      const authService = getFromContainer(FirebaseAuthService);

      return this._withTransaction(async (session: ClientSession) => {
        const updatedUser = await this.userRepo.edit(userId, sanitizedData, session);
        if (!updatedUser)
          throw new NotFoundError(`User with ID ${userId} not found`);
        if (sanitizedData.firstName || sanitizedData.lastName) {
          await authService.updateFirebaseUser(updatedUser.firebaseUID, {
            firstName: sanitizedData.firstName ?? updatedUser.firstName,
            lastName: sanitizedData.lastName ?? updatedUser.lastName,
          });
        }
        return updatedUser;
      });
    } catch (error) {
      throw new InternalServerError(
        `Failed to update user with ID ${userId}: ${error}`,
      );
    }
  }
}
