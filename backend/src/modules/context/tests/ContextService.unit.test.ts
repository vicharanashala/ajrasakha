import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {BadRequestError, InternalServerError} from 'routing-controllers';

import {ContextService} from '../services/ContextService.js';
import {appConfig} from '#root/config/app.js';

describe('ContextService', () => {
  let service: ContextService;

  const mockContextRepo = {
    addContext: vi.fn(),
    getById: vi.fn(),
  };

  const mockQuestionService = {};
  const mockDatabase = {};

  beforeEach(() => {
    vi.clearAllMocks();

    service = new ContextService(
      mockContextRepo as any,
      mockQuestionService as any,
      mockDatabase as any,
    );

    vi.spyOn(service as any, '_withTransaction').mockImplementation(
      async (callback: any) => callback({}),
    );

    appConfig.sarvamAPI = 'fake-api-key';
  });

  describe('addContext', () => {
    it('creates context successfully', async () => {
      mockContextRepo.addContext.mockResolvedValueOnce({
        insertedId: 'context-123',
      });

      const result = await service.addContext('user-1', 'sample transcript');

      expect(result).toEqual({
        insertedId: 'context-123',
      });

      expect(mockContextRepo.addContext).toHaveBeenCalled();
    });

    it('throws when transcript is empty', async () => {
      await expect(service.addContext('user-1', '')).rejects.toThrow(
        InternalServerError,
      );
    });

    it('throws when transcript is whitespace', async () => {
      await expect(service.addContext('user-1', '   ')).rejects.toThrow(
        InternalServerError,
      );
    });
  });

  describe('getById', () => {
    it('returns context successfully', async () => {
      const context = {
        _id: 'context-1',
        text: 'sample',
      };

      mockContextRepo.getById.mockResolvedValueOnce(context);

      const result = await service.getById('context-1');

      expect(result).toEqual(context);
    });

    it('throws when contextId is missing', async () => {
      await expect(service.getById('')).rejects.toThrow(InternalServerError);
    });

    it('throws when context not found', async () => {
      mockContextRepo.getById.mockResolvedValueOnce(null);

      await expect(service.getById('missing-id')).rejects.toThrow(
        BadRequestError,
      );
    });
  });

  describe('translate', () => {
    beforeEach(() => {
      appConfig.sarvamAPI = 'fake-api-key';

      vi.spyOn(service as any, '_callSarvamTranslate').mockResolvedValue(
        'translated',
      );
    });

    it('throws when api key is missing', async () => {
      appConfig.sarvamAPI = '';

      await expect(service.translate('hello', 'hi-IN')).rejects.toThrow(
        BadRequestError,
      );
    });

    it('throws when text is missing', async () => {
      await expect(service.translate('', 'hi-IN')).rejects.toThrow(
        BadRequestError,
      );
    });

    it('throws when targetLang is missing', async () => {
      await expect(service.translate('hello', '')).rejects.toThrow(
        BadRequestError,
      );
    });

    it('throws when text exceeds max length', async () => {
      const text = 'a'.repeat(30001);

      await expect(service.translate(text, 'hi-IN')).rejects.toThrow(
        BadRequestError,
      );
    });

    it('uses mayura directly for non-sarvam languages', async () => {
      const spy = vi.spyOn(service as any, '_callSarvamTranslate');

      await service.translate('Hello world', 'fr-FR');

      expect(spy).toHaveBeenCalledWith(
        'Hello world',
        'auto',
        'fr-FR',
        'mayura:v1',
        expect.any(String),
      );
    });

    it('uses two-step translation for sarvam language without sourceLang', async () => {
      const spy = vi.spyOn(service as any, '_callSarvamTranslate');

      await service.translate('Hello world', 'hi-IN');

      expect(spy).toHaveBeenNthCalledWith(
        1,
        'Hello world',
        'auto',
        'en-IN',
        'mayura:v1',
        expect.any(String),
      );

      expect(spy).toHaveBeenNthCalledWith(
        2,
        'translated',
        'en-IN',
        'hi-IN',
        'sarvam-translate:v1',
        expect.any(String),
      );
    });

    it('uses direct sarvam translation when sourceLang is provided', async () => {
      const spy = vi.spyOn(service as any, '_callSarvamTranslate');

      await service.translate('Hello world', 'ur-IN', 'ta-IN');

      expect(spy).toHaveBeenCalledWith(
        'Hello world',
        'ta-IN',
        'ur-IN',
        'sarvam-translate:v1',
        expect.any(String),
      );
    });

    it('uses two-step translation for en-IN without sourceLang', async () => {
      const spy = vi.spyOn(service as any, '_callSarvamTranslate');

      const result = await service.translate('Hello world', 'en-IN');

      expect(result).toEqual({
        translated_text: 'translated',
      });

      expect(spy).toHaveBeenCalledTimes(1);

      expect(spy).toHaveBeenCalledWith(
        'Hello world',
        'auto',
        'en-IN',
        'mayura:v1',
        expect.any(String),
      );
    });

    it('splits large text into multiple chunks', async () => {
      const spy = vi.spyOn(service as any, '_callSarvamTranslate');

      const largeText = 'a'.repeat(2500);

      await service.translate(largeText, 'fr-FR');

      expect(spy.mock.calls.length).toBeGreaterThan(1);
    });

    it('joins translated chunks', async () => {
      vi.spyOn(service as any, '_callSarvamTranslate')
        .mockResolvedValueOnce('chunk1')
        .mockResolvedValueOnce('chunk2')
        .mockResolvedValueOnce('chunk3');

      const result = await service.translate('a'.repeat(2500), 'fr-FR');

      expect(result.translated_text).toContain('chunk1');
      expect(result.translated_text).toContain('chunk2');
    });
  });
});
