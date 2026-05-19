/* Physio-Shield: Web Push → system notification (background / closed app). */
/** @type {string} Valid asset under public/ — do not use /vite.svg (not shipped). */
const DEFAULT_ICON = '/favicon.svg';
const DEFAULT_MESSAGES_URL = '/patient-portal/messages';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  const show = (async () => {
    let title = 'Physio-Shield';
    let body = 'יש לך הודעה חדשה';
    let tag = 'physioshield';
    /** @type {Record<string, unknown>} */
    let notifData = { url: DEFAULT_MESSAGES_URL };

    try {
      if (event.data) {
        const j = event.data.json();
        if (j && typeof j.title === 'string' && j.title.trim()) title = j.title.trim();
        if (j && typeof j.body === 'string' && j.body.trim()) body = j.body.trim();
        if (j && typeof j.tag === 'string' && j.tag.trim()) tag = j.tag.trim();
        if (j && typeof j.data === 'object' && j.data !== null && !Array.isArray(j.data)) {
          notifData = { ...notifData, ...j.data };
        }
      }
    } catch (parseErr) {
      console.warn('[Physio-Shield sw] push JSON parse failed, using text fallback', parseErr);
      try {
        const t = event.data ? await event.data.text() : '';
        if (t) {
          try {
            const j = JSON.parse(t);
            if (typeof j.body === 'string' && j.body.trim()) body = j.body.trim();
            if (typeof j.title === 'string' && j.title.trim()) title = j.title.trim();
            if (typeof j.tag === 'string' && j.tag.trim()) tag = j.tag.trim();
            if (j.data && typeof j.data === 'object' && !Array.isArray(j.data)) {
              notifData = { ...notifData, ...j.data };
            }
          } catch {
            body = t;
          }
        }
      } catch {
        /* keep defaults */
      }
    }

    await self.registration.showNotification(title, {
      body,
      icon: DEFAULT_ICON,
      badge: DEFAULT_ICON,
      lang: 'he',
      dir: 'rtl',
      tag,
      renotify: true,
      requireInteraction: false,
      data: notifData,
    });
  })();

  event.waitUntil(
    show.catch((err) => {
      console.error('[Physio-Shield sw] showNotification failed', err);
      return self.registration.showNotification('Physio-Shield', {
        body: 'הודעה חדשה',
        icon: DEFAULT_ICON,
        badge: DEFAULT_ICON,
        lang: 'he',
        dir: 'rtl',
        tag: 'physioshield-fallback',
        data: { url: DEFAULT_MESSAGES_URL },
      });
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const raw = event.notification.data;
  const url =
    raw && typeof raw === 'object' && raw !== null && typeof raw.url === 'string' && raw.url.trim()
      ? raw.url.trim()
      : DEFAULT_MESSAGES_URL;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          const focused = client.focus();
          if ('navigate' in client && typeof client.navigate === 'function') {
            return focused.then(() => client.navigate(url));
          }
          return focused;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    }),
  );
});
