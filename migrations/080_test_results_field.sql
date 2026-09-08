-- migrations/080_test_results_field.sql
-- Repurposes the unused "prognosis" field on visits into "test_results" —
-- where AI-extracted diagnostic test results (see POST /api/diagnostics/
-- :id/extract-result) now accumulate, one entry per test, instead of
-- staying stuck inside each diagnostic's own isolated result field.

alter table visits rename column prognosis to test_results;
