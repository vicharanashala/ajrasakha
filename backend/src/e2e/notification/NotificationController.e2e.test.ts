/**
 * Notification Controller — End-to-End test.
 *
 * WHAT THIS COVERS
 * ----------------
 *   POST   /api/notifications                    (create)
 *   GET    /api/notifications                     (own, paginated)
 *   GET    /api/notifications/user/:userId         (admin only — @Authorized(['admin']) ONLY, no in-handler check)
 *   POST   /api/notifications/user/:userId/send    (admin+coordinator only — same pattern)
 *   POST   /api/notifications/users/send            (bulk send — same pattern)
 *   DELETE /api/notifications/:notificationId
 *   PATCH  /api/notifications/:notificationId       (mark as read)
 *   PATCH  /api/notifications/                       (mark all as read)
 *   POST   /api/notifications/subscriptions          (save push subscription)
 *   POST   /api/notifications/send-notification       (send push — real web-push call against a fake endpoint)
 *
 * Unlike `PublicDashboardController` (which added its own `assertAdmin()` to work
 * around BUG-017), `NotificationController`'s admin/coordinator-only routes have
 * NO in-handler role check at all — they rely purely on `@Authorized([roles])`,
 * which BUG-017 (see README) shows does nothing beyond confirming *some*
 * authenticated user. This suite documents that a non-admin/non-coordinator is NOT
 * blocked from these routes, consistent with BUG-017.
 */

process.env.NODE_ENV = 'development';

import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config({path: '.env'});
dotenv.config({path: '.env.test'});

import express from 'express';
import request from 'supertest';
import {useExpressServer} from 'routing-controllers';
import {ObjectId} from 'mongodb';
import {describe, it, expect, beforeAll, afterAll} from 'vitest';

const ROUTE_PREFIX = '/api';
const RUN_TAG = `E2E_NOTIF_${Date.now()}`;
const INTERNAL_API_KEY = 'e2e-notification-key';

let app: express.Express;
let db: any;
let adminUser: any;
let moderatorUser: any;
let expertUser: any;

let currentTestUser: any = null;
const createdNotificationIds: string[] = [];

beforeAll(async () => {
  await import('#root/modules/answer/services/AnswerService.js');
  process.env.INTERNAL_API_KEY = INTERNAL_API_KEY;

  const {loadAppModules, getContainer} = await import('#root/bootstrap/loadModules.js');
  const {GLOBAL_TYPES} = await import('#root/types.js');

  const {controllers} = await loadAppModules('all');
  const container = getContainer();
  db = container.get(GLOBAL_TYPES.Database);

  app = useExpressServer(express(), {
    controllers,
    routePrefix: ROUTE_PREFIX,
    defaultErrorHandler: true,
    authorizationChecker: async () => !!currentTestUser,
    currentUserChecker: async () => currentTestUser,
  });

  const users = await db.getCollection('users');
  [adminUser, moderatorUser, expertUser] = await Promise.all([
    users.findOne({email: process.env.ADMIN_EMAIL}),
    users.findOne({email: process.env.MODERATOR_EMAIL}),
    users.findOne({email: process.env.EXPERT_EMAIL}),
  ]);
  const missing = [
    !adminUser && `ADMIN_EMAIL=${process.env.ADMIN_EMAIL}`,
    !moderatorUser && `MODERATOR_EMAIL=${process.env.MODERATOR_EMAIL}`,
    !expertUser && `EXPERT_EMAIL=${process.env.EXPERT_EMAIL}`,
  ].filter(Boolean);
  if (missing.length) throw new Error(`Test users not found: ${missing.join(', ')}`);
}, 90000);

afterAll(async () => {
  currentTestUser = null;
  if (db && createdNotificationIds.length) {
    const notifications = await db.getCollection('notifications');
    for (const id of createdNotificationIds) {
      await notifications.deleteOne({_id: new ObjectId(id)}).catch(() => {});
    }
    console.log(`[teardown] Cleaned up ${createdNotificationIds.length} notification(s).`);
  }
  if (db?.disconnect) await db.disconnect();
}, 60000);

function apiGet(path: string) {
  return request(app).get(path).set('x-internal-api-key', INTERNAL_API_KEY);
}
function apiPost(path: string) {
  return request(app).post(path).set('x-internal-api-key', INTERNAL_API_KEY);
}
function apiDelete(path: string) {
  return request(app).delete(path).set('x-internal-api-key', INTERNAL_API_KEY);
}
function apiPatch(path: string) {
  return request(app).patch(path).set('x-internal-api-key', INTERNAL_API_KEY);
}

describe('POST /notifications', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiPost(`${ROUTE_PREFIX}/notifications`).send({});
    expect(res.status).toBe(401);
  });

  it('rejects a request missing required fields', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPost(`${ROUTE_PREFIX}/notifications`).send({entityId: 'x'});

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(400);
  });

  it('creates a notification for the current user', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPost(`${ROUTE_PREFIX}/notifications`).send({
      entityId: new ObjectId().toString(),
      type: 'flag',
      message: `${RUN_TAG} — test message`,
      title: `${RUN_TAG} — test title`,
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(201);
    expect(res.body.insertedId).toBeTruthy();
    createdNotificationIds.push(res.body.insertedId);
  });
});

describe('GET /notifications', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/notifications`);
    expect(res.status).toBe(401);
  });

  it('returns the paginated list including the new notification', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/notifications?page=1&limit=50`);

    console.log('STATUS:', res.status, 'totalCount:', res.body.totalCount);
    expect(res.status).toBe(200);
    expect(res.body.notifications.some((n: any) => n._id === createdNotificationIds[0])).toBe(true);
  });
});

describe('GET /notifications/user/:userId', () => {
  // BUG-017: a non-admin (expert) is NOT blocked by @Authorized(['admin']) — the
  // request reaches business logic regardless of role. It still 404s here, but
  // for an unrelated reason: this route's `userId` targets the DASHBOARD user
  // domain, not the app `users` collection, so a real app-user id like
  // moderatorUser._id doesn't resolve — proving the request got past auth (a
  // true auth block would show up as 401/403, not a downstream 404).
  it('BUG-017: a non-admin (expert) is NOT blocked despite @Authorized(["admin"]) — reaches business logic (404 is unrelated to auth)', async () => {
    currentTestUser = expertUser;
    const res = await apiGet(`${ROUTE_PREFIX}/notifications/user/${moderatorUser._id.toString()}`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

describe('POST /notifications/user/:userId/send', () => {
  it('BUG-017: a non-admin/coordinator (expert) is NOT blocked — reaches business logic (404 is unrelated to auth)', async () => {
    currentTestUser = expertUser;
    const res = await apiPost(`${ROUTE_PREFIX}/notifications/user/${moderatorUser._id.toString()}/send`).send({
      title: `${RUN_TAG} — direct send`,
      message: 'hello from an unprivileged caller',
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect(res.body.message).toBe('Target user not found');
  });
});

describe('POST /notifications/users/send', () => {
  it('admin bulk-sends to multiple users', async () => {
    currentTestUser = adminUser;
    const res = await apiPost(`${ROUTE_PREFIX}/notifications/users/send`).send({
      userIds: [moderatorUser._id.toString(), expertUser._id.toString()],
      title: `${RUN_TAG} — bulk send`,
      message: 'hello from admin bulk send',
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 300));
    expect(res.status).toBe(201);
  });
});

describe('PATCH /notifications/:notificationId', () => {
  it('marks a notification as read', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPatch(`${ROUTE_PREFIX}/notifications/${createdNotificationIds[0]}`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
    expect(res.body.modifiedCount).toBe(1);
  });
});

describe('PATCH /notifications', () => {
  it('marks all notifications as read for the current user', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPatch(`${ROUTE_PREFIX}/notifications`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
    expect(res.body.modifiedCount).toBeGreaterThanOrEqual(0);
  });
});

describe('POST /notifications/subscriptions', () => {
  it('saves a push subscription for the current user', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPost(`${ROUTE_PREFIX}/notifications/subscriptions`).send({
      subscription: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-fake-endpoint',
        keys: {p256dh: 'fake-p256dh-key', auth: 'fake-auth-key'},
      },
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    // Declared @HttpCode(201), but this is an upsert keyed by userId — a repeat
    // run against an already-subscribed test user updates 0 fields and
    // routing-controllers ships 204 No Content for the falsy result instead of
    // the declared 201. Both are clean success signals; accept either.
    expect([200, 201, 204]).toContain(res.status);
  });
});

describe('POST /notifications/send-notification', () => {
  it('errors sending a real push to a fake subscription endpoint', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPost(`${ROUTE_PREFIX}/notifications/send-notification`).send({
      message: `${RUN_TAG} — push attempt`,
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('DELETE /notifications/:notificationId', () => {
  it('deletes the notification', async () => {
    currentTestUser = moderatorUser;
    const res = await apiDelete(`${ROUTE_PREFIX}/notifications/${createdNotificationIds[0]}`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
    expect(res.body.deletedCount).toBe(1);
  });
});
