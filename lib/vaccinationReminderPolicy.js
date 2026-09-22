// lib/vaccinationReminderPolicy.js
// Shared caps on automated vaccination reminders (see migration 133) —
// used both server-side (app/api/vaccinations/send-reminder, the actual
// enforcement) and client-side (the Vaccinations Reminders page, so the
// WhatsApp button reflects the same rule before a doomed request is even
// sent). A vaccine overdue by more than CUTOFF_DAYS_OVERDUE, or already
// reminded MAX_REMINDERS times, is treated as lapsed — a human's call to
// make (a phone call, or accepting the client isn't coming back for this
// dose), not another automatic nudge. Nagging a client who isn't
// responding is both pointless and a real risk to the WhatsApp number's
// own quality rating with Meta. Numbers are a clinic policy choice, not a
// technical one — isomorphic (no server-only imports) so both sides agree.

export const CUTOFF_DAYS_OVERDUE = 90;
export const COOLDOWN_DAYS = 30;
export const MAX_REMINDERS = 2;

const DAY_MS = 86400000;

export function daysOverdue(nextDueDate, today = new Date()) {
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  const due = new Date(`${nextDueDate}T00:00:00`);
  return Math.round((t - due) / DAY_MS);
}

// Every row in a due-date group is reminded together and stays in
// lockstep (see the send-reminder route), so reminderSentAt/reminderCount
// are the group's shared values, not per-row.
export function reminderEligibility({ nextDueDate, reminderSentAt, reminderCount }, today = new Date()) {
  const overdue = daysOverdue(nextDueDate, today);
  const count = reminderCount || 0;

  if (overdue > CUTOFF_DAYS_OVERDUE) {
    return {
      lapsed: true,
      canSendNow: false,
      reason: `${overdue} days overdue — past the ${CUTOFF_DAYS_OVERDUE}-day cutoff for automatic reminders`,
    };
  }
  if (count >= MAX_REMINDERS) {
    return {
      lapsed: true,
      canSendNow: false,
      reason: `Already reminded ${count} time${count === 1 ? '' : 's'} — needs a phone call instead of another WhatsApp`,
    };
  }
  if (reminderSentAt) {
    const availableAt = new Date(new Date(reminderSentAt).getTime() + COOLDOWN_DAYS * DAY_MS);
    if (availableAt > today) {
      return {
        lapsed: false,
        canSendNow: false,
        reason: `Reminded ${new Date(reminderSentAt).toLocaleDateString('en-GB')} — next one available ${availableAt.toLocaleDateString('en-GB')}`,
        availableAt,
      };
    }
  }
  return { lapsed: false, canSendNow: true, reason: null };
}
