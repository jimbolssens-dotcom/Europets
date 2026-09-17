// lib/caseReportScope.js
// A single clinical "case" can span more than one hospitalizations row — a
// consult that became an admission/day procedure (originating_visit_id),
// and/or an admission with a same-day procedure spun off it in parallel
// (originating_hospitalization_id, see migration 090's "Book Day
// Procedure") — plus, in principle, that parent's own originating consult
// too. Every report table (diagnostics/surgical/dental/ultrasound/xray
// reports) is only ever tagged with the single visit_id/hospitalization_id
// it was created under, so a report entered on one record in the family
// doesn't show up on another's own Reports section unless something
// explicitly resolves and merges the whole family first.
//
// This is that resolver, used client-side by HospitalizationReportsSection
// so every report type gets the same "show reports from anywhere in this
// case" treatment diagnostics used to get on its own. Purely a read-side
// merge — nothing here writes a report to more than one record, so nothing
// is ever duplicated.

export async function resolveCaseScope(admission) {
  const hospitalizationIds = new Set([admission.id]);
  const visitIds = new Set();
  if (admission.originating_visit_id) visitIds.add(admission.originating_visit_id);

  if (admission.originating_hospitalization_id) {
    hospitalizationIds.add(admission.originating_hospitalization_id);
    try {
      const res = await fetch(`/api/hospitalizations/${admission.originating_hospitalization_id}`);
      if (res.ok) {
        const parent = await res.json();
        if (parent?.originating_visit_id) visitIds.add(parent.originating_visit_id);
      }
    } catch {
      // Best-effort — the parent's own consult reports just won't merge in.
    }
  }

  try {
    const res = await fetch(`/api/hospitalizations?originating_hospitalization_id=${admission.id}`);
    if (res.ok) {
      const children = await res.json();
      (Array.isArray(children) ? children : []).forEach((child) => {
        hospitalizationIds.add(child.id);
        if (child.originating_visit_id) visitIds.add(child.originating_visit_id);
      });
    }
  } catch {
    // Best-effort — spun-off day procedures' reports just won't merge in.
  }

  return { hospitalizationIds: [...hospitalizationIds], visitIds: [...visitIds] };
}

// Fetches one report table across every hospitalization_id/visit_id in the
// case family and merges into one chronological list.
export async function loadCaseReports(path, scope) {
  const urls = [
    ...scope.hospitalizationIds.map((id) => `/api/${path}?hospitalization_id=${id}`),
    ...scope.visitIds.map((id) => `/api/${path}?visit_id=${id}`),
  ];
  const results = await Promise.all(urls.map((url) => fetch(url).then((res) => res.json())));
  if (results.some((data) => !Array.isArray(data))) throw new Error(`Failed to load ${path}`);
  return results.flat().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}
