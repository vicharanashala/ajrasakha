import 'reflect-metadata';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {BadRequestError} from 'routing-controllers';
import {UserService} from '#root/modules/user/services/UserService.js';
import type {IUser} from '#shared/interfaces/models.js';

describe('Agent Availability Management', () => {
  const session = {
    startTransaction: vi.fn(),
    commitTransaction: vi.fn(),
    abortTransaction: vi.fn().mockResolvedValue(undefined),
    endSession: vi.fn(),
    inTransaction: vi.fn(() => true),
  };
  const userRepo = {
    findById: vi.fn(),
    findCallAgents: vi.fn(),
    findActiveCallAgents: vi.fn(),
    edit: vi.fn(),
  };
  const database = {
    getClient: vi.fn().mockResolvedValue({
      startSession: vi.fn(() => session),
    }),
  };
  let service: UserService;

  const agent = (overrides: Partial<IUser> = {}): IUser => ({
    _id: 'agent-user-1',
    role: 'call_agent',
    agent: 'not_available',
    isCallAgentActive: false,
    isBusy: false,
    currentCallUuid: null,
    ...overrides,
  }) as IUser;

  beforeEach(() => {
    vi.clearAllMocks();
    session.inTransaction.mockReturnValue(true);
    service = new UserService(userRepo as any, database as any);
  });

  it('registers the first agent as available', async () => {
    userRepo.findById.mockResolvedValue(agent());
    userRepo.findCallAgents.mockResolvedValue([]);
    userRepo.edit.mockImplementation(async (_id, update) => agent(update));

    const result = await service.setAgentOnline('agent-user-1');

    expect(userRepo.edit).toHaveBeenCalledWith(
      'agent-user-1',
      expect.objectContaining({
        agent: 'agent_1',
        isCallAgentActive: true,
        isBusy: false,
        currentCallUuid: null,
        lastAgentActiveAt: expect.any(Date),
      }),
      session,
    );
    expect(result.agent).toBe('agent_1');
  });

  it('registers the next agent in the lowest free position', async () => {
    userRepo.findById.mockResolvedValue(agent({_id: 'agent-user-2'}));
    userRepo.findCallAgents.mockResolvedValue([
      agent({agent: 'agent_1', isCallAgentActive: true}),
      agent({_id: 'agent-user-3', agent: 'agent_3', isCallAgentActive: true}),
    ]);
    userRepo.edit.mockImplementation(async (_id, update) =>
      agent({_id: 'agent-user-2', ...update}),
    );

    const result = await service.setAgentOnline('agent-user-2');

    expect(result.agent).toBe('agent_2');
  });

  it('takes an agent offline and clears its call state', async () => {
    userRepo.findById.mockResolvedValue(agent({
      agent: 'agent_1',
      isCallAgentActive: true,
      isBusy: true,
      currentCallUuid: 'call-1',
    }));
    userRepo.edit.mockImplementation(async (_id, update) => agent(update));

    await service.setAgentOffline('agent-user-1');

    expect(userRepo.edit).toHaveBeenCalledWith(
      'agent-user-1',
      {
        agent: 'not_available',
        isCallAgentActive: false,
        isBusy: false,
        currentCallUuid: null,
      },
      session,
    );
  });

  it('selects the lowest numbered free agent and skips busy agents', async () => {
    const selected = agent({
      _id: 'agent-user-2',
      agent: 'agent_2',
      isCallAgentActive: true,
    });
    userRepo.findCallAgents.mockResolvedValue([
      agent({
        agent: 'agent_1',
        isCallAgentActive: true,
        isBusy: true,
      }),
      agent({
        _id: 'agent-user-3',
        agent: 'agent_3',
        isCallAgentActive: true,
      }),
      selected,
    ]);

    await expect(service.findAvailableAgent()).resolves.toEqual(selected);
  });

  it('returns null when no agent is available', async () => {
    userRepo.findCallAgents.mockResolvedValue([
      agent({agent: 'agent_1', isCallAgentActive: false}),
      agent({
        agent: 'agent_2',
        isCallAgentActive: true,
        isBusy: true,
      }),
    ]);

    await expect(service.findAvailableAgent()).resolves.toBeNull();
  });

  it('marks an assigned agent busy for its call', async () => {
    userRepo.findById.mockResolvedValue(agent({
      agent: 'agent_1',
      isCallAgentActive: true,
    }));
    userRepo.edit.mockImplementation(async (_id, update) => agent(update));

    await service.setAgentBusy('agent-user-1', 'call-123');

    expect(userRepo.edit).toHaveBeenCalledWith(
      'agent-user-1',
      {isBusy: true, currentCallUuid: 'call-123'},
      session,
    );
  });

  it('returns an agent to available after a call', async () => {
    userRepo.findById.mockResolvedValue(agent({
      isBusy: true,
      currentCallUuid: 'call-123',
    }));
    userRepo.edit.mockImplementation(async (_id, update) => agent(update));

    await service.markAgentAsAvailable('agent-user-1');

    expect(userRepo.edit).toHaveBeenCalledWith(
      'agent-user-1',
      {isBusy: false, currentCallUuid: null},
      session,
    );
  });

  it('rejects online registration for a non-call-agent', async () => {
    userRepo.findById.mockResolvedValue({_id: 'farmer-1', role: 'farmer'});

    await expect(service.setAgentOnline('farmer-1'))
      .rejects.toBeInstanceOf(BadRequestError);
    expect(userRepo.edit).not.toHaveBeenCalled();
  });

  it('updates the heartbeat timestamp for a call agent', async () => {
    userRepo.findById.mockResolvedValue(agent());
    userRepo.edit.mockResolvedValue(agent());

    await service.updateAgentHeartbeat('agent-user-1');

    expect(userRepo.edit).toHaveBeenCalledWith(
      'agent-user-1',
      {lastAgentActiveAt: expect.any(Date)},
      session,
    );
  });

  it('takes only agents with expired heartbeats offline', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T10:00:00Z'));
    const stale = agent({
      _id: 'stale-agent',
      agent: 'agent_1',
      isCallAgentActive: true,
      lastAgentActiveAt: new Date('2026-07-29T09:58:00Z'),
    });
    const fresh = agent({
      _id: 'fresh-agent',
      agent: 'agent_2',
      isCallAgentActive: true,
      lastAgentActiveAt: new Date('2026-07-29T09:59:30Z'),
    });
    userRepo.findActiveCallAgents.mockResolvedValue([stale, fresh]);
    userRepo.findById.mockImplementation(async id =>
      id === 'stale-agent' ? stale : fresh,
    );
    userRepo.edit.mockResolvedValue(agent());

    await service.cleanupInactiveAgents();

    expect(userRepo.edit).toHaveBeenCalledOnce();
    expect(userRepo.edit).toHaveBeenCalledWith(
      'stale-agent',
      expect.objectContaining({isCallAgentActive: false}),
      session,
    );
    vi.useRealTimers();
  });
});
