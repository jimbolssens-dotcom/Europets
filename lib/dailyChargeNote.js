// lib/dailyChargeNote.js
// The text on the worksheet entry lib/hospitalizationCharges.js creates
// when a day of a stay has no entry yet to hang its daily hospitalisation
// charge on. It used to be left blank, showing staff an empty card with
// no explanation; now it says what it is. The client portal hides entries
// with only this text (there's nothing for the owner to read in them).

export const DAILY_CHARGE_NOTE_TEXT = 'Daily hospitalisation charge';

export function isDailyChargeOnlyNote(n) {
  return n.notes === DAILY_CHARGE_NOTE_TEXT;
}
