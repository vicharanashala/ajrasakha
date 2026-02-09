import 'reflect-metadata'
import webPush from 'web-push';
import { NotificationRepository } from '#root/shared/database/providers/mongo/repositories/NotificationRepository.js';
import { getFromContainer } from 'routing-controllers';
const notificationRepo = getFromContainer(NotificationRepository)
webPush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL}`,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export const sendPushNotification = async (
  subscription: any,
  payload: { title: string; body: string; url: string }
) => {
  try {
    await webPush.sendNotification(subscription, JSON.stringify(payload));
    console.log('[Push Notification] Sent successfully');
  } catch (err: any) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      console.warn('[Push Notification] Subscription has expired or is no longer valid.');
    } else {
      console.error('Push notification failed', err);
    }
  }
};


export const notifyUser = async (userId: string, message: string,subscription:any) => {
  if (!subscription) return;
  const payload = {
    title: 'Notification',
    body: message,
    url: '/notifications'
  };
  // Check if the subscription is expired before attempting to send
  if (subscription.expirytime && subscription.expirytime < Date.now()) {
    console.warn(`[Push Notification] Subscription for user ${userId} has expired. Skipping.`);
    return;
  }

  await sendPushNotification(subscription.subscription, payload);
};