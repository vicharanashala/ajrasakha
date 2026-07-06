import { injectable, inject } from 'inversify';
import { ClientSession } from 'mongodb';
import { BadRequestError, ForbiddenError, InternalServerError, NotFoundError } from 'routing-controllers';
import { GLOBAL_TYPES } from '#root/types.js';
import type { IUserRepository } from '#shared/database/interfaces/IUserRepository.js';
import { MongoDatabase } from '#shared/database/providers/mongo/MongoDatabase.js';
import { BaseService } from '#shared/classes/BaseService.js';
import type { IUser } from '#shared/interfaces/models.js';

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
        throw new ForbiddenError('Only admin can manage call agents');
      }
      const user = await this.userRepo.findById(userId, session);
      if (!user) {
        throw new NotFoundError(`User with ID ${userId} not found`);
      }

      if (user.role !== 'call_agent') {
        throw new BadRequestError('User is not a call agent');
      }

      const newStatus = !user.isCallAgentActive;
      return await this.userRepo.edit(userId, {
        isCallAgentActive: newStatus
      }, session);
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
        currentCallUuid: null
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

  async markAgentAsBusy(userId: string, callUuid: string): Promise<IUser> {
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
}
