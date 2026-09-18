-- Migration 121: clear AI-transcribed text from blood test results
--
-- Staff found the automatic photo-to-text transcription of blood test
-- results confusing to read and want to rely on the original uploaded
-- PDF/photo instead (see app/api/diagnostics/[id]/extract-result and
-- lib/bloodTestProduct.js — the app no longer runs this transcription for
-- blood tests going forward). This clears out the text it already wrote
-- for EXISTING blood test rows.
--
-- Targeting is deliberately narrow: only rows whose result text contains
-- "Factual abnormalities" — the section heading the AI transcription
-- always appends (see FACTUAL_LAB_INSTRUCTIONS in lib/anthropicClient.js)
-- — are touched, so a result a vet typed in by hand (which would never
-- contain that heading) is left alone. "Blood pressure" is explicitly
-- excluded since it's a vitals reading, not a lab panel.
--
-- This does NOT touch the attachments table or the consult-files storage
-- bucket — the original uploaded files stay exactly as they are.
--
-- Run this in your Supabase SQL editor. Safe to run more than once.

update diagnostics d
set result = null
from goods_services gs
left join catalog_subcategories cs on cs.id = gs.subcategory_id
where d.goods_service_id = gs.id
  and d.result ilike '%Factual abnormalities%'
  and (gs.name ~* 'blood|cbc|ghp|h[ae]matology|chem(istry)?\s*panel|biochemistry')
  and gs.name !~* 'blood\s*pressure';

update diagnostics d
set result = null
where d.goods_service_id is null
  and d.result ilike '%Factual abnormalities%'
  and d.type ~* 'blood|cbc|ghp|h[ae]matology|chem(istry)?\s*panel|biochemistry'
  and d.type !~* 'blood\s*pressure';
