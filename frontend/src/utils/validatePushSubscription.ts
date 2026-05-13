type PushSubscription = {
  endpoint: string;
  keys?: {
    p256dh: string;
    auth: string;
  };
};
export function isValidPushSubscription(sub:PushSubscription): boolean {
  // 1. Ensure the main object exists and is an object
  if (!sub || typeof sub !== 'object') {
    return false;
  }

  // 2. Validate endpoint (Must be a string and not empty)
  if (typeof sub.endpoint !== 'string' || sub.endpoint.trim() === '') {
    return false;
  }

  // 3. Ensure keys object exists
  if (!sub.keys || typeof sub.keys !== 'object') {
    return false;
  }

  // 4. Validate p256dh key (Must be a string and not empty)
  if (typeof sub.keys.p256dh !== 'string' || sub.keys.p256dh.trim() === '') {
    return false;
  }

  // 5. Validate auth key (Must be a string and not empty)
  if (typeof sub.keys.auth !== 'string' || sub.keys.auth.trim() === '') {
    return false;
  }

  return true;
}