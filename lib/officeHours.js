// lib/officeHours.js
// The clinic's office hours — used to tell whether a client's
// hospitalization "Request an Update" (app/portal/hospitalization/[id])
// came in outside them, so the portal can reply immediately instead of
// leaving the client thinking someone's actively reading it overnight.
//
// The UAE doesn't observe daylight saving, so Asia/Dubai is always a fixed
// UTC+4 offset — no timezone library needed, and this gives the same
// answer regardless of the viewer's own device timezone.

const DUBAI_UTC_OFFSET_HOURS = 4;
export const OFFICE_HOURS_START_HOUR = 8; // 8:00 AM
export const OFFICE_HOURS_END_HOUR = 19; // 7:00 PM
export const OFFICE_HOURS_LABEL = '8:00 AM–7:00 PM';

export function isWithinOfficeHours(date) {
  const dubaiHour = (date.getUTCHours() + DUBAI_UTC_OFFSET_HOURS) % 24;
  return dubaiHour >= OFFICE_HOURS_START_HOUR && dubaiHour < OFFICE_HOURS_END_HOUR;
}
