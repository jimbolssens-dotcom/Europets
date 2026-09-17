-- Migration 114: consolidating an admission and a day procedure onto one invoice
--
-- A day procedure booked off an open admission gets its own, separate
-- invoice by default (see migration 090) — but sometimes staff want the
-- two collected as one bill instead. Rather than a one-time copy of line
-- items (which the next automatic invoice sync would just re-create on the
-- old invoice, silently undoing it), a merge is permanent: the merged-in
-- hospitalization's billing is redirected to the other one's invoice going
-- forward, and every future sync knows to gather both records' worksheets
-- into that one shared invoice.
--
-- hospitalizations.invoice_merged_with: set on the record being merged AWAY
-- from its own invoice, pointing at the hospitalization whose invoice its
-- billing now lives on. One hop only — a merge target must not itself
-- already be merged elsewhere (enforced in the API, not the database).
--
-- invoice_line_items.section_label: set only on a line that came from a
-- MERGED-IN record (e.g. "Day Procedure — 17 Sep 2026") so the invoice can
-- show it under its own heading instead of blending into the primary
-- record's own charges. Null for every ordinary, non-merged invoice's
-- lines — this changes nothing about how those already look.

alter table hospitalizations add column if not exists invoice_merged_with uuid references hospitalizations(id);
alter table invoice_line_items add column if not exists section_label text;
