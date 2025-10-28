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
    console.log('send push called')
    await webPush.sendNotification(subscription, JSON.stringify(payload));
  } catch (err) {
    console.error('Push notification failed', err);
  }
};


export const notifyUser = async (userId: string, message: string,subscription:any) => {
  if (!subscription) return;
  console.log('sub from otify ',subscription)
  const payload = {
    title: 'Notification',
    body: message,
    url: '/notifications'
  };
  await sendPushNotification(subscription.subscription, payload);
};