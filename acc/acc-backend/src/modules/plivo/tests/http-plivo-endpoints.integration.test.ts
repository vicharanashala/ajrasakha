import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildHttpTestApp } from './helpers/http-app.js';

// Plivo/Firebase are the ONLY external seams mocked here - everything else
// (Express, routing-controllers, middleware, validation, DI, MongoDB) is
// real, per the Layer 4 HTTP-integration scope: exercise ACC's own HTTP
// boundary, not third-party providers.
vi.mock('plivo', () => ({
  default: {
    Client: vi.fn().mockImplementation(() => ({ calls: { list: vi.fn() } })),
  },
}));

const { verifyIdToken } = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));
vi.mock('#root/config/firebaseAdmin.js', () => ({
  getFirebaseAuth: () => ({ verifyIdToken }),
  ensureFirebaseAdminInitialized: () => {},
}));

describe('ACC HTTP integration (real Express + routing-controllers + MongoDB)', () => {
  let app: Express;
  let stop: () => Promise<void>;
  let getContainer: () => { get: (id: unknown) => any };
  let GLOBAL_TYPES: any;

  beforeAll(async () => {
    const built = await buildHttpTestApp();
    app = built.app;
    stop = built.stop;
    ({ getContainer } = await import('#root/bootstrap/loadModules.js'));
    ({ GLOBAL_TYPES } = await import('#root/types.js'));
  }, 60000);

  afterAll(async () => {
    await stop();
  });

  beforeEach(async () => {
    verifyIdToken.mockReset();
    const database = getContainer().get(GLOBAL_TYPES.Database);
    const db = await database.init();
    await db.collection('users').deleteMany({});
    await db.collection('call_details').deleteMany({});
    await db.collection('call_credentials').deleteMany({});
  });

  async function seedUser(overrides: Record<string, unknown> = {}) {
    const database = getContainer().get(GLOBAL_TYPES.Database);
    const db = await database.init();
    const result = await db.collection('users').insertOne({
      firebaseUID: 'fb-uid-1',
      email: 'agent@example.test',
      firstName: 'Agent',
      role: 'call_agent',
      isCallAgentActive: true,
      isBusy: false,
      agent: 'agent_1',
      currentCallUuid: null,
      ...overrides,
    });
    return result.insertedId;
  }

  async function seedAgentCredentials(agentNumber = 'agent_1') {
    const database = getContainer().get(GLOBAL_TYPES.Database);
    const db = await database.init();
    await db.collection('call_credentials').insertOne({
      agentNumber,
      username: `${agentNumber}-sip-user`,
    });
  }

  function authAs(firebaseUID: string) {
    verifyIdToken.mockResolvedValue({ uid: firebaseUID });
    return { Authorization: 'Bearer fake-token-for-' + firebaseUID };
  }

  describe('GET /api/health', () => {
    it('returns 200 with a healthy status body', async () => {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(typeof res.body.uptime).toBe('number');
    });
  });

  describe('CORS', () => {
    it('answers an OPTIONS preflight with 204 and the allow headers', async () => {
      const res = await request(app)
        .options('/api/plivo/history')
        .set('Origin', 'http://localhost:5173');

      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-methods']).toContain('POST');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  describe('GET /api/reference (Scalar/OpenAPI docs)', () => {
    it('serves the API reference page over real HTTP', async () => {
      const res = await request(app).get('/api/reference');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
    });
  });

  describe('GET /api/unknown-route', () => {
    it('returns 404 for a route nothing registers', async () => {
      const res = await request(app).get('/api/this-route-does-not-exist');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/plivo/answer', () => {
    it('returns busy XML when no agent is available', async () => {
      const res = await request(app)
        .post('/api/plivo/answer')
        .type('form')
        .send({ CallUUID: 'call-1', From: '+15550001111' });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/xml');
      expect(res.text).toContain('All agents are busy');
      expect(res.text).toContain('<Hangup');
    });

    it('reserves a real agent from MongoDB and returns dial XML', async () => {
      await seedUser();
      await seedAgentCredentials('agent_1');

      const res = await request(app)
        .post('/api/plivo/answer')
        .type('form')
        .send({ CallUUID: 'call-2', From: '+15550002222' });

      expect(res.status).toBe(200);
      expect(res.text).toContain('<Dial');
      expect(res.text).not.toContain('All agents are busy');

      const database = getContainer().get(GLOBAL_TYPES.Database);
      const db = await database.init();
      const agent = await db.collection('users').findOne({ agent: 'agent_1' });
      expect(agent?.isBusy).toBe(true);
      expect(agent?.currentCallUuid).toBe('call-2');
    });
  });

  describe('POST /api/plivo/webhook/call-ended', () => {
    it('releases the agent holding the call and returns 200', async () => {
      await seedUser({ isBusy: true, currentCallUuid: 'call-3' });

      const res = await request(app)
        .post('/api/plivo/webhook/call-ended')
        .type('form')
        .send({ CallUUID: 'call-3' });

      expect(res.status).toBe(200);
      expect(res.text).toBe('OK');

      const database = getContainer().get(GLOBAL_TYPES.Database);
      const db = await database.init();
      const agent = await db.collection('users').findOne({ agent: 'agent_1' });
      expect(agent?.isBusy).toBe(false);
      expect(agent?.currentCallUuid).toBeNull();
    });

    // FINDING: routing-controllers' ExpressDriver.handleSuccess() treats an
    // action's resolved return value of `undefined` as "the controller never
    // handled the response" and throws a NotFoundError - UNLESS the method's
    // return value is `=== options.response` (i.e. `return res.send(...)`).
    // Every @Res()-based handler in this controller calls `res.send(...)`
    // without `return`, so its async method always resolves to `undefined`.
    // That NotFoundError is then routed to handleError(), which tries to
    // send a *second* response body on the connection whose headers are
    // already flushed; Express's res.json()/res.send() throws
    // ERR_HTTP_HEADERS_SENT while doing so, which is itself caught by
    // executeAction()'s outer .catch and re-enters handleError() a second
    // time with an error that has no `.httpCode`, landing on `response
    // .status(500)`. That call is a harmless in-memory property write at
    // this point (the real bytes - status 200 - already reached the client,
    // confirmed by the assertions above), but it corrupts `res.statusCode`
    // for anything that reads it afterward - including loggingHandler's
    // `res.on('finish')` access-log line. Result: every successful call to
    // an affected endpoint is logged as a 500, even though callers see 200.
    // This silently poisons any monitoring/alerting built on these access
    // logs for two of the highest-traffic endpoints in the call-routing
    // path. Not fixed here - see feedback_testers_only_no_app_fixes in
    // memory - but reproduced below via the real access-log line itself.
    it('KNOWN FINDING: access log records a false 500 for /answer and /webhook/call-ended even though the client gets 200', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await seedUser();
      await seedAgentCredentials('agent_1');

      const answerRes = await request(app)
        .post('/api/plivo/answer')
        .type('form')
        .send({ CallUUID: 'call-finding-1', From: '+15550009999' });
      expect(answerRes.status).toBe(200);
      expect(answerRes.text).toContain('<Dial');

      const endedRes = await request(app)
        .post('/api/plivo/webhook/call-ended')
        .type('form')
        .send({ CallUUID: 'call-finding-1' });
      expect(endedRes.status).toBe(200);
      expect(endedRes.text).toBe('OK');

      const loggedLines = logSpy.mock.calls.map((call) => call[0]);
      const falseAnswer500 = loggedLines.some(
        (line) => typeof line === 'string' && line.includes('POST /api/plivo/answer') && line.includes('Status: 500'),
      );
      const falseEnded500 = loggedLines.some(
        (line) =>
          typeof line === 'string' && line.includes('POST /api/plivo/webhook/call-ended') && line.includes('Status: 500'),
      );

      logSpy.mockRestore();

      expect(falseAnswer500).toBe(true);
      expect(falseEnded500).toBe(true);
    });
  });

  describe('authorization on @Authorized() routes', () => {
    it('rejects a request with no bearer token', async () => {
      const res = await request(app).get('/api/plivo/analytics');

      expect(res.status).toBe(401);
    });

    it('rejects a request whose Firebase token fails verification', async () => {
      verifyIdToken.mockRejectedValue(new Error('invalid token'));

      const res = await request(app)
        .get('/api/plivo/analytics')
        .set('Authorization', 'Bearer garbage');

      expect(res.status).toBe(401);
    });

    it('rejects a valid token for a firebaseUID with no matching DB user', async () => {
      verifyIdToken.mockResolvedValue({ uid: 'no-such-user' });

      const res = await request(app)
        .get('/api/plivo/analytics')
        .set('Authorization', 'Bearer fake-token');

      expect(res.status).toBe(401);
    });

    it('applies the controller role check for an authenticated non-call_agent', async () => {
      await seedUser({ role: 'admin' });
      const headers = authAs('fb-uid-1');

      const res = await request(app).get('/api/plivo/analytics').set(headers);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Only call agents');
    });

    it('returns 200 analytics for a properly authenticated call_agent', async () => {
      await seedUser({ role: 'call_agent' });
      const headers = authAs('fb-uid-1');

      const res = await request(app).get('/api/plivo/analytics').set(headers);

      expect(res.status).toBe(200);
      expect(res.body.totalCalls).toBe(0);
    });
  });

  describe('request validation', () => {
    it('rejects /send-message with missing destination/text as a 400', async () => {
      await seedUser();
      const headers = authAs('fb-uid-1');

      const res = await request(app).post('/api/plivo/send-message').set(headers).send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    // FINDING: body-parser's JSON SyntaxError carries `status: 400`, but
    // HttpErrorHandler (shared/middleware/errorHandler.ts) only special-cases
    // UnauthorizedError/HttpError; any other `instanceof Error` - including
    // this one - is flattened to 500. A malformed JSON body on ANY endpoint
    // in the app currently surfaces as a 500, not the expected 400. Asserting
    // the actual (buggy) behavior here rather than "fixing" it - see
    // feedback_testers_only_no_app_fixes in memory.
    it('currently returns 500 (not 400) for a malformed JSON body - HttpErrorHandler ignores err.status for generic Errors', async () => {
      const res = await request(app)
        .post('/api/plivo/send-message')
        .set('Content-Type', 'application/json')
        .send('{not valid json');

      expect(res.status).toBe(500);
    });
  });
});
