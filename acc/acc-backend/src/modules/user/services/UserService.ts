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

      const newRole = isCallAgent ? 'call_agent' : 'expert';
      const updatedUser = await this.userRepo.edit(userId, {
        role: newRole,
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

      if (user.role !== 'call_agent') {
        throw new BadRequestError('User is not a call agent');
      }

      // Find the smallest available agent number
      const allCallAgents = await this.userRepo.findCallAgents(session);
      const assignedNumbers = new Set<string>();
      for (const agent of allCallAgents) {
        if (agent.agent && agent.agent !== 'not_available' && agent.isCallAgentActive) {
          assignedNumbers.add(agent.agent);
        }
      }

      let agentNumber = 1;
      while (assignedNumbers.has(`agent_${agentNumber}`)) {
        agentNumber++;
      }

      const assignedAgent = `agent_${agentNumber}`;

      const updatedUser = await this.userRepo.edit(userId, {
        agent: assignedAgent,
        isCallAgentActive: true,
        isBusy: false,
        currentCallUuid: null,
        lastAgentActiveAt: new Date()
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

      if (user.role !== 'call_agent') {
        throw new BadRequestError('User is not a call agent');
      }

      const updatedUser = await this.userRepo.edit(userId, {
        agent: 'not_available',
        isCallAgentActive: false,
        isBusy: false,
        currentCallUuid: null
      }, session);

      return updatedUser;
    });
  }

  async updateAgentHeartbeat(userId: string): Promise<void> {
    await this._withTransaction(async (session: ClientSession) => {
      const user = await this.userRepo.findById(userId, session);
      if (!user) {
        throw new NotFoundError(`User with ID ${userId} not found`);
      }

      if (user.role !== 'call_agent') {
        throw new BadRequestError('User is not a call agent');
      }

      await this.userRepo.edit(userId, {
        lastAgentActiveAt: new Date()
      }, session);
    });
  }

  async cleanupInactiveAgents(): Promise<void> {
    const activeAgents = await this.userRepo.findActiveCallAgents();
    if (activeAgents.length === 0) {
      return;
    }

    const oneMinuteAgo = new Date(Date.now() - 75 * 1000); // 75 seconds ago
    const inactiveAgents = activeAgents.filter(
      agent =>
        !agent.lastAgentActiveAt || new Date(agent.lastAgentActiveAt) < oneMinuteAgo
    );

    if (inactiveAgents.length > 0) {
      for (const agent of inactiveAgents) {
        try {
          const userId = agent._id.toString();
          console.log(`♻️ [AGENT-CLEANUP] Marking inactive agent ${agent.agent} (ID: ${userId}) offline due to missing heartbeat`);
          await this.setAgentOffline(userId);
        } catch (error) {
          console.error(`[AGENT-CLEANUP] Failed to mark agent ${agent._id} offline:`, error);
        }
      }
    }
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
