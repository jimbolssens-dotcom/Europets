// lib/surgicalReportAuto.js
// Auto-creates (or reuses) a hospitalization's surgical_reports row the
// moment a day procedure checklist item classified as 'spay_neuter' or
// 'surgery' (see lib/checklistItemAction.js) is confirmed done — used by
// both the desktop Procedure Checklist and the mobile Day Procedure
// checklist, so staff never have to remember to separately start a
// surgical report for a routine spay/neuter.
//
// A standard spay/neuter needs no dictation at all: its report is filled
// in immediately from the clinic's own pre-written baseline (Settings ->
// Post-Op Care Baselines), so it's ready to hand over at discharge. Any
// other (advanced/complex) surgery still gets an empty report row, ready
// for a vet to dictate as usual — nothing here overwrites a report that
// already has its own summary.

export async function ensureSurgicalReport({ hospitalizationId, procedureName, isSpayNeuter }) {
  const existing = await fetch(`/api/surgical-reports?hospitalization_id=${hospitalizationId}`).then((res) =>
    res.json()
  );
  let report = Array.isArray(existing) ? existing.find((r) => r.procedure_name === procedureName) : null;

  if (!report) {
    const res = await fetch('/api/surgical-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hospitalization_id: hospitalizationId, procedure_name: procedureName }),
    });
    report = await res.json();
  }

  if (isSpayNeuter && !report.ai_summary) {
    const clinic = await fetch('/api/clinic-settings').then((res) => res.json());
    if (clinic?.surgical_postop_baseline) {
      const res = await fetch(`/api/surgical-reports/${report.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai_summary: clinic.surgical_postop_baseline }),
      });
      report = await res.json();
    }
  }

  return report;
}
