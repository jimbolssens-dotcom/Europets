-- Migration 060: plain (non-AI) voice note per invoice line item.
--
-- A fallback for when a treatment item's dosage/frequency/duration
-- instructions weren't dictated or entered during the consult — lets
-- staff record a quick audio note straight on the dispensing-label form
-- instead. Just a Storage path, no transcription/summary pipeline.

alter table invoice_line_items add column voice_note_path text;
