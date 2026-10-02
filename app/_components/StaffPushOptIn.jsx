// app/_components/StaffPushOptIn.jsx
// A small "turn on notifications" card for the mobile staff home page —
// same idea and shape as ClientAppPushOptIn.jsx, just for staff: lets
// whoever is currently picked on this phone (see useMobileStaff) opt into
// real Web Push, so being assigned a conversation (see
// app/api/client-messages/thread-state) reaches their phone even with the
// app closed, instead of only being visible next time they happen to open
// Messages.
//
// Registers public/staff-push-sw.js, subscribes via the browser's own
// PushManager using the clinic's public VAPID key, and hands the
// resulting subscription to the server (POST /api/staff/push/subscribe)
// tagged with staffId — see lib/pushNotifications.js's sendPushToStaff
// for the sending side.

'use client';

import { useEffect, useState } from 'react';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
}

export default function StaffPushOptIn({ staffId }) {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!pushSupported()) {
      setSupported(false);
      setChecking(false);
      return;
    }
    setSupported(true);
    navigator.serviceWorker
      .register('/staff-push-sw.js', { scope: '/mobile' })
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
        setError('Notifications were blocked — you can turn them on again from your phone settings.');
        setWorking(false);
        return;
      }
      const reg = await navigator.serviceWorker.register('/staff-push-sw.js', { scope: '/mobile' });
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
      });
      const res = await fetch('/api/staff/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_id: staffId, ...sub.toJSON() }),
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
      const reg = await navigator.serviceWorker.getRegistration('/mobile');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/staff/push/unsubscribe', {
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

  if (checking || !supported || !staffId) return null;

  return (
    <div className="client-app-push-optin">
      {subscribed ? (
        <>
          <p>🔔 Notifications are on for this phone.</p>
          <button type="button" className="mobile-link-btn" onClick={disable} disabled={working}>
            {working ? 'Turning off...' : 'Turn off'}
          </button>
        </>
      ) : (
        <>
          <p>🔔 Turn on notifications to hear about conversations assigned to you, even when the app isn&rsquo;t open.</p>
          <button type="button" onClick={enable} disabled={working}>
            {working ? 'Turning on...' : 'Turn on notifications'}
          </button>
        </>
      )}
      {error && <p className="client-app-login-error">{error}</p>}
    </div>
  );
}
