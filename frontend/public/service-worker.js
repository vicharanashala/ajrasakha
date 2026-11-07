self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body,
    icon: './logo.png',
    // Was hardcoded to '/notifications' (a disabled placeholder page) regardless of what the
    // backend sent — every push notification's click landed there no matter its actual target.
    // Use the per-notification url the backend now sends, falling back only if it's missing.
    data: { url: data.url || '/notifications' },
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title, options),
      // Tell every open tab a notification just arrived, so the bell/sidebar can refetch right
      // away instead of waiting for a tab switch/focus or reload. This push event is the only
      // reliable signal a RECIPIENT's browser has that something changed server-side (the queue's
      // own SSE "upload"/"document" events fire too early — before the notification row the
      // recipient cares about even exists, see NotificationService.notifyPopEvent's call order).
      // Deliberately NOT touching install/activate here — an earlier attempt paired this with
      // skipWaiting()/clients.claim() and click-navigate stopped working; isolating this change to
      // just the push handler to find out whether that lifecycle change was the actual culprit.
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) client.postMessage({ type: 'new-notification' });
      }),
    ])
  );
});

// Handle click on notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data.url;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Reuse an already-open same-origin tab (navigating it to the target) instead of always
      // opening a new window — but only ever focus/reuse one, never match on a fixed path.
      for (const client of clientList) {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === self.location.origin && 'focus' in client) {
          return client.focus().then(() => ('navigate' in client ? client.navigate(url) : undefined));
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
