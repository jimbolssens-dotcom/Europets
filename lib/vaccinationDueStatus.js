// lib/vaccinationDueStatus.js
// Pure date-math for "when is this vaccination due" — split out of
// app/_components/useVaccinations.js (which pulls in Supabase realtime
// and the recording/billing flow) so a page that only needs the due-date
// label doesn't drag that whole module — and its side-effecting
// lib/supabaseClient import — into its bundle. useVaccinations.js
// re-exports these so existing imports of formatDate/dueStatus from it
// keep working unchanged.

export function formatDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-GB');
}

function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dateStr}T00:00:00`);
  return Math.round((due - today) / 86400000);
}

export function dueStatus(dateStr) {
  if (!dateStr) return null;
  const d = daysUntil(dateStr);
  if (d < 0) return { label: `Overdue by ${Math.abs(d)}d`, className: 'error' };
  if (d <= 30) return { label: `Due in ${d}d`, className: '' };
  return { label: `Due ${formatDate(dateStr)}`, className: 'visit-meta' };
}
