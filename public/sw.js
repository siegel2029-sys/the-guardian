/* Physio-Shield: Web Push → system notification (works when the app is in the background or closed). */
self.addEventListener('push', (event) => {
  let title = 'Physio-Shield';
  let body = '';
  let tag = 'physioshield';
  /** @type {Record<string, unknown>} */
  let notifData = {};
  try {
    if (event.data) {
      const j = event.data.json();
      if (j && typeof j.title === 'string') title = j.title;
      if (j && typeof j.body === 'string') body = j.body;
      if (j && typeof j.tag === 'string') tag = j.tag;
      if (j && typeof j.data === 'object' && j.data !== null && !Array.isArray(j.data)) {
        notifData = j.data;
      }
    }
  } catch {
    try {
      body = event.data ? event.data.text() : '';
    } catch {
      /* ignore */
    }
  }
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/vite.svg',
      lang: 'he',
      dir: 'rtl',
      tag,
      renotify: true,
      data: notifData,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const raw = event.notification.data;
  const url =
    raw && typeof raw === 'object' && raw !== null && typeof raw.url === 'string'
      ? raw.url
      : '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const c of clientList) {
        if ('focus' in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
