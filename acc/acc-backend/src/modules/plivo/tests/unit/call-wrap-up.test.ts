import 'reflect-metadata';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {PlivoService} from '#root/modules/plivo/services/PlivoService.js';

const mocks = vi.hoisted(() => {
  class MockWebSocket {
    static OPEN = 1;
    static CLOSED = 3;
  }
  return {
    MockWebSocket,
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
vi.mock('../../../../config/app.js', () => ({
  appConfig: {sarvamAPI: 'test-key'},
}));

describe('ACC Call Wrap-Up', () => {
  const callId = 'call-wrap-up-123';
  const agentId = '507f1f77bcf86cd799439011';
  const repository = {
    getByCallUuid: vi.fn(),
    create: vi.fn(),
    updateCallDetails: vi.fn(),
  };
  let service: PlivoService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.callsGet.mockResolvedValue({
      fromNumber: '+919900000001',
      toNumber: '+911234567890',
      callDuration: 125,
      callState: 'completed',
      callDirection: 'inbound',
    });
    repository.getByCallUuid.mockResolvedValue(null);
    repository.create.mockResolvedValue('saved-id');
    service = new PlivoService(repository as any);
    vi.spyOn(service, 'getTranscript').mockImplementation((_id, track) =>
      track === 'inbound' ? 'Farmer question' : 'Agent response',
    );
    vi.spyOn(service, 'getTranslation').mockImplementation((_id, track) =>
      track === 'inbound' ? 'Translated question' : 'Agent response',
    );
    vi.spyOn(service, 'getDetectedLanguage').mockImplementation((_id, track) =>
      track === 'inbound' ? 'hi-IN' : 'en-IN',
    );
    service.setCallAgent(callId, agentId);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('persists call metadata, both participants, and agent mapping', async () => {
    await service.saveCallDetails(callId);

    const saved = repository.create.mock.calls[0][0];
    expect(saved).toMatchObject({
      callUuid: callId,
      duration: 125,
      status: 'completed',
      caller: {
        transcript: 'Farmer question',
        translation: 'Translated question',
        detectedLanguage: 'hi-IN',
      },
      agent: {
        transcript: 'Agent response',
        detectedLanguage: 'en-IN',
      },
    });
    expect(saved.agent.userid.toString()).toBe(agentId);
  });

  it('updates an existing call rather than creating a duplicate', async () => {
    repository.getByCallUuid.mockResolvedValue({callUuid: callId});

    await service.saveCallDetails(callId);

    expect(repository.updateCallDetails).toHaveBeenCalledWith(
      callId,
      expect.objectContaining({callUuid: callId}),
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('preserves transcripts when Plivo metadata is unavailable', async () => {
    mocks.callsGet.mockRejectedValue(new Error('Plivo unavailable'));

    await service.saveCallDetails(callId);

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        caller: expect.objectContaining({transcript: 'Farmer question'}),
        agent: expect.objectContaining({transcript: 'Agent response'}),
      }),
    );
  });

  it('handles repository failure without crashing wrap-up', async () => {
    repository.create.mockRejectedValue(new Error('database unavailable'));

    await expect(service.saveCallDetails(callId)).resolves.toBeUndefined();
  });

  it('clears transcripts and agent mapping after wrap-up', () => {
    (service as any).activeTranscriptions.set(`${callId}_inbound`, 'text');
    (service as any).activeTranslations.set(`${callId}_outbound`, 'text');
    (service as any).detectedLanguages.set(`${callId}_inbound`, 'hi-IN');

    service.clearTranscript(callId);

    expect(service.getCallAgent(callId)).toBeUndefined();
    expect((service as any).activeTranscriptions.has(`${callId}_inbound`))
      .toBe(false);
    expect((service as any).activeTranslations.has(`${callId}_outbound`))
      .toBe(false);
    expect((service as any).detectedLanguages.has(`${callId}_inbound`))
      .toBe(false);
  });
});
