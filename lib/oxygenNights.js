// lib/oxygenNights.js
// A night in the oxygen cage already includes hospitalisation (Jim, 16 Nov):
// its "Oxygen Cage per day" charge replaces that night's daily rate, it
// doesn't come on top of it. Four unpaid invoices had both. Used by
// lib/hospitalizationCharges.js. Pure, so it can be tested.

import { uaeDate } from './wallPlanItems.js';

export const OXYGEN_NAME = /^oxygen/i;

// The nights (UAE dates) a patient was in the oxygen cage:
// stayItems: [{ note_date, name, billable }] logged on the stay's worksheet;
// visitItems: [{ created_at, name, billable }] charged at the consult the
// stay started from (that night is the admission night).
export function oxygenNights(stayItems = [], visitItems = []) {
  const nights = new Set();
  for (const t of stayItems) if (OXYGEN_NAME.test(t.name || '') && t.billable !== false && t.note_date) nights.add(t.note_date);
  for (const t of visitItems) if (OXYGEN_NAME.test(t.name || '') && t.billable !== false && t.created_at) nights.add(uaeDate(t.created_at));
  return nights;
}
