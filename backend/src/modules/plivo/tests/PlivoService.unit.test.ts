import 'reflect-metadata';

import {beforeEach, afterEach, describe, expect, it, vi} from 'vitest';

import {WebSocket} from 'ws';
import plivo from 'plivo';

import {PlivoService} from '../services/PlivoService.js';

vi.mock('ws', () => ({
  WebSocket: Object.assign(vi.fn(), {
    OPEN: 1,
    CLOSED: 3,
  }),
}));

vi.mock('plivo', () => ({
  default: {
    Client: vi.fn(),
  },
}));

describe('PlivoService', () => {
  let service: PlivoService;

  const mockCallDetailsRepository = {
    create: vi.fn(),
  };

  const mockPlivoClient = {
    calls: {
      get: vi.fn(),
    },
  };

  const mockWebSocket = {
    on: vi.fn(),
    send: vi.fn(),
    close: vi.fn(),
    readyState: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    (plivo.Client as any).mockImplementation(() => mockPlivoClient);

    (WebSocket as any).mockImplementation(() => mockWebSocket);

    service = new PlivoService(mockCallDetailsRepository as any);
  });

  afterEach(() => {
    try {
      vi.runOnlyPendingTimers();
    } catch {
      // Timers weren't mocked
    }

    vi.useRealTimers();
  });

  // ----------------------------------------------------------------
  // Helper data
  // ----------------------------------------------------------------

  const sampleAudio = Buffer.from('sample-audio');

  const sampleCallDetails = {
    callUuid: 'call-123',
    fromNumber: '+911111111111',
    toNumber: '+922222222222',
    callDuration: 120,
    callState: 'completed',
    callDirection: 'inbound',
  };

  const transcriptCallback = vi.fn();

  // ----------------------------------------------------------------
  // Tests go here
  // ----------------------------------------------------------------
  describe('initializeStreams', () => {
    it('initializes inbound and outbound streams', () => {
      const spy = vi
        .spyOn(service as any, 'initializeTrackStream')
        .mockImplementation(() => {});

      const callback = vi.fn();

      service.initializeStreams('call-123', callback);

      expect(spy).toHaveBeenCalledTimes(2);

      expect(spy).toHaveBeenNthCalledWith(1, 'call-123', 'inbound', callback);

      expect(spy).toHaveBeenNthCalledWith(2, 'call-123', 'outbound', callback);
    });
  });
  describe('transcribeAudio', () => {
    it('sends audio to both transcribe and translate streams when session exists', async () => {
      const sendAudioSpy = vi
        .spyOn(service as any, 'sendAudio')
        .mockImplementation(() => {});

      const session = {
        transcribeWsSession: {},
        translateWsSession: {},
      };

      (service as any).activeStreams.set('call-123_inbound', session);

      const audio = Buffer.from('test audio');

      const result = await service.transcribeAudio(
        audio,
        'call-123',
        'inbound',
      );

      expect(sendAudioSpy).toHaveBeenCalledTimes(2);

      expect(sendAudioSpy).toHaveBeenNthCalledWith(
        1,
        session.transcribeWsSession,
        audio,
      );

      expect(sendAudioSpy).toHaveBeenNthCalledWith(
        2,
        session.translateWsSession,
        audio,
      );

      expect(result).toEqual({
        originalText: '',
        translatedText: '',
      });
    });
    it('returns empty texts when no active session exists', async () => {
      const sendAudioSpy = vi
        .spyOn(service as any, 'sendAudio')
        .mockImplementation(() => {});

      const audio = Buffer.from('test audio');

      const result = await service.transcribeAudio(
        audio,
        'call-123',
        'inbound',
      );

      expect(sendAudioSpy).not.toHaveBeenCalled();

      expect(result).toEqual({
        originalText: '',
        translatedText: '',
      });
    });
  });
  describe('getTranscript', () => {
    it('returns transcript when present', () => {
      (service as any).activeTranscriptions.set(
        'call-123_inbound',
        'Hello World',
      );

      const result = service.getTranscript('call-123', 'inbound');

      expect(result).toBe('Hello World');
    });

    it('returns empty string when transcript does not exist', () => {
      const result = service.getTranscript('call-123', 'inbound');

      expect(result).toBe('');
    });
  });
  describe('getTranslation', () => {
    it('returns translation when present', () => {
      (service as any).activeTranslations.set(
        'call-123_outbound',
        'Translated Text',
      );

      const result = service.getTranslation('call-123', 'outbound');

      expect(result).toBe('Translated Text');
    });

    it('returns empty string when translation does not exist', () => {
      const result = service.getTranslation('call-123', 'outbound');

      expect(result).toBe('');
    });
  });
  describe('getDetectedLanguage', () => {
    it('returns detected language when present', () => {
      (service as any).detectedLanguages.set('call-123_inbound', 'hi-IN');

      const result = service.getDetectedLanguage('call-123', 'inbound');

      expect(result).toBe('hi-IN');
    });

    it('returns unknown when language does not exist', () => {
      const result = service.getDetectedLanguage('call-123', 'inbound');

      expect(result).toBe('unknown');
    });
  });
  describe('clearTranscript', () => {
    it('clears all data and removes active streams', () => {
      const inboundSession = {
        debounceTimer: null,
        transcribeWsSession: {
          ws: {
            readyState: WebSocket.OPEN,
            close: vi.fn(),
          },
        },
        translateWsSession: {
          ws: {
            readyState: WebSocket.OPEN,
            close: vi.fn(),
          },
        },
      };

      const outboundSession = {
        debounceTimer: null,
        transcribeWsSession: {
          ws: {
            readyState: WebSocket.OPEN,
            close: vi.fn(),
          },
        },
        translateWsSession: {
          ws: {
            readyState: WebSocket.OPEN,
            close: vi.fn(),
          },
        },
      };

      (service as any).activeTranscriptions.set('call-123_inbound', 'hello');
      (service as any).activeTranslations.set('call-123_inbound', 'hi');
      (service as any).detectedLanguages.set('call-123_inbound', 'hi-IN');

      (service as any).activeStreams.set('call-123_inbound', inboundSession);

      (service as any).activeStreams.set('call-123_outbound', outboundSession);

      service.clearTranscript('call-123');

      expect(
        (service as any).activeTranscriptions.has('call-123_inbound'),
      ).toBe(false);

      expect((service as any).activeTranslations.has('call-123_inbound')).toBe(
        false,
      );

      expect((service as any).detectedLanguages.has('call-123_inbound')).toBe(
        false,
      );

      expect((service as any).activeStreams.has('call-123_inbound')).toBe(
        false,
      );

      expect((service as any).activeStreams.has('call-123_outbound')).toBe(
        false,
      );

      expect(inboundSession.transcribeWsSession.ws.close).toHaveBeenCalled();

      expect(inboundSession.translateWsSession.ws.close).toHaveBeenCalled();

      expect(outboundSession.transcribeWsSession.ws.close).toHaveBeenCalled();

      expect(outboundSession.translateWsSession.ws.close).toHaveBeenCalled();
    });
    it('clears debounce timers before removing sessions', () => {
      const timer = setTimeout(() => {}, 1000);

      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      const session = {
        debounceTimer: timer,
        transcribeWsSession: {
          ws: {
            readyState: WebSocket.OPEN,
            close: vi.fn(),
          },
        },
        translateWsSession: {
          ws: {
            readyState: WebSocket.OPEN,
            close: vi.fn(),
          },
        },
      };

      (service as any).activeStreams.set('call-123_inbound', session);

      service.clearTranscript('call-123');

      expect(clearTimeoutSpy).toHaveBeenCalledWith(timer);
    });
    it('does nothing when no active session exists', () => {
      expect(() => service.clearTranscript('call-123')).not.toThrow();

      expect((service as any).activeStreams.size).toBe(0);
    });
    it('ignores socket close errors', () => {
      const session = {
        debounceTimer: null,
        transcribeWsSession: {
          ws: {
            readyState: WebSocket.OPEN,
            close: vi.fn(() => {
              throw new Error('close failed');
            }),
          },
        },
        translateWsSession: {
          ws: {
            readyState: WebSocket.OPEN,
            close: vi.fn(),
          },
        },
      };

      (service as any).activeStreams.set('call-123_inbound', session);

      expect(() => service.clearTranscript('call-123')).not.toThrow();
    });
  });
  describe('finalizeTrackStream', () => {
    it('returns empty texts when no active session exists', async () => {
      const result = await service.finalizeTrackStream('call-123', 'inbound');

      expect(result).toEqual({
        originalText: '',
        translatedText: '',
      });
    });
    it('flushes pending text, closes sockets and removes session', async () => {
      const timer = setTimeout(() => {}, 1000);

      const transcribeWs = {
        readyState: WebSocket.OPEN,
        send: vi.fn(),
        close: vi.fn(),
      };

      const translateWs = {
        readyState: WebSocket.OPEN,
        send: vi.fn(),
        close: vi.fn(),
      };

      const session = {
        transcribeWsSession: {
          ws: transcribeWs,
          isOpen: true,
        },
        translateWsSession: {
          ws: translateWs,
          isOpen: true,
        },
        pendingOriginal: 'Hello',
        pendingTranslate: 'Hi',
        debounceTimer: timer,
      };

      (service as any).activeStreams.set('call-123_inbound', session);

      const resultPromise = service.finalizeTrackStream('call-123', 'inbound');

      vi.advanceTimersByTime(1000);

      const result = await resultPromise;

      expect(transcribeWs.send).toHaveBeenCalledWith(
        JSON.stringify({type: 'flush'}),
      );

      expect(translateWs.send).toHaveBeenCalledWith(
        JSON.stringify({type: 'flush'}),
      );

      expect(transcribeWs.close).toHaveBeenCalled();

      expect(translateWs.close).toHaveBeenCalled();

      expect((service as any).activeStreams.has('call-123_inbound')).toBe(
        false,
      );

      expect(service.getTranscript('call-123')).toBe('Hello');

      expect(service.getTranslation('call-123')).toBe('Hi');

      expect(result).toEqual({
        originalText: 'Hello',
        translatedText: 'Hi',
      });
    });
  });
  describe('finalizeStreams', () => {
    it('returns inbound result from processRemainingAudio', async () => {
      const processRemainingAudioSpy = vi
        .spyOn(service, 'processRemainingAudio')
        .mockResolvedValue({
          inbound: {
            originalText: 'Hello',
            translatedText: 'Hi',
          },
          outbound: {
            originalText: 'Agent',
            translatedText: 'Agent English',
          },
        });

      const result = await service.finalizeStreams('call-123');

      expect(processRemainingAudioSpy).toHaveBeenCalledTimes(1);

      expect(processRemainingAudioSpy).toHaveBeenCalledWith('call-123');

      expect(result).toEqual({
        originalText: 'Hello',
        translatedText: 'Hi',
      });
    });
    it('propagates errors from processRemainingAudio', async () => {
      vi.spyOn(service, 'processRemainingAudio').mockRejectedValue(
        new Error('Processing failed'),
      );

      await expect(service.finalizeStreams('call-123')).rejects.toThrow(
        'Processing failed',
      );
    });
  });
  describe('processRemainingAudio', () => {
    it('finalizes inbound and outbound tracks', async () => {
      const finalizeTrackStreamSpy = vi
        .spyOn(service, 'finalizeTrackStream')
        .mockResolvedValueOnce({
          originalText: 'Inbound Original',
          translatedText: 'Inbound Translation',
        })
        .mockResolvedValueOnce({
          originalText: 'Outbound Original',
          translatedText: 'Outbound Translation',
        });

      const result = await service.processRemainingAudio('call-123');

      expect(finalizeTrackStreamSpy).toHaveBeenCalledTimes(2);

      expect(finalizeTrackStreamSpy).toHaveBeenNthCalledWith(
        1,
        'call-123',
        'inbound',
      );

      expect(finalizeTrackStreamSpy).toHaveBeenNthCalledWith(
        2,
        'call-123',
        'outbound',
      );

      expect(result).toEqual({
        inbound: {
          originalText: 'Inbound Original',
          translatedText: 'Inbound Translation',
        },
        outbound: {
          originalText: 'Outbound Original',
          translatedText: 'Outbound Translation',
        },
      });
    });

    it('propagates errors from finalizeTrackStream', async () => {
      vi.spyOn(service, 'finalizeTrackStream').mockRejectedValue(
        new Error('Finalize failed'),
      );

      await expect(service.processRemainingAudio('call-123')).rejects.toThrow(
        'Finalize failed',
      );
    });
  });
  describe('saveCallDetails', () => {
    it('fetches plivo call details and saves them to repository', async () => {
      mockPlivoClient.calls.get.mockResolvedValue({
        fromNumber: '+911111111111',
        toNumber: '+922222222222',
        callDuration: 120,
        callState: 'completed',
        callDirection: 'inbound',
      });

      vi.spyOn(service, 'getTranscript')
        .mockReturnValueOnce('Caller transcript')
        .mockReturnValueOnce('Agent transcript');

      vi.spyOn(service, 'getTranslation')
        .mockReturnValueOnce('Caller translation')
        .mockReturnValueOnce('Agent translation');

      vi.spyOn(service, 'getDetectedLanguage')
        .mockReturnValueOnce('hi-IN')
        .mockReturnValueOnce('en-IN');

      mockCallDetailsRepository.create.mockResolvedValue(undefined);

      await service.saveCallDetails('call-123');

      expect(mockPlivoClient.calls.get).toHaveBeenCalledWith('call-123');

      expect(mockCallDetailsRepository.create).toHaveBeenCalledWith({
        callUuid: 'call-123',
        from: '+911111111111',
        to: '+922222222222',
        duration: 120,
        status: 'completed',
        direction: 'inbound',
        caller: {
          transcript: 'Caller transcript',
          translation: 'Caller translation',
          detectedLanguage: 'hi-IN',
        },
        agent: {
          transcript: 'Agent transcript',
          translation: 'Agent translation',
          detectedLanguage: 'en-IN',
        },
      });
    });
    it('continues saving when plivo api call fails', async () => {
      mockPlivoClient.calls.get.mockRejectedValue(
        new Error('Plivo unavailable'),
      );

      vi.spyOn(service, 'getTranscript').mockReturnValue('');
      vi.spyOn(service, 'getTranslation').mockReturnValue('');
      vi.spyOn(service, 'getDetectedLanguage').mockReturnValue('unknown');

      mockCallDetailsRepository.create.mockResolvedValue(undefined);

      await service.saveCallDetails('call-123');

      expect(mockCallDetailsRepository.create).toHaveBeenCalledWith({
        callUuid: 'call-123',
        from: undefined,
        to: undefined,
        duration: undefined,
        status: undefined,
        direction: undefined,
        caller: {
          transcript: '',
          translation: '',
          detectedLanguage: 'unknown',
        },
        agent: {
          transcript: '',
          translation: '',
          detectedLanguage: 'unknown',
        },
      });
    });
    it('does not throw when repository save fails', async () => {
      mockPlivoClient.calls.get.mockResolvedValue({});

      vi.spyOn(service, 'getTranscript').mockReturnValue('');
      vi.spyOn(service, 'getTranslation').mockReturnValue('');
      vi.spyOn(service, 'getDetectedLanguage').mockReturnValue('unknown');

      mockCallDetailsRepository.create.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        service.saveCallDetails('call-123'),
      ).resolves.toBeUndefined();
    });
    it('does not throw when both plivo fetch and repository save fail', async () => {
      mockPlivoClient.calls.get.mockRejectedValue(new Error('Plivo failed'));

      vi.spyOn(service, 'getTranscript').mockReturnValue('');
      vi.spyOn(service, 'getTranslation').mockReturnValue('');
      vi.spyOn(service, 'getDetectedLanguage').mockReturnValue('unknown');

      mockCallDetailsRepository.create.mockRejectedValue(
        new Error('DB failed'),
      );

      await expect(
        service.saveCallDetails('call-123'),
      ).resolves.toBeUndefined();
    });
  });
  describe('transcribeAudio', () => {
    it('sends audio to both websocket sessions when session exists', async () => {
      const sendAudioSpy = vi
        .spyOn(service as any, 'sendAudio')
        .mockImplementation(() => {});

      const session = {
        transcribeWsSession: {},
        translateWsSession: {},
      };

      (service as any).activeStreams.set('call-123_inbound', session);

      const buffer = Buffer.from('audio');

      const result = await service.transcribeAudio(
        buffer,
        'call-123',
        'inbound',
      );

      expect(sendAudioSpy).toHaveBeenCalledTimes(2);

      expect(sendAudioSpy).toHaveBeenNthCalledWith(
        1,
        session.transcribeWsSession,
        buffer,
      );

      expect(sendAudioSpy).toHaveBeenNthCalledWith(
        2,
        session.translateWsSession,
        buffer,
      );

      expect(result).toEqual({
        originalText: '',
        translatedText: '',
      });
    });
    it('returns empty texts when stream session does not exist', async () => {
      const sendAudioSpy = vi.spyOn(service as any, 'sendAudio');

      const buffer = Buffer.from('audio');

      const result = await service.transcribeAudio(
        buffer,
        'missing-call',
        'inbound',
      );

      expect(sendAudioSpy).not.toHaveBeenCalled();

      expect(result).toEqual({
        originalText: '',
        translatedText: '',
      });
    });
    it('uses inbound track by default', async () => {
      const sendAudioSpy = vi
        .spyOn(service as any, 'sendAudio')
        .mockImplementation(() => {});

      const session = {
        transcribeWsSession: {},
        translateWsSession: {},
      };

      (service as any).activeStreams.set('call-123_inbound', session);

      const buffer = Buffer.from('audio');

      await service.transcribeAudio(buffer, 'call-123');

      expect(sendAudioSpy).toHaveBeenCalledTimes(2);
    });
  });
  describe('getTranscript', () => {
    it('returns transcript when it exists', () => {
      (service as any).activeTranscriptions.set(
        'call-123_inbound',
        'Hello World',
      );

      const result = service.getTranscript('call-123', 'inbound');

      expect(result).toBe('Hello World');
    });

    it('returns empty string when transcript does not exist', () => {
      const result = service.getTranscript('missing-call', 'inbound');

      expect(result).toBe('');
    });

    it('uses inbound as default track', () => {
      (service as any).activeTranscriptions.set('call-123_inbound', 'Hello');

      expect(service.getTranscript('call-123')).toBe('Hello');
    });
  });
  describe('getTranslation', () => {
    it('returns translation when it exists', () => {
      (service as any).activeTranslations.set('call-123_outbound', 'Hello');

      const result = service.getTranslation('call-123', 'outbound');

      expect(result).toBe('Hello');
    });

    it('returns empty string when translation does not exist', () => {
      const result = service.getTranslation('missing-call', 'outbound');

      expect(result).toBe('');
    });

    it('uses inbound as default track', () => {
      (service as any).activeTranslations.set('call-123_inbound', 'Hi');

      expect(service.getTranslation('call-123')).toBe('Hi');
    });
  });
  describe('getDetectedLanguage', () => {
    it('returns detected language when it exists', () => {
      (service as any).detectedLanguages.set('call-123_outbound', 'hi-IN');

      const result = service.getDetectedLanguage('call-123', 'outbound');

      expect(result).toBe('hi-IN');
    });

    it('returns unknown when language does not exist', () => {
      const result = service.getDetectedLanguage('missing-call', 'outbound');

      expect(result).toBe('unknown');
    });

    it('uses inbound as default track', () => {
      (service as any).detectedLanguages.set('call-123_inbound', 'ta-IN');

      expect(service.getDetectedLanguage('call-123')).toBe('ta-IN');
    });
  });
  describe('initializeStreams', () => {
    it('initializes inbound and outbound streams', () => {
      const initializeTrackStreamSpy = vi
        .spyOn(service as any, 'initializeTrackStream')
        .mockImplementation(() => {});

      const callback = vi.fn();

      service.initializeStreams('call-123', callback);

      expect(initializeTrackStreamSpy).toHaveBeenCalledTimes(2);

      expect(initializeTrackStreamSpy).toHaveBeenNthCalledWith(
        1,
        'call-123',
        'inbound',
        callback,
      );

      expect(initializeTrackStreamSpy).toHaveBeenNthCalledWith(
        2,
        'call-123',
        'outbound',
        callback,
      );
    });
    it('propagates errors from initializeTrackStream', () => {
      vi.spyOn(service as any, 'initializeTrackStream').mockImplementation(
        () => {
          throw new Error('Initialization failed');
        },
      );

      expect(() => service.initializeStreams('call-123', vi.fn())).toThrow(
        'Initialization failed',
      );
    });
  });

  describe('initializeTrackStream', () => {
    it('creates transcribe and translate websocket sessions', () => {
      const callback = vi.fn();

      (service as any).initializeTrackStream('call-123', 'inbound', callback);

      const session = (service as any).activeStreams.get('call-123_inbound');

      expect(session).toBeDefined();

      expect(session.onTranscript).toBe(callback);

      expect(session.detectedLanguage).toBe('unknown');

      expect(session.pendingOriginal).toBe('');

      expect(session.pendingTranslate).toBe('');

      expect(session.lastOriginal).toBe('');

      expect(session.lastTranslate).toBe('');

      expect(session.debounceTimer).toBeNull();
    });
    it('registers websocket event listeners', () => {
      const callback = vi.fn();

      (service as any).initializeTrackStream('call-123', 'outbound', callback);

      const session = (service as any).activeStreams.get('call-123_outbound');

      expect(session.transcribeWsSession.ws.on).toHaveBeenCalledWith(
        'open',
        expect.any(Function),
      );

      expect(session.transcribeWsSession.ws.on).toHaveBeenCalledWith(
        'message',
        expect.any(Function),
      );

      expect(session.transcribeWsSession.ws.on).toHaveBeenCalledWith(
        'error',
        expect.any(Function),
      );

      expect(session.transcribeWsSession.ws.on).toHaveBeenCalledWith(
        'close',
        expect.any(Function),
      );

      expect(session.translateWsSession.ws.on).toHaveBeenCalledWith(
        'open',
        expect.any(Function),
      );

      expect(session.translateWsSession.ws.on).toHaveBeenCalledWith(
        'message',
        expect.any(Function),
      );

      expect(session.translateWsSession.ws.on).toHaveBeenCalledWith(
        'error',
        expect.any(Function),
      );

      expect(session.translateWsSession.ws.on).toHaveBeenCalledWith(
        'close',
        expect.any(Function),
      );
    });
    it('stores session using call id and track', () => {
      (service as any).initializeTrackStream('call-999', 'outbound', vi.fn());

      expect((service as any).activeStreams.has('call-999_outbound')).toBe(
        true,
      );
    });
    it('marks transcribe websocket as open and flushes its queue', () => {
      const flushQueueSpy = vi
        .spyOn(service as any, 'flushQueue')
        .mockImplementation(() => {});

      (service as any).initializeTrackStream('call-123', 'inbound', vi.fn());

      const session = (service as any).activeStreams.get('call-123_inbound');

      const openHandler = session.transcribeWsSession.ws.on.mock.calls.find(
        ([event]: any) => event === 'open',
      )?.[1];

      expect(openHandler).toBeDefined();

      openHandler();

      expect(session.transcribeWsSession.isOpen).toBe(true);

      expect(flushQueueSpy).toHaveBeenCalledWith(session.transcribeWsSession);
    });
    it('marks translate websocket as open and flushes its queue', () => {
      const flushQueueSpy = vi
        .spyOn(service as any, 'flushQueue')
        .mockImplementation(() => {});

      (service as any).initializeTrackStream('call-123', 'outbound', vi.fn());

      const session = (service as any).activeStreams.get('call-123_outbound');

      const openHandler = session.translateWsSession.ws.on.mock.calls.filter(
        ([event]) => event === 'open',
      )[1][1];

      expect(openHandler).toBeDefined();

      openHandler();

      expect(session.translateWsSession.isOpen).toBe(true);
      console.log(session.transcribeWsSession.ws.on.mock.calls);
      console.log(session.translateWsSession.ws.on.mock.calls);

      expect(flushQueueSpy).toHaveBeenCalledWith(session.translateWsSession);
    });
    it('updates pending original text and detected language when transcribe message contains delta', () => {
      const triggerDebounceSpy = vi
        .spyOn(service as any, 'triggerDebounce')
        .mockImplementation(() => {});

      (service as any).initializeTrackStream('call-123', 'inbound', vi.fn());

      const session = (service as any).activeStreams.get('call-123_inbound');

      const messageHandler = session.transcribeWsSession.ws.on.mock.calls.find(
        ([event]: any) => event === 'message',
      )?.[1];

      messageHandler(
        Buffer.from(
          JSON.stringify({
            type: 'data',
            data: {
              transcript: 'Hello world',
              language_code: 'hi-IN',
            },
          }),
        ),
      );

      expect(session.lastOriginal).toBe('Hello world');
      expect(session.pendingOriginal).toBe('Hello world');
      expect(session.detectedLanguage).toBe('hi-IN');

      expect((service as any).detectedLanguages.get('call-123_inbound')).toBe(
        'hi-IN',
      );

      expect(triggerDebounceSpy).toHaveBeenCalledWith('call-123', 'inbound');
    });
    it('appends only the transcript delta', () => {
      const triggerDebounceSpy = vi
        .spyOn(service as any, 'triggerDebounce')
        .mockImplementation(() => {});

      (service as any).initializeTrackStream('call-123', 'inbound', vi.fn());

      const session = (service as any).activeStreams.get('call-123_inbound');

      session.lastOriginal = 'Hello';

      const handler = session.transcribeWsSession.ws.on.mock.calls.find(
        ([e]: any) => e === 'message',
      )?.[1];

      handler(
        Buffer.from(
          JSON.stringify({
            type: 'data',
            data: {
              transcript: 'Hello world',
            },
          }),
        ),
      );

      expect(session.lastOriginal).toBe('Hello world');
      expect(session.pendingOriginal).toBe('world');

      expect(triggerDebounceSpy).toHaveBeenCalled();
    });
    it('does not trigger debounce when transcript has no delta', () => {
      const triggerDebounceSpy = vi.spyOn(service as any, 'triggerDebounce');

      (service as any).initializeTrackStream('call-123', 'inbound', vi.fn());

      const session = (service as any).activeStreams.get('call-123_inbound');

      session.lastOriginal = 'Hello';

      const handler = session.transcribeWsSession.ws.on.mock.calls.find(
        ([e]: any) => e === 'message',
      )?.[1];

      handler(
        Buffer.from(
          JSON.stringify({
            type: 'data',
            data: {
              transcript: 'Hello',
            },
          }),
        ),
      );

      expect(session.pendingOriginal).toBe('');

      expect(triggerDebounceSpy).not.toHaveBeenCalled();
    });
    it('handles transcribe websocket error response', () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      (service as any).initializeTrackStream('call-123', 'inbound', vi.fn());

      const session = (service as any).activeStreams.get('call-123_inbound');

      const handler = session.transcribeWsSession.ws.on.mock.calls.find(
        ([e]: any) => e === 'message',
      )?.[1];

      handler(
        Buffer.from(
          JSON.stringify({
            type: 'error',
            data: {
              message: 'failure',
            },
          }),
        ),
      );

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
    it('handles invalid transcribe websocket messages', () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      (service as any).initializeTrackStream('call-123', 'inbound', vi.fn());

      const session = (service as any).activeStreams.get('call-123_inbound');

      const handler = session.transcribeWsSession.ws.on.mock.calls.find(
        ([e]: any) => e === 'message',
      )?.[1];

      handler(Buffer.from('invalid-json'));

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
    it('updates pending translated text when translate message contains delta', () => {
      const triggerDebounceSpy = vi
        .spyOn(service as any, 'triggerDebounce')
        .mockImplementation(() => {});

      (service as any).initializeTrackStream('call-123', 'outbound', vi.fn());

      const session = (service as any).activeStreams.get('call-123_outbound');

      const handler = session.translateWsSession.ws.on.mock.calls.filter(
        ([event]) => event === 'message',
      )[1][1];

      handler(
        Buffer.from(
          JSON.stringify({
            type: 'data',
            data: {
              transcript: 'Hello world',
            },
          }),
        ),
      );

      expect(session.lastTranslate).toBe('Hello world');

      expect(session.pendingTranslate).toBe('Hello world');

      expect(triggerDebounceSpy).toHaveBeenCalledWith('call-123', 'outbound');
    });
    it('appends only the translated delta', () => {
      const triggerDebounceSpy = vi
        .spyOn(service as any, 'triggerDebounce')
        .mockImplementation(() => {});

      (service as any).initializeTrackStream('call-123', 'outbound', vi.fn());

      const session = (service as any).activeStreams.get('call-123_outbound');

      session.lastTranslate = 'Hello';

      const handler = session.translateWsSession.ws.on.mock.calls.filter(
        ([event]) => event === 'message',
      )[1][1];

      handler(
        Buffer.from(
          JSON.stringify({
            type: 'data',
            data: {
              transcript: 'Hello world',
            },
          }),
        ),
      );

      expect(session.lastTranslate).toBe('Hello world');

      expect(session.pendingTranslate).toBe('world');

      expect(triggerDebounceSpy).toHaveBeenCalled();
    });
    it('does not trigger debounce when translated transcript has no delta', () => {
      const triggerDebounceSpy = vi.spyOn(service as any, 'triggerDebounce');

      (service as any).initializeTrackStream('call-123', 'outbound', vi.fn());

      const session = (service as any).activeStreams.get('call-123_outbound');

      session.lastTranslate = 'Hello';

      const handler = session.translateWsSession.ws.on.mock.calls.filter(
        ([event]) => event === 'message',
      )[1][1];

      handler(
        Buffer.from(
          JSON.stringify({
            type: 'data',
            data: {
              transcript: 'Hello',
            },
          }),
        ),
      );

      expect(session.pendingTranslate).toBe('');

      expect(triggerDebounceSpy).not.toHaveBeenCalled();
    });
    it('handles translate websocket error response', () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      (service as any).initializeTrackStream('call-123', 'outbound', vi.fn());

      const session = (service as any).activeStreams.get('call-123_outbound');

      const handler = session.translateWsSession.ws.on.mock.calls.find(
        ([event]: any) => event === 'message',
      )?.[1];

      handler(
        Buffer.from(
          JSON.stringify({
            type: 'error',
            data: {
              message: 'failure',
            },
          }),
        ),
      );

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
    it('handles invalid translate websocket messages', () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      (service as any).initializeTrackStream('call-123', 'outbound', vi.fn());

      const session = (service as any).activeStreams.get('call-123_outbound');

      const handler = session.translateWsSession.ws.on.mock.calls.find(
        ([event]: any) => event === 'message',
      )?.[1];

      handler(Buffer.from('invalid-json'));

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
  describe('flushQueue', () => {
    it('sends all queued audio chunks and empties the queue', () => {
      const sendAudioSpy = vi
        .spyOn(service as any, 'sendAudio')
        .mockImplementation(() => {});

      const chunk1 = Buffer.from('audio-1');
      const chunk2 = Buffer.from('audio-2');

      const wsSession = {
        ws: {
          send: vi.fn(),
          close: vi.fn(),
          on: vi.fn(),
          readyState: 1,
        },
        queue: [chunk1, chunk2],
        isOpen: true,
      };

      (service as any).flushQueue(wsSession);

      expect(sendAudioSpy).toHaveBeenCalledTimes(2);

      expect(sendAudioSpy).toHaveBeenNthCalledWith(1, wsSession, chunk1);

      expect(sendAudioSpy).toHaveBeenNthCalledWith(2, wsSession, chunk2);

      expect(wsSession.queue).toHaveLength(0);
    });

    it('does nothing when queue is empty', () => {
      const sendAudioSpy = vi
        .spyOn(service as any, 'sendAudio')
        .mockImplementation(() => {});

      const wsSession = {
        ws: {
          send: vi.fn(),
          close: vi.fn(),
          on: vi.fn(),
          readyState: 1,
        },
        queue: [],
        isOpen: true,
      };

      (service as any).flushQueue(wsSession);

      expect(sendAudioSpy).not.toHaveBeenCalled();

      expect(wsSession.queue).toHaveLength(0);
    });
  });
  describe('sendAudio', () => {
    it('sends base64 encoded audio when websocket is open', () => {
      const send = vi.fn();

      const wsSession = {
        ws: {
          send,
          readyState: WebSocket.OPEN,
        },
        queue: [],
        isOpen: true,
      };

      const audioBuffer = Buffer.from('hello');

      (service as any).sendAudio(wsSession, audioBuffer);

      expect(send).toHaveBeenCalledTimes(1);

      const payload = JSON.parse(send.mock.calls[0][0]);

      expect(payload).toEqual({
        audio: {
          data: audioBuffer.toString('base64'),
          sample_rate: '16000',
          encoding: 'audio/wav',
        },
      });

      expect(wsSession.queue).toHaveLength(0);
    });
    it('queues audio when websocket is not open', () => {
      const send = vi.fn();

      const wsSession = {
        ws: {
          send,
          readyState: WebSocket.CONNECTING,
        },
        queue: [],
        isOpen: false,
      };

      const audioBuffer = Buffer.from('hello');

      (service as any).sendAudio(wsSession, audioBuffer);

      expect(send).not.toHaveBeenCalled();

      expect(wsSession.queue).toEqual([audioBuffer]);
    });
    it('logs an error when websocket send throws', () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const send = vi.fn(() => {
        throw new Error('Socket failure');
      });

      const wsSession = {
        ws: {
          send,
          readyState: WebSocket.OPEN,
        },
        queue: [],
        isOpen: true,
      };

      (service as any).sendAudio(wsSession, Buffer.from('hello'));

      expect(send).toHaveBeenCalled();

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
  describe('triggerDebounce', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('processes pending original and translated text', () => {
      vi.useFakeTimers();

      try {
        const callback = vi.fn();

        const session = {
          transcribeWsSession: {} as any,
          translateWsSession: {} as any,
          onTranscript: callback,
          lastOriginal: '',
          lastTranslate: '',
          detectedLanguage: 'hi-IN',
          pendingOriginal: 'नमस्ते',
          pendingTranslate: 'Hello',
          debounceTimer: null,
        };

        (service as any).activeStreams.set('call-123_inbound', session);

        (service as any).triggerDebounce('call-123', 'inbound');

        vi.advanceTimersByTime(1000);

        expect(
          (service as any).activeTranscriptions.get('call-123_inbound'),
        ).toBe('नमस्ते');

        expect(
          (service as any).activeTranslations.get('call-123_inbound'),
        ).toBe('Hello');

        expect(callback).toHaveBeenCalledWith({
          track: 'inbound',
          originalText: 'नमस्ते',
          translatedText: 'Hello',
          detectedLanguage: 'hi-IN',
        });

        expect(session.pendingOriginal).toBe('');
        expect(session.pendingTranslate).toBe('');
        expect(session.debounceTimer).toBeNull();
      } finally {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
      }
    });
  });
  it('uses original text as translation when language is English', () => {
    const callback = vi.fn();

    const session = {
      transcribeWsSession: {} as any,
      translateWsSession: {} as any,
      onTranscript: callback,
      lastOriginal: '',
      lastTranslate: '',
      detectedLanguage: 'en-IN',
      pendingOriginal: 'Hello',
      pendingTranslate: '',
      debounceTimer: null,
    };

    (service as any).activeStreams.set('call-123_inbound', session);

    (service as any).triggerDebounce('call-123', 'inbound');

    vi.advanceTimersByTime(1000);

    expect((service as any).activeTranslations.get('call-123_inbound')).toBe(
      'Hello',
    );

    expect(callback).toHaveBeenCalledWith({
      track: 'inbound',
      originalText: 'Hello',
      translatedText: 'Hello',
      detectedLanguage: 'en-IN',
    });
  });
  describe('processRemainingAudio', () => {
    it('processes remaining audio for both inbound and outbound tracks', async () => {
      const finalizeSpy = vi
        .spyOn(service as any, 'finalizeTrackStream')
        .mockResolvedValueOnce({
          originalText: 'Inbound Original',
          translatedText: 'Inbound Translation',
        })
        .mockResolvedValueOnce({
          originalText: 'Outbound Original',
          translatedText: 'Outbound Translation',
        });

      const result = await service.processRemainingAudio('call-123');

      expect(finalizeSpy).toHaveBeenCalledTimes(2);

      expect(finalizeSpy).toHaveBeenNthCalledWith(1, 'call-123', 'inbound');

      expect(finalizeSpy).toHaveBeenNthCalledWith(2, 'call-123', 'outbound');

      expect(result).toEqual({
        inbound: {
          originalText: 'Inbound Original',
          translatedText: 'Inbound Translation',
        },
        outbound: {
          originalText: 'Outbound Original',
          translatedText: 'Outbound Translation',
        },
      });
    });
    it('propagates errors from finalizeTrackStream', async () => {
      vi.spyOn(service as any, 'finalizeTrackStream').mockRejectedValue(
        new Error('Finalization failed'),
      );

      await expect(service.processRemainingAudio('call-123')).rejects.toThrow(
        'Finalization failed',
      );
    });
  });
  describe('finalizeStreams', () => {
    it('returns inbound result from processRemainingAudio', async () => {
      const processSpy = vi
        .spyOn(service, 'processRemainingAudio')
        .mockResolvedValue({
          inbound: {
            originalText: 'Inbound Original',
            translatedText: 'Inbound Translation',
          },
          outbound: {
            originalText: 'Outbound Original',
            translatedText: 'Outbound Translation',
          },
        });

      const result = await service.finalizeStreams('call-123');

      expect(processSpy).toHaveBeenCalledWith('call-123');

      expect(result).toEqual({
        originalText: 'Inbound Original',
        translatedText: 'Inbound Translation',
      });
    });
    it('propagates errors from processRemainingAudio', async () => {
      vi.spyOn(service, 'processRemainingAudio').mockRejectedValue(
        new Error('Processing failed'),
      );

      await expect(service.finalizeStreams('call-123')).rejects.toThrow(
        'Processing failed',
      );
    });
  });
  describe('saveCallDetails', () => {
    it('saves complete call details successfully', async () => {
      const plivoCall = {
        fromNumber: '+911111111111',
        toNumber: '+922222222222',
        callDuration: 120,
        callState: 'completed',
        callDirection: 'inbound',
      };

      (service as any).plivoClient.calls.get = vi
        .fn()
        .mockResolvedValue(plivoCall);

      vi.spyOn(service, 'getTranscript')
        .mockReturnValueOnce('Caller transcript')
        .mockReturnValueOnce('Agent transcript');

      vi.spyOn(service, 'getTranslation')
        .mockReturnValueOnce('Caller translation')
        .mockReturnValueOnce('Agent translation');

      vi.spyOn(service, 'getDetectedLanguage')
        .mockReturnValueOnce('hi-IN')
        .mockReturnValueOnce('en-IN');

      mockCallDetailsRepository.create.mockResolvedValue(undefined);

      await service.saveCallDetails('call-123');

      expect((service as any).plivoClient.calls.get).toHaveBeenCalledWith(
        'call-123',
      );

      expect(mockCallDetailsRepository.create).toHaveBeenCalledWith({
        callUuid: 'call-123',
        from: '+911111111111',
        to: '+922222222222',
        duration: 120,
        status: 'completed',
        direction: 'inbound',
        caller: {
          transcript: 'Caller transcript',
          translation: 'Caller translation',
          detectedLanguage: 'hi-IN',
        },
        agent: {
          transcript: 'Agent transcript',
          translation: 'Agent translation',
          detectedLanguage: 'en-IN',
        },
      });
    });
    it('continues saving when Plivo API fails', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});

      (service as any).plivoClient.calls.get = vi
        .fn()
        .mockRejectedValue(new Error('Plivo unavailable'));

      vi.spyOn(service, 'getTranscript').mockReturnValue('');
      vi.spyOn(service, 'getTranslation').mockReturnValue('');
      vi.spyOn(service, 'getDetectedLanguage').mockReturnValue('unknown');

      mockCallDetailsRepository.create.mockResolvedValue(undefined);

      await service.saveCallDetails('call-123');

      expect(mockCallDetailsRepository.create).toHaveBeenCalledWith({
        callUuid: 'call-123',
        from: undefined,
        to: undefined,
        duration: undefined,
        status: undefined,
        direction: undefined,
        caller: {
          transcript: '',
          translation: '',
          detectedLanguage: 'unknown',
        },
        agent: {
          transcript: '',
          translation: '',
          detectedLanguage: 'unknown',
        },
      });

      expect(console.warn).toHaveBeenCalled();
    });
    it('logs error when repository save fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});

      (service as any).plivoClient.calls.get = vi.fn().mockResolvedValue({});

      vi.spyOn(service, 'getTranscript').mockReturnValue('');
      vi.spyOn(service, 'getTranslation').mockReturnValue('');
      vi.spyOn(service, 'getDetectedLanguage').mockReturnValue('unknown');

      mockCallDetailsRepository.create.mockRejectedValue(
        new Error('Database failure'),
      );

      await service.saveCallDetails('call-123');

      expect(console.error).toHaveBeenCalled();
    });
    it('logs unexpected errors', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});

      (service as any).plivoClient = null;

      await service.saveCallDetails('call-123');

      expect(console.error).toHaveBeenCalled();
    });
  });
  describe('finalizeTrackStream', () => {
    it('flushes pending text, closes sockets and removes session', async () => {
      vi.useFakeTimers();

      const transcribeClose = vi.fn();
      const translateClose = vi.fn();

      const session = {
        transcribeWsSession: {
          isOpen: true,
          ws: {
            send: vi.fn(),
            close: transcribeClose,
            readyState: WebSocket.OPEN,
          },
        },
        translateWsSession: {
          isOpen: true,
          ws: {
            send: vi.fn(),
            close: translateClose,
            readyState: WebSocket.OPEN,
          },
        },
        onTranscript: vi.fn(),
        lastOriginal: '',
        lastTranslate: '',
        detectedLanguage: 'hi-IN',
        pendingOriginal: 'नमस्ते',
        pendingTranslate: 'Hello',
        debounceTimer: null,
      };

      (service as any).activeStreams.set('call-123_inbound', session);

      const resultPromise = service.finalizeTrackStream('call-123', 'inbound');

      await vi.advanceTimersByTimeAsync(1000);

      const result = await resultPromise;

      expect(session.transcribeWsSession.ws.send).toHaveBeenCalledWith(
        JSON.stringify({type: 'flush'}),
      );

      expect(session.translateWsSession.ws.send).toHaveBeenCalledWith(
        JSON.stringify({type: 'flush'}),
      );

      expect(transcribeClose).toHaveBeenCalled();

      expect(translateClose).toHaveBeenCalled();

      expect((service as any).activeStreams.has('call-123_inbound')).toBe(
        false,
      );

      expect(result).toEqual({
        originalText: 'नमस्ते',
        translatedText: 'Hello',
      });

      vi.useRealTimers();
    });
    it('returns empty texts when session does not exist', async () => {
      const result = await service.finalizeTrackStream(
        'missing-call',
        'inbound',
      );

      expect(result).toEqual({
        originalText: '',
        translatedText: '',
      });
    });
    it('does not send flush to closed sockets', async () => {
      vi.useFakeTimers();

      const session = {
        transcribeWsSession: {
          isOpen: false,
          ws: {
            send: vi.fn(),
            close: vi.fn(),
            readyState: WebSocket.CLOSED,
          },
        },
        translateWsSession: {
          isOpen: false,
          ws: {
            send: vi.fn(),
            close: vi.fn(),
            readyState: WebSocket.CLOSED,
          },
        },
        onTranscript: vi.fn(),
        lastOriginal: '',
        lastTranslate: '',
        detectedLanguage: 'unknown',
        pendingOriginal: '',
        pendingTranslate: '',
        debounceTimer: null,
      };

      (service as any).activeStreams.set('call-123_inbound', session);

      const promise = service.finalizeTrackStream('call-123', 'inbound');

      await vi.advanceTimersByTimeAsync(1000);

      await promise;

      expect(session.transcribeWsSession.ws.send).not.toHaveBeenCalled();

      expect(session.translateWsSession.ws.send).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
    it('clears existing debounce timer', async () => {
      vi.useFakeTimers();

      const clearSpy = vi.spyOn(global, 'clearTimeout');

      const timer = setTimeout(() => {}, 500);

      const session = {
        transcribeWsSession: {
          isOpen: false,
          ws: {
            send: vi.fn(),
            close: vi.fn(),
            readyState: WebSocket.CLOSED,
          },
        },
        translateWsSession: {
          isOpen: false,
          ws: {
            send: vi.fn(),
            close: vi.fn(),
            readyState: WebSocket.CLOSED,
          },
        },
        onTranscript: vi.fn(),
        lastOriginal: '',
        lastTranslate: '',
        detectedLanguage: 'unknown',
        pendingOriginal: '',
        pendingTranslate: '',
        debounceTimer: timer,
      };

      (service as any).activeStreams.set('call-123_inbound', session);

      const promise = service.finalizeTrackStream('call-123', 'inbound');

      await vi.advanceTimersByTimeAsync(1000);

      await promise;

      expect(clearSpy).toHaveBeenCalledWith(timer);

      vi.useRealTimers();
    });
    it('updates accumulated transcript and translation before returning', async () => {
      vi.useFakeTimers();

      const session = {
        transcribeWsSession: {
          isOpen: false,
          ws: {
            send: vi.fn(),
            close: vi.fn(),
            readyState: WebSocket.CLOSED,
          },
        },
        translateWsSession: {
          isOpen: false,
          ws: {
            send: vi.fn(),
            close: vi.fn(),
            readyState: WebSocket.CLOSED,
          },
        },
        onTranscript: vi.fn(),
        lastOriginal: '',
        lastTranslate: '',
        detectedLanguage: 'en-IN',
        pendingOriginal: 'Hello',
        pendingTranslate: 'Bonjour',
        debounceTimer: null,
      };

      (service as any).activeStreams.set('call_inbound', session);

      const promise = service.finalizeTrackStream('call', 'inbound');

      await vi.advanceTimersByTimeAsync(1000);

      await promise;

      expect((service as any).activeTranscriptions.get('call_inbound')).toBe(
        'Hello',
      );

      expect((service as any).activeTranslations.get('call_inbound')).toBe(
        'Bonjour',
      );

      vi.useRealTimers();
    });
    it('appends to existing accumulated transcript and translation', async () => {
      vi.useFakeTimers();

      (service as any).activeTranscriptions.set('call_inbound', 'Existing');

      (service as any).activeTranslations.set(
        'call_inbound',
        'Existing Translation',
      );

      const session = {
        transcribeWsSession: {
          isOpen: false,
          ws: {
            send: vi.fn(),
            close: vi.fn(),
            readyState: WebSocket.CLOSED,
          },
        },
        translateWsSession: {
          isOpen: false,
          ws: {
            send: vi.fn(),
            close: vi.fn(),
            readyState: WebSocket.CLOSED,
          },
        },
        onTranscript: vi.fn(),
        lastOriginal: '',
        lastTranslate: '',
        detectedLanguage: 'en-IN',
        pendingOriginal: 'New',
        pendingTranslate: 'Updated',
        debounceTimer: null,
      };

      (service as any).activeStreams.set('call_inbound', session);

      const promise = service.finalizeTrackStream('call', 'inbound');

      await vi.advanceTimersByTimeAsync(1000);

      await promise;

      expect((service as any).activeTranscriptions.get('call_inbound')).toBe(
        'Existing New',
      );

      expect((service as any).activeTranslations.get('call_inbound')).toBe(
        'Existing Translation Updated',
      );

      vi.useRealTimers();
    });
    it('ignores errors while closing websocket connections', async () => {
      vi.useFakeTimers();

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const session = {
        transcribeWsSession: {
          isOpen: false,
          ws: {
            send: vi.fn(),
            close: vi.fn(() => {
              throw new Error('close failed');
            }),
            readyState: WebSocket.CONNECTING,
          },
        },
        translateWsSession: {
          isOpen: false,
          ws: {
            send: vi.fn(),
            close: vi.fn(),
            readyState: WebSocket.CLOSED,
          },
        },
        onTranscript: vi.fn(),
        lastOriginal: '',
        lastTranslate: '',
        detectedLanguage: 'unknown',
        pendingOriginal: '',
        pendingTranslate: '',
        debounceTimer: null,
      };

      (service as any).activeStreams.set('call_inbound', session);

      const promise = service.finalizeTrackStream('call', 'inbound');

      await vi.advanceTimersByTimeAsync(1000);

      await promise;

      expect(consoleSpy).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });
});
