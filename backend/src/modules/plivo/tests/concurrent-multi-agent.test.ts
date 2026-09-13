import 'reflect-metadata';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {AgentAssignmentService} from '#root/modules/plivo/services/AgentAssignmentService.js';
import {IUser} from '#root/shared/interfaces/models.js';

describe('Concurrent ACC Agent Assignment', () => {
  const availableAgents = [
    {
      _id: 'agent-user-1',
      role: 'call_agent',
      agent: 'agent_1',
      isCallAgentActive: true,
      isBusy: false,
      currentCallUuid: null,
    },
    {
      _id: 'agent-user-2',
      role: 'call_agent',
      agent: 'agent_2',
      isCallAgentActive: true,
      isBusy: false,
      currentCallUuid: null,
    },
  ] as IUser[];

  const userRepository = {
    findAndMarkAvailableAgent: vi.fn(),
    edit: vi.fn(),
  };

  let service: AgentAssignmentService;
  let agents: IUser[];

  beforeEach(() => {
    vi.clearAllMocks();
    agents = availableAgents.map(agent => ({...agent}));

    userRepository.findAndMarkAvailableAgent.mockImplementation(
      async (callUuid: string) => {
        await Promise.resolve();
        const agent = agents.find(
          candidate =>
            candidate.isCallAgentActive === true &&
            candidate.isBusy === false &&
            candidate.agent !== 'not_available',
        );

        if (!agent) {
          return null;
        }

        agent.isBusy = true;
        agent.currentCallUuid = callUuid;
        return {...agent};
      },
    );

    userRepository.edit.mockImplementation(
      async (userId: string, update: Partial<IUser>) => {
        const agent = agents.find(candidate => candidate._id === userId);
        if (agent) {
          Object.assign(agent, update);
        }
        return agent;
      },
    );

    service = new AgentAssignmentService(userRepository as any);
  });

  it('assigns simultaneous calls to different available agents', async () => {
    // Arrange / Act
    const [firstAssignment, secondAssignment] = await Promise.all([
      service.findAndMarkAvailableAgent('call-1'),
      service.findAndMarkAvailableAgent('call-2'),
    ]);

    // Assert
    expect(firstAssignment?._id).toBe('agent-user-1');
    expect(secondAssignment?._id).toBe('agent-user-2');
    expect(firstAssignment?._id).not.toBe(secondAssignment?._id);
  });

  it('records the correct call UUID on each simultaneous assignment', async () => {
    // Arrange / Act
    const assignments = await Promise.all([
      service.findAndMarkAvailableAgent('call-alpha'),
      service.findAndMarkAvailableAgent('call-beta'),
    ]);

    // Assert
    expect(assignments).toEqual([
      expect.objectContaining({
        isBusy: true,
        currentCallUuid: 'call-alpha',
      }),
      expect.objectContaining({
        isBusy: true,
        currentCallUuid: 'call-beta',
      }),
    ]);
    expect(userRepository.findAndMarkAvailableAgent)
      .toHaveBeenCalledTimes(2);
  });

  it('returns no assignment when simultaneous calls exceed free agents', async () => {
    // Arrange / Act
    const assignments = await Promise.all([
      service.findAndMarkAvailableAgent('call-1'),
      service.findAndMarkAvailableAgent('call-2'),
      service.findAndMarkAvailableAgent('call-3'),
    ]);

    // Assert
    expect(assignments.filter(Boolean)).toHaveLength(2);
    expect(assignments.filter(assignment => assignment === null)).toHaveLength(1);
  });

  it('keeps other agents busy when one completed call releases its agent', async () => {
    // Arrange
    await Promise.all([
      service.findAndMarkAvailableAgent('call-1'),
      service.findAndMarkAvailableAgent('call-2'),
    ]);

    // Act
    await service.markAgentAsAvailable('agent-user-1');

    // Assert
    expect(userRepository.edit).toHaveBeenCalledWith(
      'agent-user-1',
      {isBusy: false, currentCallUuid: null},
      undefined,
    );
    expect(agents[0]).toEqual(
      expect.objectContaining({isBusy: false, currentCallUuid: null}),
    );
    expect(agents[1]).toEqual(
      expect.objectContaining({isBusy: true, currentCallUuid: 'call-2'}),
    );
  });

  it('reuses only the agent released by the completed call', async () => {
    // Arrange
    await Promise.all([
      service.findAndMarkAvailableAgent('call-1'),
      service.findAndMarkAvailableAgent('call-2'),
    ]);
    await service.markAgentAsAvailable('agent-user-1');

    // Act
    const nextAssignment =
      await service.findAndMarkAvailableAgent('call-3');

    // Assert
    expect(nextAssignment).toEqual(
      expect.objectContaining({
        _id: 'agent-user-1',
        isBusy: true,
        currentCallUuid: 'call-3',
      }),
    );
    expect(agents[1].currentCallUuid).toBe('call-2');
  });
});
