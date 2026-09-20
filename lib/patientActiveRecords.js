// lib/patientActiveRecords.js
// Whether a patient currently has an active (in_progress) consult and/or
// an active (status='admitted') hospitalization/day procedure — patient-
// scoped, not scoped to any one record's own direct link. Shared by every
// page whose Consult/Hospitalization/Day Procedure cross-record pills (see
// CrossRecordLinks) need to reflect the patient's actual current state:
// e.g. an invoice created from a consult has no hospitalization_id of its
// own, but the patient may still be actively hospitalized right now off a
// separate admission — the pill should show that, not "not hospitalized".
export async function fetchPatientActiveRecords(patientId) {
  if (!patientId) return { consult: null, admission: null, dayProcedure: null };

  const [visitsRes, hospitalizationsRes] = await Promise.all([
    fetch(`/api/visits?patient_id=${patientId}&status=in_progress`),
    fetch(`/api/hospitalizations?patient_id=${patientId}&status=admitted`),
  ]);
  const visits = await visitsRes.json();
  const hospitalizations = await hospitalizationsRes.json();
  if (!visitsRes.ok || !Array.isArray(visits)) throw new Error('Could not check active consult.');
  if (!hospitalizationsRes.ok || !Array.isArray(hospitalizations)) throw new Error('Could not check active hospitalization.');

  return {
    consult: visits[0] || null,
    admission: hospitalizations.find((h) => h.kind === 'admission') || null,
    dayProcedure: hospitalizations.find((h) => h.kind === 'day_procedure') || null,
  };
}
