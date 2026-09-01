-- Migration 016: track which number an intake link was actually sent to,
-- so the "Sent, Awaiting Submission" list shows who staff is still
-- waiting on instead of just a bare, unlabeled link.
-- Run this in your Supabase SQL editor if your database predates this
-- migration (new installs get it automatically from schema.sql).

alter table intake_requests add column sent_to_phone text;
