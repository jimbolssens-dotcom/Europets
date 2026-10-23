-- 224_team_divert.sql
-- Anyone can pass a message on to any team chat group (lib/teamChat.js),
-- whether or not they're in it: a client's message shared from their chat,
-- or a team message diverted from another group. It's posted as from
-- Europets (staff_id null), not the person, on WhatsApp too; shared_by
-- keeps who did it, forwarded_from the message it came from.
-- Safe to run more than once.

alter table team_messages add column if not exists shared_by uuid references staff(id) on delete set null;
alter table team_messages add column if not exists forwarded_from uuid references team_messages(id) on delete set null;
