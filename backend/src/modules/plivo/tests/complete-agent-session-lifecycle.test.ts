import 'reflect-metadata';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {PlivoController} from '#root/modules/plivo/controllers/PlivoController.js';
import {initWebSocket} from '#root/bootstrap/websocket.js';

const mocks = vi.hoisted(() => {
  type Handler = (...args: any[]) => any;

  class MockSocket {
    readyState = 1;
    send = vi.fn();
    private handlers = new Map<string, Handler[]>();

    on(event: string, handler: Handler): this {
      const handlers = this.handlers.get(event) ?? [];
      handlers.push(handler);
      this.handlers.set(event, handlers);
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
    options: unknown;
    private handlers = new Map<string, Handler>();

    constructor(options: unknown) {
      this.options = options;
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

  const agentMappings = new Map<string, string>();
  const transcriptCallbacks = new Map<string, Handler>();

  const plivoService = {
    setCallAgent: vi.fn((callId: string, agentId: string) => {
      agentMappings.set(callId, agentId);
    }),
    getCallAgent: vi.fn((callId: string) => agentMappings.get(callId)),
    initializeStreams: vi.fn((callId: string, callback: Handler) => {
      transcriptCallbacks.set(callId, callback);
    }),
    transcribeAudio: vi.fn().mockResolvedValue({
      originalText: '',
      translatedText: '',
    }),
    processRemainingAudio: vi.fn().mockResolvedValue({
      inbound: {originalText: '', translatedText: ''},
      outbound: {originalText: '', translatedText: ''},
    }),
    getTranscript: vi.fn((_callId: string, track: string) =>
      track === 'inbound' ? 'मुझे गेहूं की जानकारी चाहिए' : 'I can help',
    ),
    getTranslation: vi.fn((_callId: string, track: string) =>
      track === 'inbound' ? 'I need information about wheat' : 'I can help',
    ),
    getDetectedLanguage: vi.fn((_callId: string, track: string) =>
      track === 'inbound' ? 'hi-IN' : 'en-IN',
    ),
    saveCallDetails: vi.fn().mockResolvedValue(undefined),
    clearTranscript: vi.fn((callId: string) => {
      agentMappings.delete(callId);
    }),
  };

  const userService = {
    findAndMarkAvailableAgent: vi.fn(),
    markAgentAsAvailable: vi.fn().mockResolvedValue(undefined),
  };

  const container = {
    get: vi.fn((token: symbol) =>
      String(token).includes('PlivoService') ? plivoService : userService,
    ),
  };

  return {
    MockSocket,
    MockWebSocketServer,
    agentMappings,
    transcriptCallbacks,
    plivoService,
    userService,
    container,
    getContainer: vi.fn(() => container),
    getAgentCredentials: vi.fn(() => ({
      username: 'agent_1-endpoint',
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
      streamUrl: 'wss://acc.example.test/audio',
      plivo_number: '+911234567890',
      getAgentCredentials: mocks.getAgentCredentials,
    },
  },
}));

vi.mock('../../../bootstrap/loadModules.js', () => ({
  getContainer: mocks.getContainer,
}));

describe('Complete ACC Agent Session Lifecycle', () => {
  const callId = 'complete-call-123';
  const agentUserId = 'agent-user-1';

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.MockWebSocketServer.instances.length = 0;
    mocks.agentMappings.clear();
    mocks.transcriptCallbacks.clear();
    mocks.userService.findAndMarkAvailableAgent.mockResolvedValue({
      _id: agentUserId,
      role: 'call_agent',
      agent: 'agent_1',
      isCallAgentActive: true,
      isBusy: true,
      currentCallUuid: callId,
    });
    mocks.userService.markAgentAsAvailable.mockResolvedValue(undefined);
    mocks.plivoService.processRemainingAudio.mockResolvedValue({
      inbound: {originalText: '', translatedText: ''},
      outbound: {originalText: '', translatedText: ''},
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('completes answer, streaming, transcription, persistence, cleanup, and release', async () => {
    // Arrange: Plivo answer webhook reserves and connects the agent.
    const controller = new PlivoController(
      {} as any,
      mocks.userService as any,
      mocks.plivoService as any,
    );
    const response = {
      set: vi.fn(),
      send: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };

    // Act: answer the incoming call.
    await controller.answer(
      {body: {CallUUID: callId}, query: {}} as any,
      response as any,
    );

    // Assert: routing reserved the agent and returned connection XML.
    expect(mocks.userService.findAndMarkAvailableAgent)
      .toHaveBeenCalledWith(callId);
    expect(mocks.plivoService.setCallAgent)
      .toHaveBeenCalledWith(callId, agentUserId);
    expect(response.send).toHaveBeenCalledWith(
      expect.stringContaining('<User>agent_1-endpoint</User>'),
    );

    // Arrange: create the mocked backend stream and dashboard client.
    initWebSocket({} as any);
    const server = mocks.MockWebSocketServer.instances[0];
    const callSocket = new mocks.MockSocket();
    const dashboardSocket = new mocks.MockSocket();
    server.clients.add(dashboardSocket);
    await server.connect(callSocket);

    // Act: Plivo starts streaming both participant tracks.
    await callSocket.emit(
      'message',
      Buffer.from(JSON.stringify({
        event: 'start',
        start: {callId},
      })),
    );
    const inboundAudio = Buffer.from('farmer audio');
    const outboundAudio = Buffer.from('agent audio');
    await callSocket.emit(
      'message',
      Buffer.from(JSON.stringify({
        event: 'media',
        media: {
          track: 'inbound',
          payload: inboundAudio.toString('base64'),
        },
      })),
    );
    await callSocket.emit(
      'message',
      Buffer.from(JSON.stringify({
        event: 'media',
        media: {
          track: 'outbound',
          payload: outboundAudio.toString('base64'),
        },
      })),
    );

    // Assert: ACC initialized Sarvam and forwarded both audio tracks.
    expect(mocks.plivoService.initializeStreams)
      .toHaveBeenCalledWith(callId, expect.any(Function));
    expect(mocks.plivoService.transcribeAudio).toHaveBeenNthCalledWith(
      1,
      inboundAudio,
      callId,
      'inbound',
    );
    expect(mocks.plivoService.transcribeAudio).toHaveBeenNthCalledWith(
      2,
      outboundAudio,
      callId,
      'outbound',
    );

    // Act: mocked Sarvam emits live farmer and agent results.
    const transcriptCallback = mocks.transcriptCallbacks.get(callId);
    transcriptCallback?.({
      track: 'inbound',
      originalText: 'मुझे गेहूं की जानकारी चाहिए',
      translatedText: 'I need information about wheat',
      detectedLanguage: 'hi-IN',
    });
    transcriptCallback?.({
      track: 'outbound',
      originalText: 'I can help',
      translatedText: 'I can help',
      detectedLanguage: 'en-IN',
    });

    // Assert: the dashboard receives both live transcript events.
    const liveMessages = dashboardSocket.send.mock.calls
      .map(([payload]) => JSON.parse(payload))
      .filter(message => message.type === 'transcript');
    expect(liveMessages).toEqual([
      expect.objectContaining({
        callId,
        track: 'inbound',
        detectedLanguage: 'hi-IN',
      }),
      expect.objectContaining({
        callId,
        track: 'outbound',
        detectedLanguage: 'en-IN',
      }),
    ]);

    // Act: Plivo ends the call.
    await callSocket.emit(
      'message',
      Buffer.from(JSON.stringify({event: 'stop'})),
    );

    // Assert: finalization happens before persistence, cleanup, and release.
    expect(mocks.plivoService.processRemainingAudio)
      .toHaveBeenCalledWith(callId);
    expect(mocks.plivoService.saveCallDetails).toHaveBeenCalledWith(callId);
    expect(mocks.plivoService.clearTranscript).toHaveBeenCalledWith(callId);
    expect(mocks.userService.markAgentAsAvailable)
      .toHaveBeenCalledWith(agentUserId);
    expect(mocks.plivoService.processRemainingAudio.mock.invocationCallOrder[0])
      .toBeLessThan(
        mocks.plivoService.saveCallDetails.mock.invocationCallOrder[0],
      );
    expect(mocks.plivoService.saveCallDetails.mock.invocationCallOrder[0])
      .toBeLessThan(
        mocks.plivoService.clearTranscript.mock.invocationCallOrder[0],
      );
    expect(mocks.plivoService.clearTranscript.mock.invocationCallOrder[0])
      .toBeLessThan(
        mocks.userService.markAgentAsAvailable.mock.invocationCallOrder[0],
      );
    expect(mocks.agentMappings.has(callId)).toBe(false);

    const callEndMessage = dashboardSocket.send.mock.calls
      .map(([payload]) => JSON.parse(payload))
      .find(message => message.type === 'call_end');
    expect(callEndMessage).toEqual(
      expect.objectContaining({
        callId,
        caller: expect.objectContaining({
          transcript: 'मुझे गेहूं की जानकारी चाहिए',
          translation: 'I need information about wheat',
        }),
        agent: expect.objectContaining({
          transcript: 'I can help',
          translation: 'I can help',
        }),
      }),
    );

    // Act: a later socket close must not repeat call wrap-up.
    await callSocket.emit('close');

    // Assert
    expect(mocks.plivoService.saveCallDetails).toHaveBeenCalledOnce();
    expect(mocks.userService.markAgentAsAvailable).toHaveBeenCalledOnce();
  });
});
