// lib/reminderStages.js
// The automatic payment reminder schedule (lib/invoiceReminders.js), in a
// form the browser can import too: the client page's Outstanding card uses
// it to show which reminder each invoice has had and when the next is due.

export const REMINDER_STAGES = [
  { stage: 1, days: 14, label: 'Gentle reminder (2 weeks)', short: 'gentle' },
  { stage: 2, days: 30, label: 'Second reminder (1 month)', short: 'second' },
  { stage: 3, days: 60, label: 'Final reminder (2 months)', short: 'final' },
];
export const MIN_REMINDER_BALANCE = 50;
export const MIN_GAP_DAYS = 10;
const DAY = 86400000;

export function stageShort(stage) {
  return REMINDER_STAGES.find((s) => s.stage === stage)?.short || `stage ${stage}`;
}

// When the next automatic reminder will go out for this set of open
// invoices, given the reminders already sent ({ invoice_id, stage,
// sent_at }), or null if none will (all at the final stage, or below the
// minimum balance). Runs are each morning, so this is a date, not a time.
export function nextReminderDate(invoices, sent, balanceOf, now = new Date()) {
  const lastSent = Math.max(0, ...sent.map((r) => new Date(r.sent_at).getTime()));
  let next = null;
  for (const inv of invoices) {
    if (balanceOf(inv) < MIN_REMINDER_BALANCE) continue;
    const done = Math.max(0, ...sent.filter((r) => r.invoice_id === inv.id).map((r) => r.stage));
    const upcoming = REMINDER_STAGES.find((s) => s.stage > done);
    if (!upcoming) continue;
    let at = new Date(inv.created_at).getTime() + upcoming.days * DAY;
    if (lastSent) at = Math.max(at, lastSent + MIN_GAP_DAYS * DAY);
    at = Math.max(at, now.getTime());
    if (next === null || at < next) next = at;
  }
  return next ? new Date(next) : null;
}
