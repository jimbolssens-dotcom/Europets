-- Migration 186: remember why the WhatsApp AI concierge handed a thread to staff
--
-- The concierge's reason for escalating (its escalate_to_staff note, or
-- "staff already in this thread") only went to the server log, so a thread
-- staff found flagged gave no clue why the AI hadn't simply answered (a
-- client tapping "Book Appointment" on a vaccination reminder, 13 Oct).
-- Shown on the thread's Flagged button; cleared when staff ask the AI to
-- answer anyway (POST /api/whatsapp/concierge-answer).
--
-- Safe to run more than once.

alter table client_message_thread_state add column if not exists escalation_reason text;
alter table client_message_thread_state add column if not exists escalated_at timestamptz;
