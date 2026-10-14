-- 191: the live (Realtime) tables become staff-only. Until now anyone
-- with the anon key (it ships in every browser bundle) could read client
-- messages, patients, invoices and the rest. Server code reads with the
-- service role (bypasses RLS); staff browsers connect with the staff
-- token from /api/realtime-token (migration 190, lib/realtimeStaffToken.js);
-- owner-facing pages refresh through the app's API instead.
-- Still open on purpose (harmless lookups): cages, catalog_subcategories,
-- clinic_settings, goods_services, rooms, vaccine_protocols.
-- Safe to re-run.
alter policy appointments_public_read on public.appointments to authenticated using (public.is_staff_jwt());
alter policy attachments_public_read on public.attachments to authenticated using (public.is_staff_jwt());
alter policy cattery_booking_cats_public_read on public.cattery_booking_cats to authenticated using (public.is_staff_jwt());
alter policy cattery_bookings_public_read on public.cattery_bookings to authenticated using (public.is_staff_jwt());
alter policy cattery_daily_logs_public_read on public.cattery_daily_logs to authenticated using (public.is_staff_jwt());
alter policy client_message_thread_state_public_read on public.client_message_thread_state to authenticated using (public.is_staff_jwt());
alter policy client_messages_public_read on public.client_messages to authenticated using (public.is_staff_jwt());
alter policy consent_forms_public_read on public.consent_forms to authenticated using (public.is_staff_jwt());
alter policy consult_notes_public_read on public.consult_notes to authenticated using (public.is_staff_jwt());
alter policy dental_reports_public_read on public.dental_reports to authenticated using (public.is_staff_jwt());
alter policy diagnostics_public_read on public.diagnostics to authenticated using (public.is_staff_jwt());
alter policy discharge_followups_public_read on public.discharge_followups to authenticated using (public.is_staff_jwt());
alter policy expenses_public_read on public.expenses to authenticated using (public.is_staff_jwt());
alter policy gastroscopy_reports_public_read on public.gastroscopy_reports to authenticated using (public.is_staff_jwt());
alter policy hospitalization_messages_public_read on public.hospitalization_messages to authenticated using (public.is_staff_jwt());
alter policy hospitalization_notes_public_read on public.hospitalization_notes to authenticated using (public.is_staff_jwt());
alter policy hospitalization_plan_items_public_read on public.hospitalization_plan_items to authenticated using (public.is_staff_jwt());
alter policy hospitalizations_public_read on public.hospitalizations to authenticated using (public.is_staff_jwt());
alter policy intake_requests_public_read on public.intake_requests to authenticated using (public.is_staff_jwt());
alter policy invoice_line_items_public_read on public.invoice_line_items to authenticated using (public.is_staff_jwt());
alter policy invoice_payments_public_read on public.invoice_payments to authenticated using (public.is_staff_jwt());
alter policy invoices_public_read on public.invoices to authenticated using (public.is_staff_jwt());
alter policy patient_alerts_public_read on public.patient_alerts to authenticated using (public.is_staff_jwt());
alter policy patients_public_read on public.patients to authenticated using (public.is_staff_jwt());
alter policy policies_public_read on public.policies to authenticated using (public.is_staff_jwt());
alter policy policy_categories_public_read on public.policy_categories to authenticated using (public.is_staff_jwt());
alter policy proforma_invoice_items_public_read on public.proforma_invoice_items to authenticated using (public.is_staff_jwt());
alter policy proforma_invoices_public_read on public.proforma_invoices to authenticated using (public.is_staff_jwt());
alter policy recordings_public_read on public.recordings to authenticated using (public.is_staff_jwt());
alter policy review_requests_public_read on public.review_requests to authenticated using (public.is_staff_jwt());
alter policy staff_roster_entries_public_read on public.staff_roster_entries to authenticated using (public.is_staff_jwt());
alter policy surgical_reports_public_read on public.surgical_reports to authenticated using (public.is_staff_jwt());
alter policy treatment_items_public_read on public.treatment_items to authenticated using (public.is_staff_jwt());
alter policy ultrasound_reports_public_read on public.ultrasound_reports to authenticated using (public.is_staff_jwt());
alter policy vaccinations_public_read on public.vaccinations to authenticated using (public.is_staff_jwt());
alter policy visits_public_read on public.visits to authenticated using (public.is_staff_jwt());
alter policy xray_reports_public_read on public.xray_reports to authenticated using (public.is_staff_jwt());
