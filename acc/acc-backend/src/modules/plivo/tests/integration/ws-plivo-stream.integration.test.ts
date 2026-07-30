import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildWsTestApp } from '../helpers/ws-app.js';

// Only Plivo (SDK client) and the outbound Sarvam speech sockets are faked here.
// The local /plivo-stream WebSocket server (bootstrap/websocket.ts), the real
// Express HTTP app used to reserve an agent, and MongoDB are all real - per the
// same "only third-party providers are mocked" principle as the HTTP layer.
const wsMocks = vi.hoisted(() => {
  type Handler = (...args: any[]) => void;
  class MockSarvamSocket {
    static OPEN = 1;
    static CLOSED = 3;
    readyState = MockSarvamSocket.OPEN;
    send = vi.fn();
    close = vi.fn(() => {
      this.readyState = MockSarvamSocket.CLOSED;
    });
    handlers = new Map<string, Handler[]>();
    constructor(public url: string, public options: unknown) {
      wsMocks.sockets.push(this);
    }
    on(event: string, handler: Handler): this {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
      return this;
    }
    emit(event: string, ...args: any[]): void {
      for (const handler of this.handlers.get(event) ?? []) handler(...args);
    }
  }
  return { MockSarvamSocket, sockets: [] as InstanceType<typeof MockSarvamSocket>[] };
});

vi.mock('ws', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ws')>();
  class HybridWebSocket {
    constructor(url: string, opts?: unknown) {
      if (typeof url === 'string' && url.startsWith('wss://api.sarvam.ai')) {
        return new wsMocks.MockSarvamSocket(url, opts) as any;
      }
      return new actual.WebSocket(url as any, opts as any) as any;
    }
  }
  Object.assign(HybridWebSocket, {
    OPEN: actual.WebSocket.OPEN,
    CLOSED: actual.WebSocket.CLOSED,
    CONNECTING: actual.WebSocket.CONNECTING,
    CLOSING: actual.WebSocket.CLOSING,
  });
  return { ...actual, WebSocket: HybridWebSocket };
});

vi.mock('plivo', () => ({
  default: {
    Client: vi.fn().mockImplementation(() => ({
      calls: { list: vi.fn(), get: vi.fn().mockRejectedValue(new Error('no real Plivo in tests')) },
    })),
  },
}));

const { verifyIdToken } = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));
vi.mock('#root/config/firebaseAdmin.js', () => ({
  getFirebaseAuth: () => ({ verifyIdToken }),
  ensureFirebaseAdminInitialized: () => {},
}));

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 10000,
  intervalMs = 100,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  if (!(await predicate())) throw new Error(`waitFor: condition not met within ${timeoutMs}ms`);
}

describe('ACC WebSocket integration (real /plivo-stream server + MongoDB)', () => {
  let app: Express;
  let wsUrl: string;
  let stop: () => Promise<void>;
  let getContainer: () => { get: (id: unknown) => any };
  let GLOBAL_TYPES: any;
  let WebSocket: typeof import('ws').WebSocket;
  let tokenToUid: Map<string, string>;

  beforeAll(async () => {
    const built = await buildWsTestApp();
    app = built.app;
    wsUrl = built.wsUrl;
    stop = built.stop;
    ({ getContainer } = await import('#root/bootstrap/loadModules.js'));
    ({ GLOBAL_TYPES } = await import('#root/types.js'));
    ({ WebSocket } = await import('ws'));
  }, 60000);

  afterAll(async () => {
    await stop();
  });

  beforeEach(async () => {
    verifyIdToken.mockReset();
    tokenToUid = new Map();
    verifyIdToken.mockImplementation(async (token: string) => {
      const uid = tokenToUid.get(token);
      if (!uid) throw new Error('bad token');
      return { uid };
    });
    wsMocks.sockets.length = 0;
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

  async function reserveAgentForCall(callUuid: string) {
    await seedAgentCredentials('agent_1');
    const res = await request(app)
      .post('/api/plivo/answer')
      .type('form')
      .send({ CallUUID: callUuid, From: '+15550001111' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('<Dial');
  }

  function connectClient(query = ''): Promise<{ ws: InstanceType<typeof WebSocket>; messages: any[] }> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${wsUrl}${query}`);
      const messages: any[] = [];
      ws.on('message', (data: Buffer) => {
        try {
          messages.push(JSON.parse(data.toString()));
        } catch {
          messages.push(data.toString());
        }
      });
      ws.once('open', () => resolve({ ws, messages }));
      ws.once('error', reject);
    });
  }

  function closeClient(ws: InstanceType<typeof WebSocket>): Promise<void> {
    return new Promise((resolve) => {
      if (ws.readyState === WebSocket.CLOSED) return resolve();
      ws.once('close', () => resolve());
      ws.close();
    });
  }

  function authQuery(firebaseUID: string) {
    const token = `fake-token-for-${firebaseUID}`;
    tokenToUid.set(token, firebaseUID);
    return `?token=${token}`;
  }

  async function sendMediaStreamLifecycle(mediaWs: InstanceType<typeof WebSocket>, callId: string) {
    mediaWs.send(JSON.stringify({ event: 'start', start: { callId } }));
    await waitFor(() => wsMocks.sockets.length === 4);
    for (const socket of wsMocks.sockets) socket.emit('open');

    mediaWs.send(
      JSON.stringify({
        event: 'media',
        media: { payload: Buffer.from('fake-audio').toString('base64'), track: 'inbound' },
      }),
    );

    // Simulate Sarvam's transcript response on the inbound-transcribe socket
    // (sockets are created in order: inbound-transcribe, inbound-translate,
    // outbound-transcribe, outbound-translate).
    wsMocks.sockets[0].emit(
      'message',
      Buffer.from(JSON.stringify({ type: 'data', data: { transcript: 'hello agent', language_code: 'en-IN' } })),
    );
  }

  it('delivers call_start, a live transcript, and call_end to the assigned agent, and releases the agent afterward', async () => {
    await seedUser();
    await reserveAgentForCall('call-ws-1');

    const dashboard = await connectClient(authQuery('fb-uid-1'));
    const media = await connectClient();

    await sendMediaStreamLifecycle(media.ws, 'call-ws-1');

    await waitFor(() => dashboard.messages.some((m) => m.type === 'transcript'), 10000);
    const transcript = dashboard.messages.find((m) => m.type === 'transcript');
    expect(transcript.originalText).toContain('hello agent');
    expect(dashboard.messages.some((m) => m.type === 'call_start')).toBe(true);

    media.ws.send(JSON.stringify({ event: 'stop' }));
    await waitFor(() => dashboard.messages.some((m) => m.type === 'call_end'), 15000);

    const database = getContainer().get(GLOBAL_TYPES.Database);
    const db = await database.init();
    await waitFor(async () => {
      const agent = await db.collection('users').findOne({ agent: 'agent_1' });
      return agent?.isBusy === false && agent?.currentCallUuid === null;
    }, 10000);

    const savedCall = await db.collection('call_details').findOne({ callUuid: 'call-ws-1' });
    expect(savedCall).not.toBeNull();

    await closeClient(media.ws);
    await closeClient(dashboard.ws);
  }, 30000);

  it('only targets the assigned agent and admin/moderator dashboards, not unrelated agents', async () => {
    await seedUser();
    await reserveAgentForCall('call-ws-2');
    await seedUser({ firebaseUID: 'fb-uid-2', agent: 'agent_2', role: 'call_agent' });
    await seedUser({ firebaseUID: 'fb-uid-3', role: 'moderator', agent: 'not_available' });

    const assignedAgent = await connectClient(authQuery('fb-uid-1'));
    const unrelatedAgent = await connectClient(authQuery('fb-uid-2'));
    const moderator = await connectClient(authQuery('fb-uid-3'));
    const media = await connectClient();

    await sendMediaStreamLifecycle(media.ws, 'call-ws-2');

    await waitFor(() => assignedAgent.messages.some((m) => m.type === 'transcript'), 10000);
    await waitFor(() => moderator.messages.some((m) => m.type === 'transcript'), 10000);

    expect(unrelatedAgent.messages.some((m) => m.type === 'transcript')).toBe(false);

    await closeClient(media.ws);
    await closeClient(assignedAgent.ws);
    await closeClient(unrelatedAgent.ws);
    await closeClient(moderator.ws);
  }, 30000);

  it('broadcasts to everyone when the call has no assigned agent', async () => {
    const dashboard = await connectClient();
    const media = await connectClient();

    await sendMediaStreamLifecycle(media.ws, 'call-ws-3');

    await waitFor(() => dashboard.messages.some((m) => m.type === 'transcript'), 10000);

    await closeClient(media.ws);
    await closeClient(dashboard.ws);
  }, 30000);

  it('only sends call_disconnected (no agent release) for a client that never starts a media stream', async () => {
    await seedUser({ isBusy: true, currentCallUuid: 'call-ws-4' });

    const dashboard = await connectClient();
    const media = await connectClient();

    // No 'start' event sent - this is not a Plivo media stream.
    await closeClient(media.ws);
    await waitFor(() => dashboard.messages.some((m) => m.type === 'call_disconnected'), 10000);

    expect(dashboard.messages.some((m) => m.type === 'call_end')).toBe(false);

    const database = getContainer().get(GLOBAL_TYPES.Database);
    const db = await database.init();
    const agent = await db.collection('users').findOne({ agent: 'agent_1' });
    expect(agent?.isBusy).toBe(true);

    await closeClient(dashboard.ws);
  }, 15000);

  it('does not crash the connection on a non-JSON message', async () => {
    const media = await connectClient();

    media.ws.send('not valid json');
    // The connection should stay open and keep accepting well-formed messages.
    media.ws.send(JSON.stringify({ event: 'start', start: { callId: 'call-ws-5' } }));
    await waitFor(() => wsMocks.sockets.length === 4, 10000);

    expect(media.ws.readyState).toBe(WebSocket.OPEN);

    await closeClient(media.ws);
  }, 15000);
});
