// lib/dailyLog.js
// "What did this staff member log today" — a consolidated, on-demand
// activity log pulled across every table that attributes an action to a
// specific staff member, for a manager following up on who's doing what.
// Nothing here is precomputed or stored; it's re-run fresh every time it's
// requested (see app/api/staff/[id]/daily-log/route.js), same "generate on
// demand" spirit as the shift tally (lib/shiftSummary.js), whose UAE-local
// day-window pattern this mirrors.
//
// Each source table lists its own staff-attribution column and event
// timestamp (see schema.sql) — deliberately NOT every table that mentions
// staff at all: appointments.vet_id/intake_requests.requested_vet_id are a
// booking assignment, not something that staff member did that day, and
// diagnostics/treatment_items/hospitalization_plan_items carry no staff
// column of their own (a plan-item tap is already captured via the
// hospitalization_notes row it creates).

function uaeIso(date, time) {
  return `${date}T${time}:00.000+04:00`;
}

export function validateDailyLogParams(date) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'date must be YYYY-MM-DD';
  return null;
}

// A hospitalization_notes row's own `notes` text (see DayTreatmentPlan.jsx's
// taskLine) is already the most specific human-written summary available
// when one was set — a task tap, or a task merged alongside a vitals
// reading in the same round. Only falls back to a generic label when there
// is no free text at all (a lone vitals reading, or a Quick Check-In tile
// entry, which never set `notes`).
function hospitalizationNoteSummary(row) {
  if (row.notes) return row.notes.split('\n')[0];
  if (row.temperature_c != null) return 'Temp check';
  if (row.weight_kg != null) return 'Weight check';
  if (row.stool || row.urine || row.vomit || row.drinking || row.mood || row.temperature_feel) return 'Check-in logged';
  return 'Worksheet note';
}

function reportPatientName(row) {
  return row.visits?.patients?.name || row.hospitalizations?.patients?.name || 'patient';
}

const SOURCES = [
  {
    table: 'hospitalization_notes',
    staffCol: 'author_id',
    timeCol: 'created_at',
    select: '*, hospitalizations(patients(name))',
    describe: (row) => `${hospitalizationNoteSummary(row)} — ${row.hospitalizations?.patients?.name || 'patient'}`,
  },
  {
    table: 'visits',
    staffCol: 'attending_vet_id',
    timeCol: 'started_at',
    select: '*, patients(name)',
    describe: (row) => `Consult — ${row.patients?.name || 'patient'}`,
  },
  {
    table: 'consult_notes',
    staffCol: 'author_id',
    timeCol: 'created_at',
    select: '*, visits(patients(name))',
    describe: (row) => `Consult note — ${row.visits?.patients?.name || 'patient'}`,
  },
  {
    table: 'patient_alerts',
    staffCol: 'author_id',
    timeCol: 'created_at',
    select: '*, patients(name)',
    describe: (row) => `Patient alert — ${row.patients?.name || 'patient'}`,
  },
  {
    table: 'surgical_reports',
    staffCol: 'surgeon_id',
    timeCol: 'performed_at',
    select: '*, visits(patients(name)), hospitalizations(patients(name))',
    describe: (row) => `Surgical report — ${reportPatientName(row)}`,
  },
  {
    table: 'dental_reports',
    staffCol: 'performed_by',
    timeCol: 'performed_at',
    select: '*, visits(patients(name)), hospitalizations(patients(name))',
    describe: (row) => `Dental report — ${reportPatientName(row)}`,
  },
  {
    table: 'xray_reports',
    staffCol: 'performed_by',
    timeCol: 'performed_at',
    select: '*, visits(patients(name)), hospitalizations(patients(name))',
    describe: (row) => `X-ray report — ${reportPatientName(row)}`,
  },
  {
    table: 'ultrasound_reports',
    staffCol: 'performed_by',
    timeCol: 'performed_at',
    select: '*, visits(patients(name)), hospitalizations(patients(name))',
    describe: (row) => `Ultrasound report — ${reportPatientName(row)}`,
  },
  {
    table: 'consent_forms',
    staffCol: 'staff_witness_id',
    timeCol: 'signed_at',
    select: '*, patients(name)',
    describe: (row) => `Witnessed consent — ${row.patients?.name || 'patient'}`,
  },
  {
    table: 'vaccinations',
    staffCol: 'administered_by',
    timeCol: 'created_at',
    select: '*, patients(name)',
    describe: (row) => `Vaccination — ${row.patients?.name || 'patient'}`,
  },
  {
    table: 'invoice_payments',
    staffCol: 'received_by',
    timeCol: 'paid_at',
    select: '*',
    describe: (row) => `Payment taken — AED ${Number(row.amount || 0).toFixed(0)}`,
  },
];

export async function fetchStaffDailyLog(supabase, { staffId, date }) {
  const start = new Date(uaeIso(date, '00:00'));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  const results = await Promise.all(
    SOURCES.map(async (source) => {
      const { data, error } = await supabase
        .from(source.table)
        .select(source.select)
        .eq(source.staffCol, staffId)
        .gte(source.timeCol, start.toISOString())
        .lt(source.timeCol, end.toISOString());
      if (error) return { table: source.table, error };
      return {
        table: source.table,
        entries: (data || []).map((row) => ({
          time: row[source.timeCol],
          description: source.describe(row),
        })),
      };
    })
  );

  const failed = results.find((r) => r.error);
  if (failed) return { error: failed.error };

  const entries = results.flatMap((r) => r.entries).sort((a, b) => new Date(a.time) - new Date(b.time));

  return { data: { date, count: entries.length, entries } };
}
