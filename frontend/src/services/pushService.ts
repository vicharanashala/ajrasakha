import { apiFetch } from '@/hooks/api/api-fetch';
import { urlBase64ToUint8Array } from '@/utils/vapid';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
export const initializeNotifications = async () => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  try {
    const registration = await navigator.serviceWorker.register('/service-worker.js');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;
    const existingSubscription = await registration.pushManager.getSubscription();
    const newKey = urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY);

    // ✅ If subscription exists, check if the keys match
    if (existingSubscription) {
      const existingKey = existingSubscription.options.applicationServerKey;

      // Check if it's expiring soon (e.g., within 24 hours)
      const EXPIRY_THRESHOLD = 24 * 60 * 60 * 1000; 
      const isExpiringSoon = existingSubscription.expirationTime &&
        (existingSubscription.expirationTime - Date.now() < EXPIRY_THRESHOLD);

      if (
        (existingKey && !arraysEqual(new Uint8Array(existingKey), newKey)) ||
        isExpiringSoon
      ) {
        // console.log('Subscription is outdated or expiring soon. Unsubscribing...');
        await existingSubscription.unsubscribe();
      } else {
        // console.log('Reusing existing push subscription.');
        await saveSubscription(existingSubscription);
        return;
      }
    }

    // Create a new subscription
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: newKey,
    });

    await saveSubscription(subscription);
  } catch (err) {
    console.error('Error initializing notifications:', err);
  }
};

function arraysEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

async function saveSubscription(subscription: PushSubscription) {
  await apiFetch<void>(`${API_BASE_URL}/notifications/subscriptions`, {
    method: 'POST',
    body: JSON.stringify({ subscription }),
  });
}
