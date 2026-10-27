-- Migration 232: inviting clients to the client app over WhatsApp
-- (lib/appInvite.js, app/api/whatsapp/app-invite-sweep). A client who
-- writes to us and has never opened the app gets one invite once the
-- conversation has gone quiet, again after 60 days if they still haven't,
-- and at most three times in all.
--
-- app_invited_at     when the last invite went out
-- app_invite_count   how many have gone out

alter table clients add column if not exists app_invited_at timestamptz;
alter table clients add column if not exists app_invite_count integer not null default 0;
