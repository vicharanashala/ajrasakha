import { inject, injectable } from 'inversify';
import { GLOBAL_TYPES } from '#root/types.js';
import type { IUserRepository } from '#shared/database/interfaces/IUserRepository.js';
import type { IUser } from '#shared/interfaces/models.js';
import { ClientSession } from 'mongodb';

@injectable()
export class AgentAssignmentService {
  constructor(
    @inject(GLOBAL_TYPES.UserRepository) private userRepository: IUserRepository
  ) {}

  async assignAgentNumber(userId: string, session?: ClientSession): Promise<string> {
    const activeAgents = await this.userRepository.findCallAgents(session);
    
    const assignedNumbers = new Set<string>();
    for (const agent of activeAgents) {
      if (agent.agent && agent.agent !== 'not_available') {
        assignedNumbers.add(agent.agent);
      }
    }

    let agentNumber = 1;
    while (assignedNumbers.has(`agent_${agentNumber}`)) {
      agentNumber++;
    }

    const assignedAgent = `agent_${agentNumber}`;

    await this.userRepository.edit(userId, { 
      agent: assignedAgent,
      isCallAgentActive: true,
      isBusy: false,
      currentCallUuid: null
    }, session);

    return assignedAgent;
  }

  async releaseAgentNumber(userId: string, session?: ClientSession): Promise<void> {
    await this.userRepository.edit(userId, { 
      agent: 'not_available',
      isCallAgentActive: false,
      isBusy: false,
      currentCallUuid: null
    }, session);
  }

  async findAvailableAgent(session?: ClientSession): Promise<IUser | null> {
    const activeAgents = await this.userRepository.findCallAgents(session);
    
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
  }

  async markAgentAsBusy(userId: string, callUuid: string, session?: ClientSession): Promise<void> {
    await this.userRepository.edit(userId, { 
      isBusy: true,
      currentCallUuid: callUuid
    }, session);
  }

  async markAgentAsAvailable(userId: string, session?: ClientSession): Promise<void> {
    await this.userRepository.edit(userId, {
      isBusy: false,
      currentCallUuid: null
    }, session);
  }

  async findAndMarkAvailableAgent(callUuid: string, session?: ClientSession): Promise<IUser | null> {
    return await this.userRepository.findAndMarkAvailableAgent(callUuid, session);
  }

  getAgentCredentials(agentNumber: string): { username: string} {
    const env = process.env;
    const username = env[`PLIVO_ENDPOINT_USERNAME_${agentNumber.toUpperCase()}`];

    if (!username) {
      throw new Error(`Credentials not found for ${agentNumber}. Please set PLIVO_ENDPOINT_USERNAME_${agentNumber.toUpperCase()} in environment variables.`);
    }

    return { username };
  }
}
