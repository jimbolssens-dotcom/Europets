// lib/pushNotifications.js
// Sends a real Web Push notification to every device a client has opted
// into notifications from (public/client-app-sw.js handles it on the
// receiving end — see that file for the actual notification that shows
// up). This is genuinely push: it reaches a device even if the client
// app isn't open, the same as a native app's notifications, which is the
// whole point over the client app's existing poll-when-open updates.
//
// Inert until VAPID_PRIVATE_KEY/NEXT_PUBLIC_VAPID_PUBLIC_KEY are set —
// same "quietly does nothing until configured" pattern as
// lib/email.js, so calling this from a new trigger is always safe even
// before the clinic's finished setting it up.
//
// Callers pass a clientId, not a specific subscription — a client may
// have this installed on more than one device (a phone and a desktop),
// and every one of them should hear about it.

import webpush from 'web-push';
import { supabaseAdmin } from './supabaseAdmin';

let vapidConfigured = false;

function ensureVapidConfigured() {
  if (vapidConfigured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:info@epc.vet',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  vapidConfigured = true;
}

// { title, body, url } — url is where notificationclick (see the service
// worker) sends the client once they tap it, relative to the site root
// (e.g. '/client-app/messages'); defaults to the app's home screen.
export async function sendPushToClient(clientId, { title, body, url = '/client-app' }) {
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  ensureVapidConfigured();

  const { data: subs, error } = await supabaseAdmin
    .from('client_push_subscriptions')
    .select('*')
    .eq('client_id', clientId);
  if (error || !subs?.length) return;

  const payload = JSON.stringify({ title, body, url });

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
      } catch (err) {
        // 404/410 means the browser itself revoked or expired this
        // subscription (uninstalled, cleared site data, ...) — stop
        // trying it going forward rather than erroring on every future
        // send. Anything else (a transient network hiccup) is just
        // logged; that device simply misses this one notification.
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabaseAdmin.from('client_push_subscriptions').delete().eq('id', sub.id);
        } else {
          console.error('Failed to send push notification', clientId, sub.id, err.message);
        }
      }
    })
  );
}
