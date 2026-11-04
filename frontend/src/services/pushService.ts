import { apiFetch } from "@/hooks/api/api-fetch";
import { urlBase64ToUint8Array } from "@/utils/vapid";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
// `userId` scopes the "already synced" check below — the browser's push subscription endpoint
// is tied to this DEVICE/BROWSER PROFILE, not to whichever backend account is currently logged
// in. Several accounts tested in the same browser (common in staging) all share one endpoint, so
// a single global "push_endpoint" key meant only the FIRST account to ever call this actually got
// its subscription saved server-side — every other account that later logged in in the same
// browser saw the endpoint already match that stale key and skipped saving entirely, leaving the
// backend's subscription record pointing at someone else's userId (so notifyUser found nothing
// to push to for them, even though their in-app/sidebar notifications still worked fine). Keying
// by userId makes each account re-associate the (shared) endpoint with itself on first login.
export const initializeNotifications = async (userId?: string) => {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  if (!userId) return;

  try {
    const registration =
      await navigator.serviceWorker.register("/service-worker.js");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;
    const existingSubscription =
      await registration.pushManager.getSubscription();
    const newKey = urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY);
    const syncedKey = `push_endpoint_${userId}`;

    // ✅ If subscription exists, check if the keys match
    if (existingSubscription) {
      const existingKey = existingSubscription.options.applicationServerKey;

      // Check if it's expiring soon (e.g., within 24 hours)
      const EXPIRY_THRESHOLD = 24 * 60 * 60 * 1000;
      const isExpiringSoon =
        existingSubscription.expirationTime &&
        existingSubscription.expirationTime - Date.now() < EXPIRY_THRESHOLD;

      if (
        (existingKey && !arraysEqual(new Uint8Array(existingKey), newKey)) ||
        isExpiringSoon
      ) {
        console.log(
          "Subscription is outdated or expiring soon. Unsubscribing...",
        );
        await existingSubscription.unsubscribe();
      } else {
        const lastSyncedEndpoint = localStorage.getItem(syncedKey);

        if (lastSyncedEndpoint === existingSubscription.endpoint) {
          console.log("Subscription already synced");
          return;
        }

        await saveSubscription(existingSubscription);

        localStorage.setItem(syncedKey, existingSubscription.endpoint);

        return;
      }
    }

    // Create a new subscription
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: newKey,
    });

    await saveSubscription(subscription);
    localStorage.setItem(syncedKey, subscription.endpoint);
  } catch (err) {
    console.error("Error initializing notifications:", err);
  }
};

function arraysEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

async function saveSubscription(subscription: PushSubscription) {
  await apiFetch<void>(`${API_BASE_URL}/notifications/subscriptions`, {
    method: "POST",
    body: JSON.stringify({ subscription }),
  });
}
