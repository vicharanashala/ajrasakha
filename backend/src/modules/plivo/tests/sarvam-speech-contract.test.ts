import 'reflect-metadata';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {PlivoService} from '#root/modules/plivo/services/PlivoService.js';

const mocks = vi.hoisted(() => {
  type Handler = (...args: any[]) => void;

  class MockWebSocket {
    static OPEN = 1;
    static CLOSED = 3;

    url: string;
    options: unknown;
    readyState = MockWebSocket.OPEN;
    send = vi.fn();
    close = vi.fn(() => {
      this.readyState = MockWebSocket.CLOSED;
    });
    private handlers = new Map<string, Handler[]>();

    constructor(url: string, options: unknown) {
      this.url = url;
      this.options = options;
      mocks.sockets.push(this);
    }

    on(event: string, handler: Handler): this {
      const eventHandlers = this.handlers.get(event) ?? [];
      eventHandlers.push(handler);
      this.handlers.set(event, eventHandlers);
      return this;
    }

    emit(event: string, ...args: any[]): void {
      for (const handler of this.handlers.get(event) ?? []) {
        handler(...args);
      }
    }
  }

  return {
    sockets: [] as MockWebSocket[],
    MockWebSocket,
    plivoClient: {},
    plivoClientConstructor: vi.fn(),
  };
});

vi.mock('ws', () => ({
  WebSocket: mocks.MockWebSocket,
}));

vi.mock('plivo', () => ({
  default: {
    Client: mocks.plivoClientConstructor.mockImplementation(
      () => mocks.plivoClient,
    ),
  },
}));

vi.mock('../../../config/app.js', () => ({
  appConfig: {
    sarvamAPI: 'test-sarvam-api-key',
  },
}));

describe('Sarvam Speech Contract', () => {
  const callId = 'call-123';
  const callDetailsRepository = {
    create: vi.fn(),
    edit: vi.fn(),
  };

  let service: PlivoService;
  let onTranscript: ReturnType<typeof vi.fn>;
  let consoleError: ReturnType<typeof vi.spyOn>;
  let consoleLog: ReturnType<typeof vi.spyOn>;

  const initializeCall = (): void => {
    service.initializeStreams(callId, onTranscript);
  };

  const emitMessage = (
    socketIndex: number,
    message: Record<string, unknown>,
  ): void => {
    mocks.sockets[socketIndex].emit(
      'message',
      Buffer.from(JSON.stringify(message)),
    );
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.sockets.length = 0;
    onTranscript = vi.fn();
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    service = new PlivoService(callDetailsRepository as any);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    consoleError.mockRestore();
    consoleLog.mockRestore();
  });

  it('opens four speech sockets for one call', () => {
    // Arrange / Act
    initializeCall();

    // Assert
    expect(mocks.sockets).toHaveLength(4);
  });

  it('opens transcribe sockets with the required speech contract', () => {
    // Arrange / Act
    initializeCall();
    const transcribeSockets = [mocks.sockets[0], mocks.sockets[2]];

    // Assert
    for (const socket of transcribeSockets) {
      const url = new URL(socket.url);
      expect(url.pathname).toBe('/speech-to-text/ws');
      expect(url.searchParams.get('model')).toBe('saaras:v3');
      expect(url.searchParams.get('mode')).toBe('transcribe');
      expect(url.searchParams.get('sample_rate')).toBe('16000');
      expect(url.searchParams.get('input_audio_codec')).toBe('pcm_l16');
    }
  });

  it('opens translate sockets with the required speech contract', () => {
    // Arrange / Act
    initializeCall();
    const translateSockets = [mocks.sockets[1], mocks.sockets[3]];

    // Assert
    for (const socket of translateSockets) {
      const url = new URL(socket.url);
      expect(url.pathname).toBe('/speech-to-text/ws');
      expect(url.searchParams.get('model')).toBe('saaras:v3');
      expect(url.searchParams.get('mode')).toBe('translate');
      expect(url.searchParams.get('sample_rate')).toBe('16000');
      expect(url.searchParams.get('input_audio_codec')).toBe('pcm_l16');
    }
  });

  it('never uses the text translation model for speech sockets', () => {
    // Arrange / Act
    initializeCall();

    // Assert
    expect(mocks.sockets.every(socket => !socket.url.includes('mayura:v1')))
      .toBe(true);
  });

  it('sends audio to Sarvam in the expected payload format', async () => {
    // Arrange
    initializeCall();
    mocks.sockets[0].emit('open');
    mocks.sockets[1].emit('open');
    const audio = Buffer.from([1, 2, 3, 4]);

    // Act
    await service.transcribeAudio(audio, callId, 'inbound');

    // Assert
    const expectedPayload = {
      audio: {
        data: audio.toString('base64'),
        sample_rate: '16000',
        encoding: 'audio/wav',
      },
    };
    expect(JSON.parse(mocks.sockets[0].send.mock.calls[0][0]))
      .toEqual(expectedPayload);
    expect(JSON.parse(mocks.sockets[1].send.mock.calls[0][0]))
      .toEqual(expectedPayload);
  });

  it('handles transcript responses with the detected language', async () => {
    // Arrange
    initializeCall();

    // Act
    emitMessage(0, {
      type: 'data',
      data: {transcript: 'नमस्ते', language_code: 'hi-IN'},
    });
    await vi.advanceTimersByTimeAsync(1000);

    // Assert
    expect(onTranscript).toHaveBeenCalledWith({
      track: 'inbound',
      originalText: 'नमस्ते',
      translatedText: '',
      detectedLanguage: 'hi-IN',
    });
    expect(service.getTranscript(callId, 'inbound')).toBe('नमस्ते');
    expect(service.getDetectedLanguage(callId, 'inbound')).toBe('hi-IN');
  });

  it('handles translated speech responses', async () => {
    // Arrange
    initializeCall();

    // Act
    emitMessage(1, {
      type: 'data',
      data: {transcript: 'Hello'},
    });
    await vi.advanceTimersByTimeAsync(1000);

    // Assert
    expect(onTranscript).toHaveBeenCalledWith({
      track: 'inbound',
      originalText: '',
      translatedText: 'Hello',
      detectedLanguage: 'unknown',
    });
    expect(service.getTranslation(callId, 'inbound')).toBe('Hello');
  });

  it('handles Sarvam error responses without producing transcript data', () => {
    // Arrange
    initializeCall();

    // Act / Assert
    expect(() => {
      emitMessage(0, {
        type: 'error',
        data: {message: 'bad audio'},
      });
    }).not.toThrow();
    expect(onTranscript).not.toHaveBeenCalled();
    expect(service.getTranscript(callId, 'inbound')).toBe('');
  });

  it('handles WebSocket errors without crashing', () => {
    // Arrange
    initializeCall();

    // Act / Assert
    expect(() => {
      mocks.sockets[0].emit('error', new Error('socket failed'));
      mocks.sockets[1].emit('error', new Error('socket failed'));
    }).not.toThrow();
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it('flushes every Sarvam socket when the call ends', async () => {
    // Arrange
    initializeCall();
    for (const socket of mocks.sockets) {
      socket.emit('open');
    }

    // Act
    const completion = service.processRemainingAudio(callId);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await completion;

    // Assert
    for (const socket of mocks.sockets) {
      expect(socket.send).toHaveBeenCalledWith(
        JSON.stringify({type: 'flush'}),
      );
    }
  });

  it('closes every Sarvam socket when the call ends', async () => {
    // Arrange
    initializeCall();
    for (const socket of mocks.sockets) {
      socket.emit('open');
    }

    // Act
    const completion = service.processRemainingAudio(callId);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await completion;

    // Assert
    for (const socket of mocks.sockets) {
      expect(socket.close).toHaveBeenCalledOnce();
    }
  });
});
