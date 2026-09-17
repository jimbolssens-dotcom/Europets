// lib/dailyVideo.js
// Thin wrapper around Daily.co's REST API for creating a video call room —
// see app/api/visits/[id]/video-consult/route.js for where this is called.
// Daily's own hosted "Prebuilt" call UI is just an iframe pointed at the
// room's url (see the video panel on the consult page and
// app/portal/video-consult/[id]/page.jsx) — no client-side video SDK
// needed on either the staff or client side.
//
// Requires DAILY_API_KEY (a Daily.co account's API key, from their
// dashboard) set in the environment — never called at build/import time,
// only from inside a route handler, so its absence doesn't break the build,
// only an actual attempt to start a video consult.

const DAILY_API_BASE = 'https://api.daily.co/v1';

// A room's own unguessable name/url is the whole security model here —
// same as every other client-facing link in this app (portal pages,
// consent-form links) — so it's left as Daily's own privacy: 'public'
// default rather than layering on per-viewer tokens. exp auto-expires the
// room so a room from a call that never happened doesn't linger forever.
export async function createDailyRoom({ name, expiresInSeconds = 60 * 60 * 6 } = {}) {
  const apiKey = process.env.DAILY_API_KEY;
  if (!apiKey) {
    throw new Error('DAILY_API_KEY is not configured — add it to the environment to enable video consults');
  }

  const res = await fetch(`${DAILY_API_BASE}/rooms`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      properties: {
        exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
        eject_at_room_exp: true,
        enable_chat: true,
      },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.info || `Failed to create video room (HTTP ${res.status})`);
  }
  return data; // { name, url, ... }
}
