import 'reflect-metadata';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {PlivoService} from '#root/modules/plivo/services/PlivoService.js';

const mocks = vi.hoisted(() => {
  class MockWebSocket {
    static OPEN = 1;
    static CLOSED = 3;
  }

  return {
    MockWebSocket,
    plivoCallsGet: vi.fn(),
    plivoClientConstructor: vi.fn(),
  };
});

vi.mock('ws', () => ({
  WebSocket: mocks.MockWebSocket,
}));

vi.mock('plivo', () => ({
  default: {
    Client: mocks.plivoClientConstructor.mockImplementation(() => ({
      calls: {
        get: mocks.plivoCallsGet,
      },
    })),
  },
}));

vi.mock('../../../config/app.js', () => ({
  appConfig: {
    sarvamAPI: 'test-sarvam-api-key',
  },
}));

describe('ACC Call Wrap-Up', () => {
  const callUuid = 'call-wrap-up-123';
  const agentUserId = '507f1f77bcf86cd799439011';
  const callDetailsRepository = {
    getByCallUuid: vi.fn(),
    create: vi.fn(),
    updateCallDetails: vi.fn(),
  };

  let service: PlivoService;

  const arrangeCapturedConversation = (): void => {
    vi.spyOn(service, 'getTranscript').mockImplementation((_callId, track) =>
      track === 'inbound' ? 'मुझे गेहूं की जानकारी चाहिए' : 'I can help',
    );
    vi.spyOn(service, 'getTranslation').mockImplementation((_callId, track) =>
      track === 'inbound' ? 'I need information about wheat' : 'I can help',
    );
    vi.spyOn(service, 'getDetectedLanguage')
      .mockImplementation((_callId, track) =>
        track === 'inbound' ? 'hi-IN' : 'en-IN',
      );
    service.setCallAgent(callUuid, agentUserId);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PlivoService(callDetailsRepository as any);
    mocks.plivoCallsGet.mockResolvedValue({
      fromNumber: '+919900000001',
      toNumber: '+911234567890',
      callDuration: 125,
      callState: 'completed',
      callDirection: 'inbound',
    });
    callDetailsRepository.getByCallUuid.mockResolvedValue(null);
    callDetailsRepository.create.mockResolvedValue('saved-call-id');
    callDetailsRepository.updateCallDetails.mockResolvedValue(undefined);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('saves completed call metadata, both transcripts, and the agent mapping', async () => {
    // Arrange
    arrangeCapturedConversation();

    // Act
    await service.saveCallDetails(callUuid);

    // Assert
    expect(mocks.plivoCallsGet).toHaveBeenCalledWith(callUuid);
    expect(callDetailsRepository.create).toHaveBeenCalledOnce();
    const saved = callDetailsRepository.create.mock.calls[0][0];
    expect(saved).toMatchObject({
      callUuid,
      from: '+919900000001',
      to: '+911234567890',
      duration: 125,
      status: 'completed',
      direction: 'inbound',
      caller: {
        transcript: 'मुझे गेहूं की जानकारी चाहिए',
        translation: 'I need information about wheat',
        detectedLanguage: 'hi-IN',
      },
      agent: {
        transcript: 'I can help',
        translation: 'I can help',
        detectedLanguage: 'en-IN',
      },
    });
    expect(saved.agent.userid.toString()).toBe(agentUserId);
  });

  it('updates the existing call record instead of creating a duplicate', async () => {
    // Arrange
    arrangeCapturedConversation();
    callDetailsRepository.getByCallUuid.mockResolvedValue({
      callUuid,
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

    // Act
    await service.saveCallDetails(callUuid);

    // Assert
    expect(callDetailsRepository.updateCallDetails)
      .toHaveBeenCalledWith(
        callUuid,
        expect.objectContaining({callUuid, status: 'completed'}),
      );
    expect(callDetailsRepository.create).not.toHaveBeenCalled();
  });

  it('preserves captured transcripts when Plivo metadata is unavailable', async () => {
    // Arrange
    arrangeCapturedConversation();
    mocks.plivoCallsGet.mockRejectedValue(new Error('Plivo unavailable'));

    // Act
    await service.saveCallDetails(callUuid);

    // Assert
    expect(callDetailsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        callUuid,
        caller: expect.objectContaining({
          transcript: 'मुझे गेहूं की जानकारी चाहिए',
        }),
        agent: expect.objectContaining({
          transcript: 'I can help',
        }),
      }),
    );
  });

  it('handles call-detail persistence failure without crashing wrap-up', async () => {
    // Arrange
    arrangeCapturedConversation();
    callDetailsRepository.create.mockRejectedValue(
      new Error('database unavailable'),
    );

    // Act / Assert
    await expect(service.saveCallDetails(callUuid)).resolves.toBeUndefined();
  });

  it('clears the call-to-agent mapping after wrap-up cleanup', () => {
    // Arrange
    service.setCallAgent(callUuid, agentUserId);
    expect(service.getCallAgent(callUuid)).toBe(agentUserId);

    // Act
    service.clearTranscript(callUuid);

    // Assert
    expect(service.getCallAgent(callUuid)).toBeUndefined();
    expect(service.getTranscript(callUuid, 'inbound')).toBe('');
    expect(service.getTranslation(callUuid, 'outbound')).toBe('');
    expect(service.getDetectedLanguage(callUuid, 'inbound')).toBe('unknown');
  });
});
