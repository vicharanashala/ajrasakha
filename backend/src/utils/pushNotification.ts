import 'reflect-metadata';
import webPush from 'web-push';
import {ISubscription} from '#root/shared/index.js';
webPush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL}`,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);
type PushNotificationPayload = {
  title: string;
  body: string;
  url: string;
  source?: string;
};
export const sendPushNotification = async (
  subscription: any,
  // payload: {title: string; body: string; url: string},
  payload: PushNotificationPayload,
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
  source: string = 'DEFAULT',
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
    url: '/notifications',
    source,
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

  await sendPushNotification(subscription.subscription, payload,onExpire);
};
