import 'reflect-metadata';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {PlivoController} from '#root/modules/plivo/controllers/PlivoController.js';

const mocks = vi.hoisted(() => ({
  plivoClientConstructor: vi.fn(),
}));

vi.mock('plivo', () => ({
  default: {
    Client: mocks.plivoClientConstructor.mockImplementation(() => ({
      calls: {list: vi.fn()},
    })),
  },
}));

vi.mock('#root/config/app.js', () => ({
  appConfig: {
    plivo: {
      streamUrl: 'wss://acc.example.test/plivo-stream',
      plivo_number: '+911234567890',
    },
  },
}));

describe('ACC Call Routing', () => {
  const userRepository = {
    findCallAgents: vi.fn(),
  };
  const agentAssignmentService = {
    findAndMarkAvailableAgent: vi.fn(),
    getAgentCredentials: vi.fn(),
    markAgentAsAvailable: vi.fn(),
  };
  const plivoService = {
    setCallAgent: vi.fn(),
  };
  let controller: PlivoController;
  let response: any;

  beforeEach(() => {
    vi.clearAllMocks();
    response = {
      set: vi.fn(),
      send: vi.fn(),
      status: vi.fn(),
    };
    response.status.mockReturnValue(response);
    agentAssignmentService.getAgentCredentials.mockResolvedValue({
      username: 'agent_1-endpoint',
    });
    controller = new PlivoController(
      {} as any,
      userRepository as any,
      agentAssignmentService as any,
      plivoService as any,
      {} as any,
      {} as any,
    );
  });

  it('atomically reserves and routes an incoming call', async () => {
    agentAssignmentService.findAndMarkAvailableAgent.mockResolvedValue({
      _id: 'agent-user-1',
      role: 'call_agent',
      agent: 'agent_1',
      isBusy: true,
      currentCallUuid: 'call-123',
    });

    await controller.answer(
      {body: {CallUUID: 'call-123', From: '+919900000001'}, query: {}} as any,
      response,
    );

    expect(agentAssignmentService.findAndMarkAvailableAgent)
      .toHaveBeenCalledWith('call-123');
    expect(agentAssignmentService.getAgentCredentials)
      .toHaveBeenCalledWith('agent_1');
    expect(plivoService.setCallAgent)
      .toHaveBeenCalledWith('call-123', 'agent-user-1');
    const xml = response.send.mock.calls[0][0] as string;
    expect(xml).toContain('wss://acc.example.test/plivo-stream</Stream>');
    expect(xml).toContain('audioTrack="both"');
    expect(xml).toContain('<User>agent_1-endpoint</User>');
  });

  it('returns the busy response without dialing when no agent is free', async () => {
    agentAssignmentService.findAndMarkAvailableAgent.mockResolvedValue(null);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await controller.answer(
      {body: {CallUUID: 'call-456'}, query: {}} as any,
      response,
    );

    const xml = response.send.mock.calls[0][0] as string;
    expect(xml).toContain('All agents are busy. Please call back later.');
    expect(xml).toContain('<Hangup />');
    expect(xml).not.toContain('<Dial');
    expect(plivoService.setCallAgent).not.toHaveBeenCalled();
  });

  it('releases a reserved agent if endpoint routing fails', async () => {
    agentAssignmentService.findAndMarkAvailableAgent.mockResolvedValue({
      _id: 'agent-user-1',
      role: 'call_agent',
      agent: 'agent_1',
    });
    agentAssignmentService.getAgentCredentials.mockRejectedValue(
      new Error('credentials unavailable'),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await controller.answer(
      {body: {CallUUID: 'call-error'}, query: {}} as any,
      response,
    );

    expect(agentAssignmentService.markAgentAsAvailable)
      .toHaveBeenCalledWith('agent-user-1');
    expect(response.status).toHaveBeenCalledWith(500);
  });

  it('releases the mapped agent on the Plivo call-ended webhook', async () => {
    userRepository.findCallAgents.mockResolvedValue([
      {
        _id: 'agent-user-1',
        agent: 'agent_1',
        currentCallUuid: 'call-ended',
      },
      {
        _id: 'agent-user-2',
        agent: 'agent_2',
        currentCallUuid: 'other-call',
      },
    ]);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await controller.handleCallEnded(
      {body: {CallUUID: 'call-ended'}, query: {}} as any,
      response,
    );

    expect(agentAssignmentService.markAgentAsAvailable)
      .toHaveBeenCalledWith('agent-user-1');
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.send).toHaveBeenCalledWith('OK');
  });
});
