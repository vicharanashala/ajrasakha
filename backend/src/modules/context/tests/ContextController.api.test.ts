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

  // POST /context ("creates context successfully", "returns 500 when
  // service throws") removed 2026-08-25 — duplicated by real e2e coverage
  // in src/e2e/context/ContextController.e2e.test.ts: "creates a context
  // from transcript text" (real 201) and BUG-020 (real empty-transcript
  // 500, same status/behavior class). See BUGS_REPORT.md.

  describe('POST /context/translate', () => {
    // Kept (not a duplicate): SARVAM_API_KEY is rejected by Sarvam in this
    // environment (see the "Environment note" in README.md / BUGS_REPORT.md),
    // so the real e2e suite can never reach a real 200 here — this mocked
    // happy path is the only place a successful translate response is
    // verified at all right now.
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

    // "returns 500 when translation service throws" removed 2026-08-25 —
    // duplicated in effect by the real e2e "ENV ISSUE" test in
    // src/e2e/context/ContextController.e2e.test.ts, which already
    // demonstrates a real 500 for this exact route (a rejected Sarvam
    // credential rather than a generic mock throw, but the same
    // service-failure-becomes-500 behavior).
  });
});
