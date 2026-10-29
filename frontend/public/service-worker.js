self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json(); 
  const options = {
    body: data.body,               
    icon: './logo.png',      
    data: { url: '/notifications' },  
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title, options),
      // Tell every open tab a notification just arrived, so the bell/sidebar can refetch right
      // away instead of waiting for a tab switch/focus or reload.
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) client.postMessage({ type: 'new-notification' });
      }),
    ])
  );
});

// Handle click on notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      const url = event.notification.data.url;

      for (const client of clientList) {
        const clientUrl = new URL(client.url);
        if (clientUrl.pathname === '/notifications' && 'focus' in client) {
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
