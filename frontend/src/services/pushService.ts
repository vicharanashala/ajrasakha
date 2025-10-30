import { apiFetch } from '@/hooks/api/api-fetch';
import { urlBase64ToUint8Array } from '@/utils/vapid';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
export const initializeNotifications = async () => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  try {
    console.log('reached initalisation')
    const registration = await navigator.serviceWorker.register('/service-worker.js');
    console.log('registration ',registration)
    const permission = await Notification.requestPermission();
    console.log("permisson ",permission)
    if (permission !== 'granted') return;

    // const subscription = await registration.pushManager.subscribe({
    //   userVisibleOnly: true,
    //   applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY),
    // });
    // console.log('after settimg n',subscription)

    // // await apiFetch(`${API_URL}/notifications/subscriptions`, { userId, subscription });
    // await apiFetch<void>(
    //     `${API_BASE_URL}/notifications/subscriptions`,
    //     {
    //       method: "POST",
    //       body: JSON.stringify({ subscription}),
    //     }
    //   )
    // console.log('Push subscription saved automatically!');


    const existingSubscription = await registration.pushManager.getSubscription();
    const newKey = urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY);

    // ✅ If subscription exists, check if the keys match
    if (existingSubscription) {
      const existingKey = existingSubscription.options.applicationServerKey;
      if (
        existingKey &&
        !arraysEqual(new Uint8Array(existingKey), newKey)
      ) {
        console.log('Different VAPID key detected. Unsubscribing old subscription...');
        await existingSubscription.unsubscribe();
      } else {
        console.log('Reusing existing push subscription.');
        await saveSubscription(existingSubscription);
        return;
      }
    }

    // ✅ Create a new subscription
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: newKey,
    });
    console.log('New push subscription created:', subscription);

    await saveSubscription(subscription);
    console.log('Push subscription saved successfully!');
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
//   } catch (err) {
//     console.error('Error initializing notifications:', err);
//   }
// };
