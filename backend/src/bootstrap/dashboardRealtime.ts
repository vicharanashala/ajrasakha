import type { Server } from 'http';
import type { ChangeStream } from 'mongodb';
import { WebSocketServer, WebSocket } from 'ws';
import { getContainer } from './loadModules.js';
import { GLOBAL_TYPES } from '#root/types.js';
import type { MongoDatabase } from '#root/shared/database/providers/mongo/MongoDatabase.js';
import type { IDashboardContentService } from '#root/modules/dashboard/interfaces/IDashboardContentService.js';

/**
 * Real-time headline counts for the public dashboard — push, not poll.
 *
 * A WebSocket server on /ws/dashboard broadcasts the four counts whenever the questions
 * collection changes, driven by a MongoDB change stream rather than a timer.
 *
 * Why a change stream and not a shared bus: on Cloud Run the backend autoscales to several
 * instances. A question inserted by a request on instance B must still update a dashboard
 * socket held by instance A. Each instance opens its OWN change stream and serves its OWN
 * clients — the database is the fan-out — so this is correct for any number of instances
 * with no Redis / pub-sub to run. (Change streams need a replica set; Atlas provides one.)
 */

const WS_PATH = '/ws/dashboard';

// Coalesce a burst of writes (e.g. a batch insert) into a single recompute + broadcast.
const BROADCAST_DEBOUNCE_MS = 1500;

// Backoff before re-opening a change stream that errored or was dropped by the server.
const RESUME_DELAY_MS = 5000;

export const initDashboardRealtime = (server: Server): void => {
  const wss = new WebSocketServer({ server, path: WS_PATH });
  const container = getContainer();
  const dashboardService = container.get<IDashboardContentService>(
    GLOBAL_TYPES.DashboardContentService,
  );
  const db = container.get<MongoDatabase>(GLOBAL_TYPES.Database);

  // The most recent payload, so a new client gets the current figures on connect without
  // waiting for the next DB change.
  let lastPayload: string | null = null;

  const buildPayload = async (): Promise<string> => {
    const data = await dashboardService.getPublicDashboardCounts();
    return JSON.stringify({ type: 'counts', data, at: new Date().toISOString() });
  };

  const broadcast = async () => {
    // Skip the DB round-trip entirely when nobody is listening.
    if (wss.clients.size === 0) return;
    try {
      lastPayload = await buildPayload();
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) client.send(lastPayload);
      }
    } catch (err) {
      console.error('[dashboard-rt] failed to compute/broadcast counts:', err);
    }
  };

  let debounce: NodeJS.Timeout | null = null;
  const scheduleBroadcast = () => {
    if (debounce) return; // already pending — the trailing recompute will see all changes
    debounce = setTimeout(() => {
      debounce = null;
      void broadcast();
    }, BROADCAST_DEBOUNCE_MS);
  };

  wss.on('connection', async (ws: WebSocket) => {
    try {
      if (!lastPayload) lastPayload = await buildPayload();
      if (ws.readyState === WebSocket.OPEN) ws.send(lastPayload);
    } catch (err) {
      console.error('[dashboard-rt] failed to send initial counts:', err);
    }
    ws.on('error', err => console.error('[dashboard-rt] ws error:', err));
  });

  const startChangeStream = async () => {
    try {
      const collection = await db.getCollection('questions');
      // Watch every op: inserts move total/today/month, status updates move validatedQAPairs.
      const stream: ChangeStream = collection.watch();
      console.log('[dashboard-rt] change stream open on questions');

      stream.on('change', () => scheduleBroadcast());
      stream.on('error', err => {
        console.error('[dashboard-rt] change stream error — resuming:', err);
        stream.close().catch(() => undefined);
        setTimeout(() => void startChangeStream(), RESUME_DELAY_MS);
      });
    } catch (err) {
      console.error('[dashboard-rt] could not open change stream — retrying:', err);
      setTimeout(() => void startChangeStream(), RESUME_DELAY_MS);
    }
  };

  void startChangeStream();
  console.log(`[dashboard-rt] WebSocket listening on ${WS_PATH}`);
};
