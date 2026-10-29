// lib/reminderInCare.js
// The day-before appointment reminder (lib/appointmentReminders.js) isn't
// sent for a pet that's with us right now: a surgery booked for a pet
// already admitted told the owner to "bring your pet in between 8:00 and
// 10:00" (Jim, 29 Oct). Pure, so it can be tested
// (tests/reminder-in-care.test.mjs).

// appointments: [{ patient_id, ... }]; admittedPatientIds: pets in an open
// stay or day procedure (hospitalizations.status 'admitted').
export function splitByInCare(appointments, admittedPatientIds) {
  const inCare = new Set(admittedPatientIds || []);
  const send = [];
  const skipped = [];
  for (const a of appointments || []) (inCare.has(a.patient_id) ? skipped : send).push(a);
  return { send, skipped };
}
