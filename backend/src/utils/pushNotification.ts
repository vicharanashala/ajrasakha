import 'reflect-metadata';
import webPush from 'web-push';
import {ISubscription} from '#root/shared/index.js';
// import { CORE_TYPES, NotificationService } from '#root/modules/core/index.js';
// import { getContainer } from '#root/bootstrap/loadModules.js';
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL || 'admin@ajrasakha.org'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
} else {
  console.warn('[Push Notification] VAPID keys not configured in environment. Push notifications disabled.');
}

export const sendPushNotification = async (
  subscription: any,
  payload: {title: string; body: string; url: string},
  onExpire?: (endpoint: string) => Promise<void>,
) => {
  // const container = getContainer();
  // const notificationService = container.get<NotificationService>(CORE_TYPES.NotificationService)
  try {
    await webPush.sendNotification(subscription, JSON.stringify(payload));
    console.log('[Push Notification] Sent successfully');
  } catch (err: any) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      if (onExpire) {
        await onExpire(subscription.endpoint);
      }
      // await notificationService.deleteExpiredSubscriptionForUser(subscription.endpoint);
      console.warn(
        '[Push Notification] Subscription has expired or is no longer valid.',
      );
    } else {
      console.error('Push notification failed', err);
    }
  }
};

export const notifyUser = async (
  userId: string,
  message: string,
  subscription: ISubscription | null,
  onExpire?: (endpoint: string) => Promise<void>,
  title = 'Annam.AI',
  url = '/notifications',
) => {
  if (!subscription) {
    console.warn(`No subscription found for user ${userId}`);
    return;
  }
  const payload = {
    title,
    body: message,
    url,
  };
  // const container = getContainer();
  // const notificationService = container.get<NotificationService>(CORE_TYPES.NotificationService)
  // Check if the subscription is expired before attempting to send
  if (subscription.expirytime && subscription.expirytime < new Date()) {
    // delete the expired subscribtions
    if (onExpire) {
      await onExpire(subscription.subscription.endpoint);
    }
    // await notificationService.deleteExpiredSubscriptionForUser(subscription.subscription.endpoint);
    console.warn(
      `[Push Notification] Subscription for user ${userId} has expired. Skipping.`,
    );
    return;
  }

  await sendPushNotification(subscription.subscription, payload, onExpire);
};
