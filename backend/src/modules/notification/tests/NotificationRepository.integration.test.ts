import 'reflect-metadata';
import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import * as dotenv from 'dotenv';
import {ObjectId} from 'mongodb';

import {MongoDatabase} from '#root/shared/database/providers/mongo/MongoDatabase.js';
import {NotificationRepository} from '#root/shared/database/providers/mongo/repositories/NotificationRepository.js';

dotenv.config({
  path: '.env.test',
});

const DB_URL = process.env.DB_URL!;
const DB_NAME = process.env.DB_NAME!;

const TS = Date.now();

let db: MongoDatabase;
let repo: NotificationRepository;

const USER_ID = new ObjectId().toString();
const ENTITY_ID = new ObjectId().toString();

let notificationId1: string;
let notificationId2: string;

beforeAll(async () => {
  db = new MongoDatabase(DB_URL, DB_NAME);
  await db.init();

  repo = new NotificationRepository(db as any);

  const users = await db.getCollection('users');
  const notifications = await db.getCollection('notifications');
  const subscriptions = await db.getCollection('subscriptions');

  await notifications.deleteMany({
    title: {$regex: '^integration-notification-', $options: 'i'},
  });

  await subscriptions.deleteMany({
    userId: new ObjectId(USER_ID),
  });

  await users.deleteOne({
    _id: new ObjectId(USER_ID),
  });

  await users.insertOne({
    _id: new ObjectId(USER_ID),
    firstName: 'Integration',
    lastName: 'User',
    email: `integration-${TS}@test.com`,
    role: 'expert',
    status: 'active',
    firebaseUID: `firebase-${TS}`,
    isBlocked: false,
    notificationRetention: '3d',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}, 30000);

afterAll(async () => {
  const users = await db.getCollection('users');
  const notifications = await db.getCollection('notifications');
  const subscriptions = await db.getCollection('subscriptions');

  await notifications.deleteMany({
    userId: new ObjectId(USER_ID),
  });

  await subscriptions.deleteMany({
    userId: new ObjectId(USER_ID),
  });

  await users.deleteOne({
    _id: new ObjectId(USER_ID),
  });

  await db.disconnect();
}, 30000);

describe('NotificationRepository integration', () => {
  it('addNotification - creates notification', async () => {
    const result = await repo.addNotification(
      USER_ID,
      ENTITY_ID,
      'question',
      'integration notification message',
      `integration-notification-${TS}`,
    );

    expect(result.insertedId).toBeDefined();

    notificationId1 = result.insertedId;
  });

  it('addNotification - creates second notification', async () => {
    const result = await repo.addNotification(
      USER_ID,
      ENTITY_ID,
      'answer',
      'integration notification message 2',
      `integration-notification-2-${TS}`,
    );

    expect(result.insertedId).toBeDefined();

    notificationId2 = result.insertedId;
  });

  it('getNotifications - returns notifications', async () => {
    const result = await repo.getNotifications(USER_ID, 1, 10);

    expect(result.notifications.length).toBeGreaterThanOrEqual(2);
    expect(result.totalCount).toBeGreaterThanOrEqual(2);
    expect(result.page).toBe(1);
  });

  it('getNotifications - supports pagination', async () => {
    const result = await repo.getNotifications(USER_ID, 1, 1);

    expect(result.notifications.length).toBe(1);
  });

  it('getNotificationsCount - returns unread count', async () => {
    const count = await repo.getNotificationsCount(USER_ID);

    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('markAsRead - marks single notification', async () => {
    const result = await repo.markAsRead(notificationId1);

    expect(result.modifiedCount).toBe(1);
  });

  it('markAllAsRead - marks all notifications', async () => {
    const result = await repo.markAllAsRead(USER_ID);

    expect(result.modifiedCount).toBeGreaterThanOrEqual(1);
  });

  it('getNotificationsCount - returns zero after markAllAsRead', async () => {
    const count = await repo.getNotificationsCount(USER_ID);

    expect(count).toBe(0);
  });

  it('deleteNotification - deletes notification', async () => {
    const result = await repo.deleteNotification(
      notificationId2,
      undefined as any,
    );

    expect(result.deletedCount).toBe(1);
  });

  it('saveSubscription - inserts subscription', async () => {
    await repo.saveSubscription(USER_ID, {
      endpoint: `endpoint-${TS}`,
      expirationTime: Date.now() + 86400000,
    });

    const sub = await repo.getSubscriptionByUserId(USER_ID);

    expect(sub).not.toBeNull();
    expect(sub?.subscription.endpoint).toBe(`endpoint-${TS}`);
  });

  it('saveSubscription - updates existing subscription', async () => {
    await repo.saveSubscription(USER_ID, {
      endpoint: `endpoint-updated-${TS}`,
      expirationTime: Date.now() + 86400000,
    });

    const sub = await repo.getSubscriptionByUserId(USER_ID);

    expect(sub?.subscription.endpoint).toBe(`endpoint-updated-${TS}`);
  });

  it('deleteExpiredSubscriptionForUser - deletes by endpoint', async () => {
    const result = await repo.deleteExpiredSubscriptionForUser(
      `endpoint-updated-${TS}`,
    );

    expect(result.deletedCount).toBe(1);
  });

  it('getSubscriptionByUserId - returns null after delete', async () => {
    const sub = await repo.getSubscriptionByUserId(USER_ID);

    expect(sub).toBeNull();
  });

  it('deleteExpiredSubscriptions - removes expired subscriptions', async () => {
    const subscriptions = await db.getCollection('subscriptions');

    await subscriptions.insertOne({
      userId: new ObjectId(USER_ID),
      subscription: {
        endpoint: `expired-${TS}`,
      },
      expirytime: new Date(Date.now() - 86400000),
    });

    const result = await repo.deleteExpiredSubscriptions();

    expect(result.deletedCount).toBeGreaterThanOrEqual(1);
  });

  it('autoDeleteNotifications - removes old notifications', async () => {
    const notifications = await db.getCollection('notifications');

    await notifications.insertOne({
      userId: new ObjectId(USER_ID),
      enitity_id: new ObjectId(),
      type: 'question',
      title: `integration-notification-old-${TS}`,
      message: 'old',
      is_read: false,
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
    });

    await repo.autoDeleteNotifications();

    const oldNotification = await notifications.findOne({
      title: `integration-notification-old-${TS}`,
    });

    expect(oldNotification).toBeNull();
  });

  it('addNotification - throws for invalid userId', async () => {
    await expect(
      repo.addNotification(
        'invalid-id',
        ENTITY_ID,
        'question',
        'message',
        'title',
      ),
    ).rejects.toThrow();
  });

  it('getNotifications - throws for invalid userId', async () => {
    await expect(repo.getNotifications('invalid-id', 1, 10)).rejects.toThrow();
  });

  it('markAsRead - throws for invalid notification id', async () => {
    await expect(repo.markAsRead('invalid-id')).rejects.toThrow();
  });

  it('deleteNotification - throws for invalid notification id', async () => {
    await expect(
      repo.deleteNotification('invalid-id', undefined as any),
    ).rejects.toThrow();
  });
});
