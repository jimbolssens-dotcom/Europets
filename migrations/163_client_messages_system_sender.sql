-- Migration 163: 'system' as a fourth client_messages sender
--
-- Root cause of a real incident: the WhatsApp AI concierge refuses to act
-- in a thread whenever the message right before the client's own is
-- sender: 'staff' (lib/whatsappConcierge.js's priorRow check) — it reads
-- that as "a human colleague already jumped into this conversation, don't
-- talk over them." But every automated outbound notice this app sends
-- (vaccination reminders, appointment reminders, discharge follow-ups,
-- consent-form requests, intake invite links, hospitalization portal
-- links) was ALSO being logged with sender: 'staff', purely for display —
-- no human ever typed them. A client replying to one of those (e.g.
-- tapping "Book Appointment" on a vaccination reminder) tripped the same
-- "staff already engaged" handoff the concierge uses to avoid interrupting
-- a real person — so it silently stood down and flagged the thread for a
-- human to finish, even though no human had touched it yet.
--
-- This adds 'system' as its own sender value, and the six automated-send
-- call sites (see lib/vaccinationReminders.js, lib/dischargeFollowups.js,
-- lib/hospitalizationPortalLink.js, lib/consentForms.js,
-- lib/intakeInviteLink.js, app/api/appointments/[id]/send-reminder) now
-- use it instead of 'staff' — which a genuine human-typed reply (the
-- Messages inbox's own reply box, requiring staff_id) still is. No code
-- change was needed in the concierge's own priorRow check: it already
-- only treats an exact 'staff' value as a handoff, so an automated notice
-- tagged 'system' simply stops triggering it.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table client_messages drop constraint if exists client_messages_sender_check;
alter table client_messages add constraint client_messages_sender_check check (sender in ('client', 'staff', 'ai', 'system'));
