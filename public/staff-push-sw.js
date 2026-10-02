// public/staff-push-sw.js
// The staff app's Web Push service worker — registered by
// StaffPushOptIn.jsx with scope '/mobile'. Same shape as
// client-app-sw.js, just a different default icon/url (there's no staff
// equivalent of the client-app's own icon set, so this reuses the plain
// app icon used elsewhere under /mobile).

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Europets Clinic';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/mobile/messages' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Same "focus an already-open window instead of opening a duplicate"
// courtesy as client-app-sw.js.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/mobile/messages';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    })
  );
});
