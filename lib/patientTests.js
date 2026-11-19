// lib/patientTests.js
// The "Tests" list under a patient's History (Jim, 19 Nov): every blood
// test, x-ray, ultrasound and other test the pet has had, newest first,
// from the rows of GET /api/patients/:id/report-overview
// (lib/patientReportOverview.js). Consult and hospitalization summaries,
// and surgical/dental reports, are procedures rather than tests, so they
// stay out.
//
// An x-ray, ultrasound or gastroscopy is often both a catalog test on the
// case (diagnostics, e.g. "X-ray first") and its written report. When the
// same consult or stay has the report, the test line with nothing of its
// own (no result typed, no lab PDF) is left out so it isn't listed twice.

const IMAGING_REPORTS = { xray: /x-?ray/i, ultrasound: /ultrasound|sono/i, gastroscopy: /gastroscop|endoscop/i };

function caseKey(row) {
  return row.visit_id ? `v:${row.visit_id}` : row.hospitalization_id ? `h:${row.hospitalization_id}` : null;
}

export function testKind(row) {
  if (row.reportType !== 'diagnostic') return row.reportType;
  const name = row.kind || '';
  for (const [type, re] of Object.entries(IMAGING_REPORTS)) if (re.test(name)) return type;
  if (/blood|cbc|biochem|abaxis|ghp|t4|thyrox|cortisol|hematocrit|htc|glucose|glucometer/i.test(name)) return 'blood';
  if (/urin/i.test(name)) return 'urine';
  return 'other';
}

export const TEST_ICONS = { blood: '🩸', xray: '🩻', ultrasound: '🔊', gastroscopy: '🔬', urine: '🧫', other: '🧪' };

export function testHistoryRows(rows) {
  const list = (rows || []).filter((r) => r.reportType === 'diagnostic' || r.reportType in IMAGING_REPORTS);
  const reportsOnCase = new Set(
    list.filter((r) => r.reportType in IMAGING_REPORTS).map((r) => `${r.reportType}|${caseKey(r)}`)
  );
  return list
    .filter((r) => {
      if (r.reportType !== 'diagnostic') return true;
      const kind = testKind(r);
      if (!(kind in IMAGING_REPORTS)) return true;
      const hasOwn = (r.result && String(r.result).trim()) || r.lab_report_files?.length;
      return hasOwn || !reportsOnCase.has(`${kind}|${caseKey(r)}`);
    })
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}
