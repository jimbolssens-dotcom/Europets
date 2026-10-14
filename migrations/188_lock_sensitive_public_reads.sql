-- 188: stop the anon key (it ships in browser bundles) reading sensitive
-- tables. Every server read now uses the service role key
-- (lib/supabaseClient.js), which bypasses RLS, and no browser page reads
-- or subscribes to these tables. Each policy is kept but closed
-- (using (false)) so anon and authenticated roles see no rows.
alter policy client_phones_public_read on public.client_phones using (false);
alter policy staff_public_read on public.staff using (false);
alter policy donations_public_read on public.donations using (false);
alter policy consent_form_requests_public_read on public.consent_form_requests using (false);
alter policy consult_notes_public_read on public.consult_notes using (false);
alter policy invoice_discounts_public_read on public.invoice_discounts using (false);
alter policy video_consults_public_read on public.video_consults using (false);
