import http from 'http';
import type { AddressInfo } from 'net';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { buildHttpTestApp, type HttpTestApp } from './http-app.js';

export interface WsTestApp extends HttpTestApp {
  wsUrl: string;
}

// bootstrap/websocket.ts's handleCallEnd() calls UserService.markAgentAsAvailable,
// which runs inside a real Mongo transaction (BaseService._withTransaction). A
// standalone mongodb-memory-server instance rejects transactions outright, so this
// harness boots a real 1-node replica set instead - matching how production Mongo
// (Atlas) is always deployed - rather than avoiding the code path the plain HTTP
// harness never needed to exercise.
export async function buildWsTestApp(dbName?: string): Promise<WsTestApp> {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const { app, stop: stopApp } = await buildHttpTestApp({
    dbName,
    mongoUri: replSet.getUri(),
  });

  const { initWebSocket } = await import('#root/bootstrap/websocket.js');
  const server = http.createServer(app);
  initWebSocket(server);

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;

  return {
    app,
    wsUrl: `ws://127.0.0.1:${port}/plivo-stream`,
    stop: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await stopApp();
      await replSet.stop();
    },
  };
}
