import 'reflect-metadata';
import request from 'supertest';
import Express from 'express';
import {useExpressServer, useContainer} from 'routing-controllers';
import {Container} from 'inversify';
import {describe, it, expect, beforeAll, beforeEach, vi} from 'vitest';

import {InversifyAdapter} from '#root/inversify-adapter.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {HttpErrorHandler} from '#shared/index.js';

import {ContextController} from '../controllers/ContextController.js';

const mockUser = {
  _id: '664f000000000000000000001',
  role: 'admin',
  firebaseUID: 'firebase-admin-uid',
  email: 'admin@test.com',
  firstName: 'Admin',
  lastName: 'User',
  status: 'active',
  isBlocked: false,
};

const mockContextService = {
  addContext: vi.fn(),
  translate: vi.fn(),
};

describe('ContextController', () => {
  let app: any;

  beforeAll(() => {
    const container = new Container();

    container.bind(ContextController).toSelf().inSingletonScope();

    container
      .bind(GLOBAL_TYPES.ContextService)
      .toConstantValue(mockContextService);

    container.bind(HttpErrorHandler).toSelf().inSingletonScope();

    useContainer(new InversifyAdapter(container));

    app = useExpressServer(Express(), {
      controllers: [ContextController],
      middlewares: [HttpErrorHandler],
      defaultErrorHandler: false,
      validation: true,

      authorizationChecker: async () => true,

      currentUserChecker: async () => mockUser,
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /context', () => {
    it('creates context successfully', async () => {
      mockContextService.addContext.mockResolvedValueOnce({
        insertedId: 'context-123',
      });

      const res = await request(app).post('/context').send({
        transcript: 'This is a transcript',
      });

      expect(res.status).toBe(201);

      expect(res.body).toEqual({
        insertedId: 'context-123',
      });

      expect(mockContextService.addContext).toHaveBeenCalledWith(
        mockUser._id,
        'This is a transcript',
      );
    });

    it('returns 500 when service throws', async () => {
      mockContextService.addContext.mockRejectedValueOnce(
        new Error('Failed to create context'),
      );

      const res = await request(app).post('/context').send({
        transcript: 'test transcript',
      });

      expect(res.status).toBe(500);
    });
  });

  describe('POST /context/translate', () => {
    it('translates successfully', async () => {
      mockContextService.translate.mockResolvedValueOnce({
        translated_text: 'नमस्ते',
      });

      const res = await request(app).post('/context/translate').send({
        text: 'Hello',
        targetLang: 'hi-IN',
      });

      expect(res.status).toBe(200);

      expect(res.body).toEqual({
        translated_text: 'नमस्ते',
      });

      expect(mockContextService.translate).toHaveBeenCalledWith(
        'Hello',
        'hi-IN',
        undefined,
      );
    });

    it('passes sourceLang when provided', async () => {
      mockContextService.translate.mockResolvedValueOnce({
        translated_text: 'नमस्ते',
      });

      await request(app).post('/context/translate').send({
        text: 'Hello',
        targetLang: 'hi-IN',
        sourceLang: 'en-IN',
      });

      expect(mockContextService.translate).toHaveBeenCalledWith(
        'Hello',
        'hi-IN',
        'en-IN',
      );
    });

    it('returns 500 when translation service throws', async () => {
      mockContextService.translate.mockRejectedValueOnce(
        new Error('Translation failed'),
      );

      const res = await request(app).post('/context/translate').send({
        text: 'Hello',
        targetLang: 'hi-IN',
      });

      expect(res.status).toBe(500);
    });
  });
});
