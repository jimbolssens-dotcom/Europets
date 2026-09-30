// app/_components/ClientAppPushOptIn.jsx
// A small "turn on notifications" card for the client app home page —
// only worth showing to a client whose browser can actually receive Web
// Push (installed as an app on Android/desktop, or "Add to Home Screen"
// on iOS 16.4+ — a plain browser tab on iOS Safari can't, see
// pushSupported below) and who hasn't already turned it on.
//
// Registers public/client-app-sw.js, subscribes via the browser's own
// PushManager using the clinic's public VAPID key, and hands the
// resulting subscription to the server (POST /api/client-app/push/
// subscribe) — see lib/pushNotifications.js for the sending side once
// this exists.

'use client';

import { useEffect, useState } from 'react';

// The Push API wants the VAPID public key as a raw Uint8Array, not the
// base64url string it's generated/stored as — this is the standard
// conversion (padding restored, base64url -> base64, then decoded).
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
}

export default function ClientAppPushOptIn() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!pushSupported()) {
      setSupported(false);
      setChecking(false);
      return;
    }
    setSupported(true);
    navigator.serviceWorker
      .register('/client-app-sw.js', { scope: '/client-app' })
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(Boolean(sub)))
      .catch(() => setSubscribed(false))
      .finally(() => setChecking(false));
  }, []);

  async function enable() {
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
      setError('Notifications are not set up yet — check back later.');
      return;
    }
    setWorking(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setError('Notifications were blocked — you can turn them on again from your browser settings.');
        setWorking(false);
        return;
      }
      const reg = await navigator.serviceWorker.register('/client-app-sw.js', { scope: '/client-app' });
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
      });
      const res = await fetch('/api/client-app/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error('Could not save your notification settings — please try again.');
      setSubscribed(true);
    } catch (err) {
      setError(err.message || 'Something went wrong turning on notifications.');
    } finally {
      setWorking(false);
    }
  }

  async function disable() {
    setWorking(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/client-app');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/client-app/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (err) {
      setError(err.message || 'Something went wrong turning off notifications.');
    } finally {
      setWorking(false);
    }
  }

  if (checking || !supported) return null;

  if (subscribed) {
    return (
      <div className="client-app-push-optin client-app-push-optin-on">
        <p>🔔 Notifications are on.</p>
        <button type="button" className="mobile-link-btn" onClick={disable} disabled={working}>
          {working ? 'Turning off...' : 'Turn off'}
        </button>
        {error && <p className="client-app-login-error">{error}</p>}
      </div>
    );
  }

  if (dismissed) return null;

  return (
    <div className="client-app-push-optin">
      <p>
        🔔 Turn on notifications to hear about new messages and appointment reminders, even when the app
        isn&rsquo;t open.
      </p>
      <div className="client-app-push-optin-actions">
        <button type="button" onClick={enable} disabled={working}>
          {working ? 'Turning on...' : 'Turn on notifications'}
        </button>
        <button type="button" className="mobile-link-btn" onClick={() => setDismissed(true)} disabled={working}>
          Not now
        </button>
      </div>
      {error && <p className="client-app-login-error">{error}</p>}
    </div>
  );
}
