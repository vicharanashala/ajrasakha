import { inject, injectable } from 'inversify';
import { GLOBAL_TYPES } from '#root/types.js';
import type { IUserRepository } from '#root/shared/database/interfaces/IUserRepository.js';
import type { IUser } from '#root/shared/interfaces/models.js';
import { ClientSession } from 'mongodb';

@injectable()
export class AgentAssignmentService {
  constructor(
    @inject(GLOBAL_TYPES.UserRepository) private userRepository: IUserRepository
  ) {}

  /**
   * Assigns an agent number (agent_1, agent_2, etc.) to a user when they go online
   * Finds the smallest available agent number that is not currently assigned to an active agent
   */
  async assignAgentNumber(userId: string, session?: ClientSession): Promise<string> {
    // Get all active call agents with their assigned agent numbers
    const activeAgents = await this.userRepository.findCallAgents(session);
    
    // Extract currently assigned agent numbers
    const assignedNumbers = new Set<string>();
    for (const agent of activeAgents) {
      if (agent.agent && agent.agent !== 'not_available') {
        assignedNumbers.add(agent.agent);
      }
    }

    // Find the smallest available agent number
    let agentNumber = 1;
    while (assignedNumbers.has(`agent_${agentNumber}`)) {
      agentNumber++;
    }

    const assignedAgent = `agent_${agentNumber}`;

    // Update the user with the assigned agent number
    await this.userRepository.edit(userId, { 
      agent: assignedAgent,
      isCallAgentActive: true,
      isBusy: false,
      currentCallUuid: null
    }, session);

    return assignedAgent;
  }

  /**
   * Releases an agent number when a user goes offline
   * Sets agent field back to 'not_available'
   */
  async releaseAgentNumber(userId: string, session?: ClientSession): Promise<void> {
    await this.userRepository.edit(userId, { 
      agent: 'not_available',
      isCallAgentActive: false,
      isBusy: false,
      currentCallUuid: null
    }, session);
  }

  /**
   * Finds the next available agent (active + not busy)
   * Returns the agent with the smallest agent number that is available
   */
  async findAvailableAgent(session?: ClientSession): Promise<IUser | null> {
    const activeAgents = await this.userRepository.findCallAgents(session);
    
    // Filter agents that are active, not busy, and have an assigned agent number
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

    // Sort by agent number to get the smallest available number
    availableAgents.sort((a, b) => {
      const numA = parseInt(a.agent?.replace('agent_', '') || '999');
      const numB = parseInt(b.agent?.replace('agent_', '') || '999');
      return numA - numB;
    });

    return availableAgents[0];
  }

  /**
   * Marks an agent as busy when they answer a call
   */
  async markAgentAsBusy(userId: string, callUuid: string, session?: ClientSession): Promise<void> {
    await this.userRepository.edit(userId, { 
      isBusy: true,
      currentCallUuid: callUuid
    }, session);
  }

  /**
   * Marks an agent as available when their call ends
   */
  async markAgentAsAvailable(userId: string, session?: ClientSession): Promise<void> {
    await this.userRepository.edit(userId, {
      isBusy: false,
      currentCallUuid: null
    }, session);
  }

  /**
   * Atomically finds and marks an available agent as busy
   * This prevents race conditions when multiple calls come in simultaneously
   * @param callUuid - The UUID of the call to assign
   * @param session - The session for transaction
   * @returns A promise that resolves to the updated agent if found, or null if no available agent
   */
  async findAndMarkAvailableAgent(callUuid: string, session?: ClientSession): Promise<IUser | null> {
    return await this.userRepository.findAndMarkAvailableAgent(callUuid, session);
  }

  /**
   * Gets the Plivo endpoint credentials for a specific agent number
   */
  getAgentCredentials(agentNumber: string): { username: string} {
    const env = process.env;
    const username = env[`PLIVO_ENDPOINT_USERNAME_${agentNumber.toUpperCase()}`];

    if (!username) {
      throw new Error(`Credentials not found for ${agentNumber}. Please set PLIVO_ENDPOINT_USERNAME_${agentNumber.toUpperCase()} in environment variables.`);
    }

    return { username };
  }
}
