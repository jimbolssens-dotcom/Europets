// lib/admitConsultLink.js
// A stay started from the Hospitalization page's "Admit Patient" (or any
// way other than the consult's own Hospitalize button) still belongs to the
// consult the patient is in today. Without that link the stay never offers
// the consult's medications for the Day Treatment Plan (Jim, 20 Nov: a cat
// admitted an hour after its consult, none of its six meds came across).
//
// The consult to link: the patient's newest consult still in progress,
// started today (UAE), that no other stay is linked to yet.

export function consultToLink(visits, linkedVisitIds, today) {
  const linked = new Set(linkedVisitIds || []);
  const day = (ts) => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
  return (
    (visits || [])
      .filter((v) => v.status === 'in_progress' && v.started_at && day(v.started_at) === today && !linked.has(v.id))
      .sort((a, b) => new Date(b.started_at) - new Date(a.started_at))[0]?.id || null
  );
}
