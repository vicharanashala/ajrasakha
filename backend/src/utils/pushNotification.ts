import 'reflect-metadata'
import webPush from 'web-push';
import { ISubscription } from '#root/shared/index.js';
import { CORE_TYPES, NotificationService } from '#root/modules/core/index.js';
import { getContainer } from '#root/bootstrap/loadModules.js';
webPush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL}`,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export const sendPushNotification = async (
  subscription: any,
  payload: { title: string; body: string; url: string }
) => {
  const container=getContainer();
  const notificationService = container.get<NotificationService>(CORE_TYPES.NotificationService)
  try {
    await webPush.sendNotification(subscription, JSON.stringify(payload));
    console.log('[Push Notification] Sent successfully');
  } catch (err: any) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      await notificationService.deleteExpiredSubscriptionForUser(subscription.endpoint);
      console.warn('[Push Notification] Subscription has expired or is no longer valid.');
    } else {
      console.error('Push notification failed', err);
    }
  }
};


export const notifyUser = async (userId: string, message: string,subscription:ISubscription) => {
  if (!subscription) return;
  const payload = {
    title: 'Annam.AI',
    body: message,
    url: '/notifications'
  };
  const container=getContainer();
  const notificationService = container.get<NotificationService>(CORE_TYPES.NotificationService)
  // Check if the subscription is expired before attempting to send
  if (subscription.expirytime && subscription.expirytime < new Date()) {
    // delete the expired subscribtions
    await notificationService.deleteExpiredSubscriptionForUser(subscription.subscription.endpoint);
    console.warn(`[Push Notification] Subscription for user ${userId} has expired. Skipping.`);
    return;
  }

  await sendPushNotification(subscription.subscription, payload);
};