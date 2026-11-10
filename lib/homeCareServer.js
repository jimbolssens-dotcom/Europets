// lib/homeCareServer.js
// Database side of home care (lib/homeCare.js, migration 247), shared by
// the staff route (app/api/home-care) and the client app's routes
// (app/api/client-app/home-care). Both tables are only reachable with the
// service role, so every caller here passes supabaseAdmin.

import { dubaiDateISO } from '@/lib/dayProcedureSchedule';
import { planActiveOn, planLastDay } from '@/lib/homeCare';

// The patient and owner behind a consult or a stay.
export async function recordContext(db, { visitId, hospitalizationId }) {
  if (visitId) {
    const { data } = await db.from('visits').select('id, patient_id, client_id').eq('id', visitId).maybeSingle();
    return data ? { patientId: data.patient_id, clientId: data.client_id } : null;
  }
  if (hospitalizationId) {
    const { data } = await db.from('hospitalizations').select('id, patient_id, client_id').eq('id', hospitalizationId).maybeSingle();
    return data ? { patientId: data.patient_id, clientId: data.client_id } : null;
  }
  return null;
}

// Medicines dispensed on the record (to take home), with their label
// instructions: a consult's treatment items, or a stay's worksheet items.
export async function dispensedItems(db, { visitId, hospitalizationId }) {
  const fields = 'id, instructions, administration_method, quantity, created_at, goods_services(name)';
  if (visitId) {
    const { data } = await db.from('treatment_items').select(fields).eq('visit_id', visitId).eq('administration_method', 'dispense').order('created_at');
    return data || [];
  }
  if (hospitalizationId) {
    const { data: notes } = await db.from('hospitalization_notes').select('id').eq('hospitalization_id', hospitalizationId);
    const ids = (notes || []).map((n) => n.id);
    if (!ids.length) return [];
    const { data } = await db.from('treatment_items').select(fields).in('hospitalization_note_id', ids).eq('administration_method', 'dispense').order('created_at');
    return data || [];
  }
  return [];
}

// The pet's next booked appointment, if any.
export async function nextVisit(db, patientId) {
  const { data } = await db
    .from('appointments')
    .select('id, start_time, type, reason, status, staff(full_name)')
    .eq('patient_id', patientId)
    .gte('start_time', new Date().toISOString())
    .eq('status', 'booked')
    .order('start_time')
    .limit(1)
    .maybeSingle();
  return data || null;
}

// Plans that are running today (or ran in the last `pastDays` days) for
// these patients, newest first.
export async function recentPlans(db, patientIds, { pastDays = 0 } = {}) {
  if (!patientIds.length) return [];
  const today = dubaiDateISO();
  const since = new Date(Date.now() - (pastDays + 400) * 86400000).toISOString().slice(0, 10);
  const { data, error } = await db
    .from('home_care_plans')
    .select('*')
    .in('patient_id', patientIds)
    .gte('starts_on', since)
    .order('starts_on', { ascending: false });
  if (error) throw error;
  const cutoff = new Date(Date.now() - pastDays * 86400000).toISOString().slice(0, 10);
  return (data || []).filter((p) => p.items?.length && (planActiveOn(p, today) || (pastDays > 0 && planLastDay(p) >= cutoff)));
}

export async function ticksForPlans(db, planIds) {
  if (!planIds.length) return [];
  const { data, error } = await db
    .from('home_care_logs')
    .select('id, plan_id, kind, item_key, for_date, slot, given_at')
    .in('plan_id', planIds)
    .in('kind', ['dose', 'task']);
  if (error) throw error;
  return data || [];
}

// The logged-in client's own pet, or null.
export async function ownedPatient(db, clientId, patientId) {
  if (!clientId || !patientId) return null;
  const { data } = await db.from('patients').select('id, name, client_id, species, patient_number, profile_photo_url, deceased, rehomed').eq('id', patientId).maybeSingle();
  return data && data.client_id === clientId ? data : null;
}
