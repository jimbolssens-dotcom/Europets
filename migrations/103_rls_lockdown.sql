-- migrations/103_rls_lockdown.sql
-- Turns Row Level Security back on for every remaining table that still
-- had it disabled since migrations/003_disable_rls.sql (or a later
-- migration's own explicit disable) — everything except clients,
-- client_phones, and patients, which migrations/093_clients_patients_rls.sql
-- already covered. Same exact pattern as that migration, applied
-- consistently across the rest of the schema: reads stay exactly as open
-- as they've always been (an unconditional "for select using (true))"
-- policy — this app has no per-user Postgres login to scope reads to,
-- just an app-level staff PIN gate), and writes are left with no policy
-- at all, which means only the service-role key can insert/update/delete.
-- Postgres/Supabase's service_role already bypasses RLS entirely, so it
-- needs no policy of its own here — see lib/supabaseAdmin.js for the
-- server-only client using it.
--
-- Two tables that also have this same "RLS disabled, trust boundary is
-- the app" gap in their own migrations (097_hospitalization_messages.sql,
-- 022_patient_alerts.sql) are included here too, even though they weren't
-- named in the Supabase linter report that prompted this migration —
-- same exposure, same fix. nomod_payment_links (058_nomod_payment_links.sql)
-- is included as well; it's written from the separate website/ app, not
-- this one — see website/lib/supabaseServerAdmin.js for that app's own
-- service-role client, needed for this table plus invoices/
-- invoice_payments/review_requests, which the website also writes to.
--
-- staff_schedules is deliberately NOT included — migrations/
-- 044_drop_staff_schedules.sql already dropped that table (replaced by
-- staff_roster_entries), so enabling RLS on it here would just error.
--
-- IMPORTANT deploy order: every write in the app/ and website/ folders to
-- these tables was moved onto the service-role client (supabaseAdmin /
-- supabaseServerAdmin) ahead of this migration — deploy that code (and,
-- for the website, set its own SUPABASE_SERVICE_ROLE_KEY env var) FIRST,
-- THEN run this migration. Running this first would make every write to
-- any of these tables fail in production until the new code is live.
--
-- Run this in your Supabase SQL editor. Safe to run more than once —
-- re-running "enable row level security" and re-creating a policy that
-- already exists both no-op/error harmlessly; drop and re-add a policy
-- individually if you ever need to change one.

alter table appointments enable row level security;
create policy "appointments_public_read" on appointments for select using (true);

alter table attachments enable row level security;
create policy "attachments_public_read" on attachments for select using (true);

alter table cages enable row level security;
create policy "cages_public_read" on cages for select using (true);

alter table catalog_subcategories enable row level security;
create policy "catalog_subcategories_public_read" on catalog_subcategories for select using (true);

alter table clinic_settings enable row level security;
create policy "clinic_settings_public_read" on clinic_settings for select using (true);

alter table consent_form_requests enable row level security;
create policy "consent_form_requests_public_read" on consent_form_requests for select using (true);

alter table consent_forms enable row level security;
create policy "consent_forms_public_read" on consent_forms for select using (true);

alter table consult_notes enable row level security;
create policy "consult_notes_public_read" on consult_notes for select using (true);

alter table dental_reports enable row level security;
create policy "dental_reports_public_read" on dental_reports for select using (true);

alter table diagnostics enable row level security;
create policy "diagnostics_public_read" on diagnostics for select using (true);

alter table expenses enable row level security;
create policy "expenses_public_read" on expenses for select using (true);

alter table goods_services enable row level security;
create policy "goods_services_public_read" on goods_services for select using (true);

alter table hospitalization_messages enable row level security;
create policy "hospitalization_messages_public_read" on hospitalization_messages for select using (true);

alter table hospitalization_notes enable row level security;
create policy "hospitalization_notes_public_read" on hospitalization_notes for select using (true);

alter table hospitalization_plan_items enable row level security;
create policy "hospitalization_plan_items_public_read" on hospitalization_plan_items for select using (true);

alter table hospitalizations enable row level security;
create policy "hospitalizations_public_read" on hospitalizations for select using (true);

alter table intake_requests enable row level security;
create policy "intake_requests_public_read" on intake_requests for select using (true);

alter table invoice_line_items enable row level security;
create policy "invoice_line_items_public_read" on invoice_line_items for select using (true);

alter table invoice_payments enable row level security;
create policy "invoice_payments_public_read" on invoice_payments for select using (true);

alter table invoices enable row level security;
create policy "invoices_public_read" on invoices for select using (true);

alter table nomod_payment_links enable row level security;
create policy "nomod_payment_links_public_read" on nomod_payment_links for select using (true);

alter table patient_alerts enable row level security;
create policy "patient_alerts_public_read" on patient_alerts for select using (true);

alter table policies enable row level security;
create policy "policies_public_read" on policies for select using (true);

alter table policy_categories enable row level security;
create policy "policy_categories_public_read" on policy_categories for select using (true);

alter table proforma_invoice_items enable row level security;
create policy "proforma_invoice_items_public_read" on proforma_invoice_items for select using (true);

alter table proforma_invoices enable row level security;
create policy "proforma_invoices_public_read" on proforma_invoices for select using (true);

alter table recordings enable row level security;
create policy "recordings_public_read" on recordings for select using (true);

alter table review_requests enable row level security;
create policy "review_requests_public_read" on review_requests for select using (true);

alter table rooms enable row level security;
create policy "rooms_public_read" on rooms for select using (true);

alter table staff enable row level security;
create policy "staff_public_read" on staff for select using (true);

alter table staff_roster_entries enable row level security;
create policy "staff_roster_entries_public_read" on staff_roster_entries for select using (true);

alter table surgical_reports enable row level security;
create policy "surgical_reports_public_read" on surgical_reports for select using (true);

alter table treatment_items enable row level security;
create policy "treatment_items_public_read" on treatment_items for select using (true);

alter table ultrasound_reports enable row level security;
create policy "ultrasound_reports_public_read" on ultrasound_reports for select using (true);

alter table vaccinations enable row level security;
create policy "vaccinations_public_read" on vaccinations for select using (true);

alter table vaccine_protocols enable row level security;
create policy "vaccine_protocols_public_read" on vaccine_protocols for select using (true);

alter table visits enable row level security;
create policy "visits_public_read" on visits for select using (true);

alter table xray_reports enable row level security;
create policy "xray_reports_public_read" on xray_reports for select using (true);
