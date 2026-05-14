/* Physio-Shield: minimal push + notification support for Web Push (VAPID). */
self.addEventListener('push', (event) => {
  let title = 'Physio-Shield';
  let body = '';
  try {
    if (event.data) {
      const j = event.data.json();
      if (j && typeof j.title === 'string') title = j.title;
      if (j && typeof j.body === 'string') body = j.body;
    }
  } catch {
    try {
      body = event.data ? event.data.text() : '';
    } catch {
      /* ignore */
    }
  }
  event.waitUntil(self.registration.showNotification(title, { body, icon: '/vite.svg' }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const c of clientList) {
        if ('focus' in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
