-- Records the last time a client actually used the client-facing account
-- app (app/client-app/*), so staff can tell whether to send something like
-- a consent form to the app (where the client will see it automatically)
-- or fall back to WhatsApp. Set by POST /api/clients/:id/app-seen, pinged
-- once per client-app page load from useClientAppSession.
alter table clients
  add column if not exists client_app_last_seen_at timestamptz;
