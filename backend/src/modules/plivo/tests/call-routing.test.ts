import 'reflect-metadata';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {PlivoController} from '#root/modules/plivo/controllers/PlivoController.js';

const mocks = vi.hoisted(() => ({
  plivoClient: {
    calls: {
      list: vi.fn(),
    },
  },
  plivoClientConstructor: vi.fn(),
  getAgentCredentials: vi.fn((agentNumber: string) => ({
    username: `${agentNumber}-endpoint`,
  })),
}));

vi.mock('plivo', () => ({
  default: {
    Client: mocks.plivoClientConstructor.mockImplementation(
      () => mocks.plivoClient,
    ),
  },
}));

vi.mock('#root/config/app.js', () => ({
  appConfig: {
    plivo: {
      streamUrl: 'wss://acc.example.test/audio',
      plivo_number: '+911234567890',
      getAgentCredentials: mocks.getAgentCredentials,
    },
  },
}));

describe('ACC Call Routing', () => {
  const callDetailsRepository = {};
  const userService = {
    findAndMarkAvailableAgent: vi.fn(),
    markAgentAsAvailable: vi.fn(),
  };
  const plivoService = {
    setCallAgent: vi.fn(),
  };

  let controller: PlivoController;
  let response: {
    set: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    response = {
      set: vi.fn(),
      send: vi.fn(),
      status: vi.fn(),
    };
    response.status.mockReturnValue(response);
    controller = new PlivoController(
      callDetailsRepository as any,
      userService as any,
      plivoService as any,
    );
  });

  it('routes an incoming call to the atomically reserved agent', async () => {
    // Arrange
    userService.findAndMarkAvailableAgent.mockResolvedValue({
      _id: 'agent-user-1',
      role: 'call_agent',
      agent: 'agent_1',
      isCallAgentActive: true,
      isBusy: true,
      currentCallUuid: 'call-123',
    });
    const request = {
      body: {CallUUID: 'call-123'},
      query: {},
    };

    // Act
    await controller.answer(request as any, response as any);

    // Assert
    expect(userService.findAndMarkAvailableAgent)
      .toHaveBeenCalledWith('call-123');
    expect(mocks.getAgentCredentials).toHaveBeenCalledWith('agent_1');
    expect(plivoService.setCallAgent)
      .toHaveBeenCalledWith('call-123', 'agent-user-1');
    expect(response.set).toHaveBeenCalledWith('Content-Type', 'text/xml');
    expect(response.send).toHaveBeenCalledWith(
      expect.stringContaining('<User>agent_1-endpoint</User>'),
    );
  });

  it('streams both call tracks before connecting the agent', async () => {
    // Arrange
    userService.findAndMarkAvailableAgent.mockResolvedValue({
      _id: 'agent-user-2',
      role: 'call_agent',
      agent: 'agent_2',
    });

    // Act
    await controller.answer(
      {body: {CallUUID: 'call-456'}, query: {}} as any,
      response as any,
    );

    // Assert
    const xml = response.send.mock.calls[0][0] as string;
    expect(xml).toContain(
      '<Stream contentType="audio/x-l16;rate=16000"',
    );
    expect(xml).toContain('audioTrack="both"');
    expect(xml).toContain('wss://acc.example.test/audio</Stream>');
    expect(xml.indexOf('<Stream')).toBeLessThan(xml.indexOf('<Dial'));
  });

  it('returns a busy response without dialing when no agent is available', async () => {
    // Arrange
    userService.findAndMarkAvailableAgent.mockResolvedValue(null);

    // Act
    await controller.answer(
      {body: {CallUUID: 'call-789'}, query: {}} as any,
      response as any,
    );

    // Assert
    const xml = response.send.mock.calls[0][0] as string;
    expect(xml).toContain('All agents are busy. Please call back later.');
    expect(xml).toContain('<Hangup />');
    expect(xml).not.toContain('<Dial');
    expect(plivoService.setCallAgent).not.toHaveBeenCalled();
  });

  it('accepts the Plivo call UUID from the query string', async () => {
    // Arrange
    userService.findAndMarkAvailableAgent.mockResolvedValue(null);

    // Act
    await controller.answer(
      {body: {}, query: {CallUUID: 'query-call-123'}} as any,
      response as any,
    );

    // Assert
    expect(userService.findAndMarkAvailableAgent)
      .toHaveBeenCalledWith('query-call-123');
  });

  it('releases a reserved agent if response construction fails', async () => {
    // Arrange
    userService.findAndMarkAvailableAgent.mockResolvedValue({
      _id: 'agent-user-1',
      role: 'call_agent',
      agent: 'agent_1',
    });
    mocks.getAgentCredentials.mockImplementationOnce(() => {
      throw new Error('missing endpoint credentials');
    });
    userService.markAgentAsAvailable.mockResolvedValue({});
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    // Act
    await controller.answer(
      {body: {CallUUID: 'call-error'}, query: {}} as any,
      response as any,
    );

    // Assert
    expect(userService.markAgentAsAvailable)
      .toHaveBeenCalledWith('agent-user-1');
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.send).toHaveBeenCalledWith('Internal Server Error');
    consoleError.mockRestore();
  });
});
