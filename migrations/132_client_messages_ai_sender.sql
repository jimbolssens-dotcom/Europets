-- Migration 132: 'ai' as a third client_messages sender
--
-- The WhatsApp AI concierge (lib/whatsappConcierge.js) drafts and sends a
-- reply itself for the narrow set of things it's allowed to fully
-- automate (clinic FAQs, booking a routine consult for a pet already on
-- the client's file). Those replies need their own sender value so the
-- inbox can label them distinctly from a staff-typed reply, and so the
-- "pending" flag (a client message that hasn't been answered yet — see
-- app/api/client-messages) still correctly counts an AI reply as
-- answered, the same way it already does a staff one.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

alter table client_messages drop constraint if exists client_messages_sender_check;
alter table client_messages add constraint client_messages_sender_check check (sender in ('client', 'staff', 'ai'));
