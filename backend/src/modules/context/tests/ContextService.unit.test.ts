import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {BadRequestError} from 'routing-controllers';

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
      await expect(service.addContext('user-1', '')).rejects.toThrow();
    });
  });

  describe('translate', () => {
    beforeEach(() => {
      appConfig.sarvamAPI = 'fake-api-key';

      vi.spyOn(service as any, '_callSarvamTranslate').mockResolvedValue(
        'translated',
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

    it('uses mayura model for supported languages', async () => {
      const spy = vi.spyOn(service as any, '_callSarvamTranslate');

      await service.translate('Hello world', 'hi-IN');

      expect(spy).toHaveBeenCalledWith(
        'Hello world',
        'auto',
        'hi-IN',
        'mayura:v1',
        expect.any(String),
      );
    });

    it('uses sarvam model for sarvam-only languages', async () => {
      const spy = vi.spyOn(service as any, '_callSarvamTranslate');

      await service.translate('Hello world', 'ur-IN');

      expect(spy).toHaveBeenCalledWith(
        'Hello world',
        'en-IN',
        'ur-IN',
        'sarvam-translate:v1',
        expect.any(String),
      );
    });

    it('uses provided source language for sarvam-only language', async () => {
      const spy = vi.spyOn(service as any, '_callSarvamTranslate');

      await service.translate('Hello world', 'ur-IN', 'hi-IN');

      expect(spy).toHaveBeenCalledWith(
        'Hello world',
        'hi-IN',
        'ur-IN',
        'sarvam-translate:v1',
        expect.any(String),
      );
    });

    it('splits large text into multiple chunks', async () => {
      const spy = vi.spyOn(service as any, '_callSarvamTranslate');

      const largeText = 'a'.repeat(2500);

      await service.translate(largeText, 'hi-IN');

      expect(spy.mock.calls.length).toBeGreaterThan(1);
    });

    it('joins translated chunks', async () => {
      vi.spyOn(service as any, '_callSarvamTranslate')
        .mockResolvedValueOnce('chunk1')
        .mockResolvedValueOnce('chunk2')
        .mockResolvedValueOnce('chunk3');

      const result = await service.translate('a'.repeat(2500), 'hi-IN');

      expect(result.translated_text).toContain('chunk');
    });
  });
});
