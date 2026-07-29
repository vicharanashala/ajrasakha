import 'reflect-metadata';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {PlivoService} from '#root/modules/plivo/services/PlivoService.js';

const mocks = vi.hoisted(() => {
  type Handler = (...args: any[]) => void;
  class MockWebSocket {
    static OPEN = 1;
    static CLOSED = 3;
    readyState = MockWebSocket.OPEN;
    send = vi.fn();
    close = vi.fn(() => {
      this.readyState = MockWebSocket.CLOSED;
    });
    handlers = new Map<string, Handler[]>();
    constructor(public url: string, public options: unknown) {
      mocks.sockets.push(this);
    }
    on(event: string, handler: Handler): this {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
      return this;
    }
    emit(event: string, ...args: any[]): void {
      for (const handler of this.handlers.get(event) ?? []) handler(...args);
    }
  }
  return {
    MockWebSocket,
    sockets: [] as MockWebSocket[],
    callsGet: vi.fn(),
  };
});

vi.mock('ws', () => ({WebSocket: mocks.MockWebSocket}));
vi.mock('plivo', () => ({
  default: {
    Client: vi.fn().mockImplementation(() => ({
      calls: {get: mocks.callsGet},
    })),
  },
}));
vi.mock('../../../config/app.js', () => ({
  appConfig: {sarvamAPI: 'test-key'},
}));

describe('Sarvam Speech Contract', () => {
  let service: PlivoService;
  let callback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.sockets.length = 0;
    callback = vi.fn();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    service = new PlivoService({} as any);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const initialize = () => service.initializeStreams('call-123', callback);
  const message = (index: number, body: unknown) =>
    mocks.sockets[index].emit(
      'message',
      Buffer.from(JSON.stringify(body)),
    );

  it('opens four sockets with the required speech model and modes', () => {
    initialize();

    expect(mocks.sockets).toHaveLength(4);
    expect(mocks.sockets.map(socket => new URL(socket.url).searchParams.get('mode')))
      .toEqual(['transcribe', 'translate', 'transcribe', 'translate']);
    for (const socket of mocks.sockets) {
      const url = new URL(socket.url);
      expect(url.pathname).toBe('/speech-to-text/ws');
      expect(url.searchParams.get('model')).toBe('saaras:v3');
      expect(url.searchParams.get('sample_rate')).toBe('16000');
      expect(url.searchParams.get('input_audio_codec')).toBe('pcm_l16');
      expect(socket.url).not.toContain('mayura:v1');
    }
  });

  it('sends audio to both speech sockets in the expected format', async () => {
    initialize();
    mocks.sockets[0].emit('open');
    mocks.sockets[1].emit('open');
    const audio = Buffer.from([1, 2, 3]);

    await service.transcribeAudio(audio, 'call-123', 'inbound');

    const expected = {
      audio: {
        data: audio.toString('base64'),
        sample_rate: '16000',
        encoding: 'audio/wav',
      },
    };
    expect(JSON.parse(mocks.sockets[0].send.mock.calls[0][0])).toEqual(expected);
    expect(JSON.parse(mocks.sockets[1].send.mock.calls[0][0])).toEqual(expected);
  });

  it('handles transcript and detected-language responses', async () => {
    initialize();
    message(0, {
      type: 'data',
      data: {transcript: 'नमस्ते', language_code: 'hi-IN'},
    });

    await vi.advanceTimersByTimeAsync(1000);

    expect(callback).toHaveBeenCalledWith({
      track: 'inbound',
      originalText: 'नमस्ते',
      translatedText: '',
      detectedLanguage: 'hi-IN',
    });
    expect(service.getDetectedLanguage('call-123', 'inbound')).toBe('hi-IN');
  });

  it('handles translated speech responses', async () => {
    initialize();
    message(1, {type: 'data', data: {transcript: 'Hello'}});

    await vi.advanceTimersByTimeAsync(1000);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({translatedText: 'Hello'}),
    );
    expect(service.getTranslation('call-123', 'inbound')).toBe('Hello');
  });

  it('handles API and socket errors without producing transcript data', () => {
    initialize();

    expect(() => {
      message(0, {type: 'error', data: {message: 'bad audio'}});
      mocks.sockets[1].emit('error', new Error('socket failed'));
    }).not.toThrow();
    expect(callback).not.toHaveBeenCalled();
  });

  it('flushes and closes every socket on call completion', async () => {
    initialize();
    for (const socket of mocks.sockets) socket.emit('open');

    const completion = service.processRemainingAudio('call-123');
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await completion;

    for (const socket of mocks.sockets.slice(0, 4)) {
      expect(socket.send).toHaveBeenCalledWith(
        JSON.stringify({type: 'flush'}),
      );
      expect(socket.close).toHaveBeenCalledOnce();
    }
  });

  it('reconnects a speech socket closed during an active call', async () => {
    initialize();

    mocks.sockets[0].emit('close', 1006, Buffer.from('network failure'));
    await vi.advanceTimersByTimeAsync(2000);

    expect(mocks.sockets).toHaveLength(5);
    expect(new URL(mocks.sockets[4].url).searchParams.get('mode'))
      .toBe('transcribe');
    expect(mocks.sockets[4].url).toContain('model=saaras:v3');
  });

  it('cleans stale in-memory call sessions after one hour', () => {
    vi.setSystemTime(new Date('2026-07-29T10:00:00Z'));
    initialize();
    const clear = vi.spyOn(service, 'clearTranscript');
    vi.setSystemTime(new Date('2026-07-29T11:00:01Z'));

    service.cleanupStaleSessions();

    expect(clear).toHaveBeenCalledWith('call-123');
  });
});
