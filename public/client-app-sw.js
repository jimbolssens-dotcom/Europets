// public/client-app-sw.js
// The client app's Web Push service worker — registered by
// ClientAppPushOptIn.jsx with scope '/client-app'. This is the piece
// that makes a notification actually show up even when the app isn't
// open; everything else (the opt-in button, the subscribe API) just gets
// a subscription onto the server so lib/pushNotifications.js has
// somewhere to send to.
//
// Deliberately its own tiny file rather than folded into any bundler
// output — a service worker has to be a real, directly-fetchable script
// at a fixed URL, so this lives in public/ like the manifests next to it.

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
    icon: '/icons/client-app-icon-192.png',
    badge: '/icons/client-app-icon-192.png',
    data: { url: data.url || '/client-app' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Focuses an already-open app window if one exists (rather than opening a
// second one), landing on whatever page the notification was about —
// same "don't spawn a duplicate tab" courtesy as a native app's own
// notification handling.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/client-app';

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
