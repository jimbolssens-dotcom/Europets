-- Migration 113: hospitalizations.portal_link_shared_at
--
-- Tracks whether staff have ever actually sent the client portal link for
-- this case (via Share/Copy, or the new one-click prompt shown once a
-- consent form comes back signed) — never cleared, since the only thing
-- that matters is "has this ever been sent," so the one-click prompt on
-- the hospitalization page stops showing once it has. See
-- app/api/hospitalizations/[id]/route.js (portal_link_shared) and
-- app/(admin)/hospitalization/[id]/page.jsx.

alter table hospitalizations add column if not exists portal_link_shared_at timestamptz;
