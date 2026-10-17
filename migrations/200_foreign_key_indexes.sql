-- migrations/200_foreign_key_indexes.sql
-- An index on every foreign key that didn't have one (Supabase's
-- performance advisor, "unindexed foreign keys"): looking up a client's
-- invoices, a patient's stays, a consult's reports and so on reads
-- straight from the index instead of scanning the whole table, which
-- matters more as the tables grow. Indexes only: no data changes.
-- Safe to re-run (if not exists).

create index if not exists idx_appointments_client_id on public.appointments (client_id);
create index if not exists idx_appointments_patient_id on public.appointments (patient_id);
create index if not exists idx_appointments_vet_id on public.appointments (vet_id);
create index if not exists idx_attachments_uploaded_by on public.attachments (uploaded_by);
create index if not exists idx_cattery_booking_cats_patient_id on public.cattery_booking_cats (patient_id);
create index if not exists idx_cattery_bookings_client_id on public.cattery_bookings (client_id);
create index if not exists idx_cattery_daily_logs_patient_id on public.cattery_daily_logs (patient_id);
create index if not exists idx_cattery_daily_logs_recorded_by on public.cattery_daily_logs (recorded_by);
create index if not exists idx_client_message_thread_state_assigned_staff_id on public.client_message_thread_state (assigned_staff_id);
create index if not exists idx_client_messages_staff_id on public.client_messages (staff_id);
create index if not exists idx_consent_form_requests_consent_form_id on public.consent_form_requests (consent_form_id);
create index if not exists idx_consent_forms_client_id on public.consent_forms (client_id);
create index if not exists idx_consent_forms_staff_witness_id on public.consent_forms (staff_witness_id);
create index if not exists idx_consult_notes_author_id on public.consult_notes (author_id);
create index if not exists idx_dental_reports_performed_by on public.dental_reports (performed_by);
create index if not exists idx_dental_reports_visit_id on public.dental_reports (visit_id);
create index if not exists idx_diagnostics_goods_service_id on public.diagnostics (goods_service_id);
create index if not exists idx_diagnostics_treatment_item_id on public.diagnostics (treatment_item_id);
create index if not exists idx_diagnostics_visit_id on public.diagnostics (visit_id);
create index if not exists idx_discharge_followups_client_id on public.discharge_followups (client_id);
create index if not exists idx_discharge_followups_sent_by on public.discharge_followups (sent_by);
create index if not exists idx_discharge_followups_vet_id on public.discharge_followups (vet_id);
create index if not exists idx_gastroscopy_reports_diagnostic_id on public.gastroscopy_reports (diagnostic_id);
create index if not exists idx_gastroscopy_reports_performed_by on public.gastroscopy_reports (performed_by);
create index if not exists idx_gastroscopy_reports_visit_id on public.gastroscopy_reports (visit_id);
create index if not exists idx_hospitalization_messages_staff_id on public.hospitalization_messages (staff_id);
create index if not exists idx_hospitalization_notes_author_id on public.hospitalization_notes (author_id);
create index if not exists idx_hospitalization_notes_hospitalization_id on public.hospitalization_notes (hospitalization_id);
create index if not exists idx_hospitalization_notes_plan_item_id on public.hospitalization_notes (plan_item_id);
create index if not exists idx_hospitalization_plan_items_goods_service_id on public.hospitalization_plan_items (goods_service_id);
create index if not exists idx_hospitalization_plan_items_hospitalization_id on public.hospitalization_plan_items (hospitalization_id);
create index if not exists idx_hospitalizations_appointment_id on public.hospitalizations (appointment_id);
create index if not exists idx_hospitalizations_client_id on public.hospitalizations (client_id);
create index if not exists idx_hospitalizations_hospitalization_rate_override_id on public.hospitalizations (hospitalization_rate_override_id);
create index if not exists idx_hospitalizations_invoice_merged_with on public.hospitalizations (invoice_merged_with);
create index if not exists idx_hospitalizations_originating_hospitalization_id on public.hospitalizations (originating_hospitalization_id);
create index if not exists idx_hospitalizations_originating_visit_id on public.hospitalizations (originating_visit_id);
create index if not exists idx_hospitalizations_patient_id on public.hospitalizations (patient_id);
create index if not exists idx_hospitalizations_room_id on public.hospitalizations (room_id);
create index if not exists idx_intake_requests_appointment_id on public.intake_requests (appointment_id);
create index if not exists idx_intake_requests_client_id on public.intake_requests (client_id);
create index if not exists idx_intake_requests_requested_vet_id on public.intake_requests (requested_vet_id);
create index if not exists idx_intake_requests_selected_patient_id on public.intake_requests (selected_patient_id);
create index if not exists idx_invoice_discounts_applied_by on public.invoice_discounts (applied_by);
create index if not exists idx_invoice_line_items_goods_service_id on public.invoice_line_items (goods_service_id);
create index if not exists idx_invoice_payments_received_by on public.invoice_payments (received_by);
create index if not exists idx_invoice_reminders_client_id on public.invoice_reminders (client_id);
create index if not exists idx_invoices_client_id on public.invoices (client_id);
create index if not exists idx_invoices_hospitalization_id on public.invoices (hospitalization_id);
create index if not exists idx_invoices_visit_id on public.invoices (visit_id);
create index if not exists idx_patient_alerts_author_id on public.patient_alerts (author_id);
create index if not exists idx_patient_history_files_client_message_id on public.patient_history_files (client_message_id);
create index if not exists idx_patient_history_files_uploaded_by on public.patient_history_files (uploaded_by);
create index if not exists idx_patient_owner_transfers_from_client_id on public.patient_owner_transfers (from_client_id);
create index if not exists idx_patient_owner_transfers_staff_id on public.patient_owner_transfers (staff_id);
create index if not exists idx_patient_owner_transfers_to_client_id on public.patient_owner_transfers (to_client_id);
create index if not exists idx_proforma_invoice_items_goods_service_id on public.proforma_invoice_items (goods_service_id);
create index if not exists idx_proforma_invoices_client_id on public.proforma_invoices (client_id);
create index if not exists idx_proforma_invoices_created_by on public.proforma_invoices (created_by);
create index if not exists idx_review_requests_client_id on public.review_requests (client_id);
create index if not exists idx_surgical_reports_surgeon_id on public.surgical_reports (surgeon_id);
create index if not exists idx_surgical_reports_visit_id on public.surgical_reports (visit_id);
create index if not exists idx_treatment_items_goods_service_id on public.treatment_items (goods_service_id);
create index if not exists idx_treatment_items_hospitalization_note_id on public.treatment_items (hospitalization_note_id);
create index if not exists idx_treatment_items_visit_id on public.treatment_items (visit_id);
create index if not exists idx_ultrasound_reports_diagnostic_id on public.ultrasound_reports (diagnostic_id);
create index if not exists idx_ultrasound_reports_performed_by on public.ultrasound_reports (performed_by);
create index if not exists idx_ultrasound_reports_visit_id on public.ultrasound_reports (visit_id);
create index if not exists idx_vaccinations_administered_by on public.vaccinations (administered_by);
create index if not exists idx_vaccinations_vaccine_protocol_id on public.vaccinations (vaccine_protocol_id);
create index if not exists idx_visits_appointment_id on public.visits (appointment_id);
create index if not exists idx_visits_attending_vet_id on public.visits (attending_vet_id);
create index if not exists idx_visits_client_id on public.visits (client_id);
create index if not exists idx_visits_room_id on public.visits (room_id);
create index if not exists idx_xray_reports_diagnostic_id on public.xray_reports (diagnostic_id);
create index if not exists idx_xray_reports_performed_by on public.xray_reports (performed_by);
create index if not exists idx_xray_reports_visit_id on public.xray_reports (visit_id);
