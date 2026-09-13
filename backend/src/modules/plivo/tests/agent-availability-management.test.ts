import 'reflect-metadata';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {BadRequestError} from 'routing-controllers';
import {UserService} from '#root/modules/user/services/UserService.js';
import {IUser} from '#root/shared/interfaces/models.js';

vi.mock('#root/modules/notification/services/NotificationService.js', () => ({
  NotificationService: class NotificationService {},
}));

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
    edit: vi.fn(),
    findAndMarkAvailableAgent: vi.fn(),
  };

  const mongoDatabase = {
    getClient: vi.fn().mockResolvedValue({
      startSession: vi.fn(() => session),
    }),
  };

  let service: UserService;

  const callAgent = (overrides: Partial<IUser> = {}): IUser =>
    ({
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
    mongoDatabase.getClient.mockResolvedValue({
      startSession: vi.fn(() => session),
    });
    service = new UserService(
      userRepo as any,
      {} as any,
      mongoDatabase as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('registers the first agent as available', async () => {
    // Arrange
    const registeredAgent = callAgent({
      agent: 'agent_1',
      isCallAgentActive: true,
    });
    userRepo.findById.mockResolvedValue(callAgent());
    userRepo.findCallAgents.mockResolvedValue([]);
    userRepo.edit.mockResolvedValue(registeredAgent);

    // Act
    const result = await service.setAgentOnline('agent-user-1');

    // Assert
    expect(userRepo.edit).toHaveBeenCalledWith(
      'agent-user-1',
      {
        agent: 'agent_1',
        isCallAgentActive: true,
        isBusy: false,
        currentCallUuid: null,
      },
      session,
    );
    expect(result).toEqual(registeredAgent);
  });

  it('registers a second agent in the next available position', async () => {
    // Arrange
    const registeredAgent = callAgent({
      _id: 'agent-user-2',
      agent: 'agent_2',
      isCallAgentActive: true,
    });
    userRepo.findById.mockResolvedValue(callAgent({_id: 'agent-user-2'}));
    userRepo.findCallAgents.mockResolvedValue([
      callAgent({agent: 'agent_1', isCallAgentActive: true}),
    ]);
    userRepo.edit.mockResolvedValue(registeredAgent);

    // Act
    const result = await service.setAgentOnline('agent-user-2');

    // Assert
    expect(userRepo.edit).toHaveBeenCalledWith(
      'agent-user-2',
      expect.objectContaining({
        agent: 'agent_2',
        isCallAgentActive: true,
        isBusy: false,
        currentCallUuid: null,
      }),
      session,
    );
    expect(result).toEqual(registeredAgent);
  });

  it('takes an agent offline and releases their position', async () => {
    // Arrange
    const offlineAgent = callAgent();
    userRepo.findById.mockResolvedValue(
      callAgent({
        agent: 'agent_1',
        isCallAgentActive: true,
        isBusy: true,
        currentCallUuid: 'call-1',
      }),
    );
    userRepo.edit.mockResolvedValue(offlineAgent);

    // Act
    const result = await service.setAgentOffline('agent-user-1');

    // Assert
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
    expect(result).toEqual(offlineAgent);
  });

  it('selects the lowest numbered free agent', async () => {
    // Arrange
    const agentOne = callAgent({
      agent: 'agent_1',
      isCallAgentActive: true,
    });
    userRepo.findCallAgents.mockResolvedValue([
      callAgent({_id: 'agent-user-3', agent: 'agent_3', isCallAgentActive: true}),
      agentOne,
      callAgent({_id: 'agent-user-2', agent: 'agent_2', isCallAgentActive: true}),
    ]);

    // Act
    const result = await service.findAvailableAgent();

    // Assert
    expect(result).toEqual(agentOne);
  });

  it('skips a busy agent when routing a call', async () => {
    // Arrange
    const freeAgent = callAgent({
      _id: 'agent-user-2',
      agent: 'agent_2',
      isCallAgentActive: true,
    });
    userRepo.findCallAgents.mockResolvedValue([
      callAgent({
        agent: 'agent_1',
        isCallAgentActive: true,
        isBusy: true,
        currentCallUuid: 'active-call',
      }),
      freeAgent,
    ]);

    // Act
    const result = await service.findAvailableAgent();

    // Assert
    expect(result).toEqual(freeAgent);
  });

  it('reports no agent when nobody is available', async () => {
    // Arrange
    userRepo.findCallAgents.mockResolvedValue([
      callAgent({agent: 'agent_1', isCallAgentActive: false}),
      callAgent({
        _id: 'agent-user-2',
        agent: 'agent_2',
        isCallAgentActive: true,
        isBusy: true,
      }),
    ]);

    // Act
    const result = await service.findAvailableAgent();

    // Assert
    expect(result).toBeNull();
  });

  it('marks an assigned agent as busy for the call', async () => {
    // Arrange
    const busyAgent = callAgent({
      agent: 'agent_1',
      isCallAgentActive: true,
      isBusy: true,
      currentCallUuid: 'call-123',
    });
    userRepo.findById.mockResolvedValue(
      callAgent({agent: 'agent_1', isCallAgentActive: true}),
    );
    userRepo.edit.mockResolvedValue(busyAgent);

    // Act
    const result = await service.markAgentAsBusy('agent-user-1', 'call-123');

    // Assert
    expect(userRepo.edit).toHaveBeenCalledWith(
      'agent-user-1',
      {isBusy: true, currentCallUuid: 'call-123'},
      session,
    );
    expect(result).toEqual(busyAgent);
  });

  it('returns an agent to available after the call ends', async () => {
    // Arrange
    const availableAgent = callAgent({
      agent: 'agent_1',
      isCallAgentActive: true,
    });
    userRepo.findById.mockResolvedValue(
      callAgent({
        agent: 'agent_1',
        isCallAgentActive: true,
        isBusy: true,
        currentCallUuid: 'call-123',
      }),
    );
    userRepo.edit.mockResolvedValue(availableAgent);

    // Act
    const result = await service.markAgentAsAvailable('agent-user-1');

    // Assert
    expect(userRepo.edit).toHaveBeenCalledWith(
      'agent-user-1',
      {isBusy: false, currentCallUuid: null},
      session,
    );
    expect(result).toEqual(availableAgent);
  });

  it('rejects online registration for a non-call-agent', async () => {
    // Arrange
    userRepo.findById.mockResolvedValue({
      _id: 'farmer-user-1',
      role: 'farmer',
    });

    // Act
    const action = service.setAgentOnline('farmer-user-1');

    // Assert
    await expect(action).rejects.toBeInstanceOf(BadRequestError);
    expect(userRepo.edit).not.toHaveBeenCalled();
  });

  it.todo(
    'marks an agent offline when heartbeat cleanup detects an expired heartbeat',
  );
});
