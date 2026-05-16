self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json(); 
  const options = {
    body: data.body,               
    icon: './logo.png',      
    // data: { url: '/notifications' }, 
    data: {
      url: data.url || '/notifications',
      source: data.source || 'DEFAULT',
    }, 
  };

  event.waitUntil(
    // self.registration.showNotification(data.title, options)
     Promise.all([
      self.registration.showNotification(
        data.title,
        options,
      ),

      clients
        .matchAll({
          type: 'window',
          includeUncontrolled: true,
        })
        .then((clientList) => {
          clientList.forEach((client) => {
            client.postMessage({
              type: 'PLAY_NOTIFICATION_SOUND',
              source: data.source || 'DEFAULT',
            });
          });
        }),
    ]),
  );
});

// Handle click on notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

   const url = event.notification.data.url;

    event.waitUntil(
      clients
        .matchAll({
          type: 'window',
          includeUncontrolled: true,
        })
        .then((clientList) => {
          for (const client of clientList) {
            if ('focus' in client) {
              client.focus();

              client.postMessage({
                type: 'NOTIFICATION_CLICKED',
                url,
              });

              return;
            }
          }

          if (clients.openWindow) {
            return clients.openWindow(url);
          }
        }),
    );
});
