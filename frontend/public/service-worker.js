self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json(); 
  const options = {
    body: data.body,               
    icon: './logo.png',      
    data: { url: '/notifications' },  
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
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
