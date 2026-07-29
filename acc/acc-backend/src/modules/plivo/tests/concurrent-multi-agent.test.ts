import 'reflect-metadata';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {AgentAssignmentService} from '#root/modules/plivo/services/AgentAssignmentService.js';
import type {IUser} from '#shared/interfaces/models.js';

describe('Concurrent ACC Agent Assignment', () => {
  const repository = {
    findAndMarkAvailableAgent: vi.fn(),
    edit: vi.fn(),
  };
  let agents: IUser[];
  let service: AgentAssignmentService;

  beforeEach(() => {
    vi.clearAllMocks();
    agents = [
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
    repository.findAndMarkAvailableAgent.mockImplementation(
      async (callUuid: string) => {
        await Promise.resolve();
        const selected = agents.find(agent =>
          agent.isCallAgentActive && !agent.isBusy,
        );
        if (!selected) return null;
        selected.isBusy = true;
        selected.currentCallUuid = callUuid;
        return {...selected};
      },
    );
    repository.edit.mockImplementation(async (id, update) => {
      const selected = agents.find(agent => agent._id === id);
      Object.assign(selected!, update);
      return selected;
    });
    service = new AgentAssignmentService(repository as any, {} as any);
  });

  it('assigns simultaneous calls to different agents', async () => {
    const [first, second] = await Promise.all([
      service.findAndMarkAvailableAgent('call-1'),
      service.findAndMarkAvailableAgent('call-2'),
    ]);

    expect(first).toEqual(expect.objectContaining({
      _id: 'agent-user-1',
      currentCallUuid: 'call-1',
    }));
    expect(second).toEqual(expect.objectContaining({
      _id: 'agent-user-2',
      currentCallUuid: 'call-2',
    }));
  });

  it('returns no assignment when calls exceed free agents', async () => {
    const assignments = await Promise.all([
      service.findAndMarkAvailableAgent('call-1'),
      service.findAndMarkAvailableAgent('call-2'),
      service.findAndMarkAvailableAgent('call-3'),
    ]);

    expect(assignments.filter(Boolean)).toHaveLength(2);
    expect(assignments).toContain(null);
  });

  it('releases only the agent whose call completed', async () => {
    await Promise.all([
      service.findAndMarkAvailableAgent('call-1'),
      service.findAndMarkAvailableAgent('call-2'),
    ]);

    await service.markAgentAsAvailable('agent-user-1');

    expect(agents[0]).toEqual(
      expect.objectContaining({isBusy: false, currentCallUuid: null}),
    );
    expect(agents[1]).toEqual(
      expect.objectContaining({isBusy: true, currentCallUuid: 'call-2'}),
    );
  });

  it('reuses the released agent for the next call', async () => {
    await Promise.all([
      service.findAndMarkAvailableAgent('call-1'),
      service.findAndMarkAvailableAgent('call-2'),
    ]);
    await service.markAgentAsAvailable('agent-user-1');

    const assignment =
      await service.findAndMarkAvailableAgent('call-3');

    expect(assignment).toEqual(expect.objectContaining({
      _id: 'agent-user-1',
      currentCallUuid: 'call-3',
    }));
  });
});
