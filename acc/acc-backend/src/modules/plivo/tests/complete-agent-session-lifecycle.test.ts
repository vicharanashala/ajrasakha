import 'reflect-metadata';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {PlivoController} from '#root/modules/plivo/controllers/PlivoController.js';
import {initWebSocket} from '#root/bootstrap/websocket.js';

const mocks = vi.hoisted(() => {
  type Handler = (...args: any[]) => any;
  class MockSocket {
    readyState = 1;
    send = vi.fn();
    handlers = new Map<string, Handler[]>();
    on(event: string, handler: Handler): this {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
      return this;
    }
    async emit(event: string, ...args: any[]): Promise<void> {
      for (const handler of this.handlers.get(event) ?? []) {
        await handler(...args);
      }
    }
  }
  class MockWebSocketServer {
    static instances: MockWebSocketServer[] = [];
    clients = new Set<MockSocket>();
    handlers = new Map<string, Handler>();
    constructor(public options: unknown) {
      MockWebSocketServer.instances.push(this);
    }
    on(event: string, handler: Handler): this {
      this.handlers.set(event, handler);
      return this;
    }
    async connect(socket: MockSocket): Promise<void> {
      this.clients.add(socket);
      await this.handlers.get('connection')?.(socket, {});
    }
  }
  const mappings = new Map<string, string>();
  const callbacks = new Map<string, Handler>();
  const plivoService = {
    setCallAgent: vi.fn((callId, agentId) => mappings.set(callId, agentId)),
    getCallAgent: vi.fn(callId => mappings.get(callId)),
    initializeStreams: vi.fn((callId, callback) => callbacks.set(callId, callback)),
    transcribeAudio: vi.fn().mockResolvedValue({}),
    processRemainingAudio: vi.fn().mockResolvedValue({
      inbound: {originalText: '', translatedText: ''},
      outbound: {originalText: '', translatedText: ''},
    }),
    getTranscript: vi.fn((_id, track) =>
      track === 'inbound' ? 'Farmer question' : 'Agent response',
    ),
    getTranslation: vi.fn((_id, track) =>
      track === 'inbound' ? 'Translated question' : 'Agent response',
    ),
    getDetectedLanguage: vi.fn((_id, track) =>
      track === 'inbound' ? 'hi-IN' : 'en-IN',
    ),
    saveCallDetails: vi.fn().mockResolvedValue(undefined),
    clearTranscript: vi.fn(callId => mappings.delete(callId)),
  };
  const userService = {
    markAgentAsAvailable: vi.fn().mockResolvedValue(undefined),
  };
  return {
    MockSocket,
    MockWebSocketServer,
    mappings,
    callbacks,
    plivoService,
    userService,
    getContainer: vi.fn(() => ({
      get: vi.fn((token: symbol) =>
        String(token).includes('PlivoService') ? plivoService : userService,
      ),
    })),
    plivoClientConstructor: vi.fn(),
  };
});

vi.mock('ws', () => ({
  WebSocket: class WebSocket {
    static OPEN = 1;
    static CLOSED = 3;
  },
  WebSocketServer: mocks.MockWebSocketServer,
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
vi.mock('../../../bootstrap/loadModules.js', () => ({
  getContainer: mocks.getContainer,
}));

describe('Complete ACC Agent Session Lifecycle', () => {
  const callId = 'complete-call-123';
  const agentId = 'agent-user-1';
  const userRepository = {
    findCallAgents: vi.fn(),
  };
  const assignment = {
    findAndMarkAvailableAgent: vi.fn(),
    getAgentCredentials: vi.fn(),
    markAgentAsAvailable: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.MockWebSocketServer.instances.length = 0;
    mocks.mappings.clear();
    mocks.callbacks.clear();
    assignment.findAndMarkAvailableAgent.mockResolvedValue({
      _id: agentId,
      role: 'call_agent',
      agent: 'agent_1',
      isBusy: true,
      currentCallUuid: callId,
    });
    assignment.getAgentCredentials.mockResolvedValue({
      username: 'agent_1-endpoint',
    });
    userRepository.findCallAgents.mockResolvedValue([
      {_id: agentId, agent: 'agent_1', currentCallUuid: callId},
    ]);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('completes routing, streaming, wrap-up, and call-ended release', async () => {
    const controller = new PlivoController(
      {} as any,
      userRepository as any,
      assignment as any,
      mocks.plivoService as any,
      {} as any,
      {} as any,
    );
    const response = {
      set: vi.fn(),
      send: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };

    await controller.answer(
      {body: {CallUUID: callId, From: '+919900000001'}, query: {}} as any,
      response as any,
    );
    expect(mocks.plivoService.setCallAgent)
      .toHaveBeenCalledWith(callId, agentId);

    initWebSocket({} as any);
    const server = mocks.MockWebSocketServer.instances[0];
    const callSocket = new mocks.MockSocket();
    const dashboard = new mocks.MockSocket();
    (dashboard as any).userId = agentId;
    (dashboard as any).userRole = 'call_agent';
    server.clients.add(dashboard);
    await server.connect(callSocket);

    await callSocket.emit('message', Buffer.from(JSON.stringify({
      event: 'start',
      start: {callId},
    })));
    const inbound = Buffer.from('farmer audio');
    const outbound = Buffer.from('agent audio');
    await callSocket.emit('message', Buffer.from(JSON.stringify({
      event: 'media',
      media: {track: 'inbound', payload: inbound.toString('base64')},
    })));
    await callSocket.emit('message', Buffer.from(JSON.stringify({
      event: 'media',
      media: {track: 'outbound', payload: outbound.toString('base64')},
    })));

    expect(mocks.plivoService.transcribeAudio)
      .toHaveBeenNthCalledWith(1, inbound, callId, 'inbound');
    expect(mocks.plivoService.transcribeAudio)
      .toHaveBeenNthCalledWith(2, outbound, callId, 'outbound');

    const callback = mocks.callbacks.get(callId)!;
    callback({
      track: 'inbound',
      originalText: 'Farmer question',
      translatedText: 'Translated question',
      detectedLanguage: 'hi-IN',
    });
    expect(dashboard.send).toHaveBeenCalledWith(
      expect.stringContaining('"type":"transcript"'),
    );

    await callSocket.emit('message', Buffer.from(JSON.stringify({
      event: 'stop',
    })));
    expect(mocks.plivoService.processRemainingAudio).toHaveBeenCalledWith(callId);
    expect(mocks.plivoService.saveCallDetails).toHaveBeenCalledWith(callId);
    expect(mocks.plivoService.clearTranscript).toHaveBeenCalledWith(callId);
    expect(mocks.userService.markAgentAsAvailable).toHaveBeenCalledWith(agentId);

    await callSocket.emit('close');
    expect(mocks.plivoService.saveCallDetails).toHaveBeenCalledOnce();
  });
});
