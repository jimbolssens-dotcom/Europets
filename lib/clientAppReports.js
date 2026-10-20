// lib/clientAppReports.js
// Maps a row from GET /api/patients/:id/report-overview (reportType +
// recordId/visit_id/hospitalization_id) to that report's own PDF route —
// the same public PDF routes the "send to client via WhatsApp" buttons
// already use elsewhere (see middleware.js's PUBLIC_PATTERNS). Shared by
// the client app's Reports tab and each pet's full-history page.

// A fresh ?v= on every link, so a phone that saved an earlier copy of the
// PDF (the browser reopens it instead of fetching again) always gets the
// report as it is now, e.g. after a lab result was added.
export function reportPdfHref(row) {
  const path = reportPdfPath(row);
  return path ? `${path}?v=${Date.now()}` : null;
}

function reportPdfPath(row) {
  switch (row.reportType) {
    case 'consult':
      return `/api/visits/${row.recordId}/report-pdf`;
    case 'hospitalization':
      return `/api/hospitalizations/${row.recordId}/summary-pdf`;
    case 'dental':
      return `/api/dental-reports/${row.recordId}/report-pdf`;
    case 'surgical':
      return `/api/surgical-reports/${row.recordId}/report-pdf`;
    case 'ultrasound':
      return `/api/ultrasound-reports/${row.recordId}/report-pdf`;
    case 'xray':
      return `/api/xray-reports/${row.recordId}/report-pdf`;
    case 'gastroscopy':
      return `/api/gastroscopy-reports/${row.recordId}/report-pdf`;
    case 'diagnostic':
      // A test with the lab's own PDF opens that: it's the result itself,
      // and it opens even when the lab's file can't be copied into the
      // combined test report.
      if (row.lab_report_files?.length) return `/api/diagnostics/${row.recordId}/lab-pdf`;
      return row.visit_id
        ? `/api/visits/${row.visit_id}/test-report-pdf`
        : `/api/hospitalizations/${row.hospitalization_id}/test-report-pdf`;
    default:
      return null;
  }
}

// The report-overview row's own free text, if any — ai_summary for a
// consult/hospitalization/dental/surgical/ultrasound/xray/gastroscopy
// report, "result" for a lab/diagnostic test. Same field-picking the
// staff-facing Full Patient History page uses
// (app/(admin)/patients/[id]/history).
export function reportText(row) {
  const text = row.ai_summary || row.result || row.findings || row.notes || row.procedure_name || null;
  if (text) return text;
  // A test result attached as a lab PDF rather than typed in.
  if (row.lab_report_files?.length) return `Lab report attached (${row.lab_report_files.join(', ')}). Tap View PDF to see it.`;
  return null;
}

export const REPORT_KIND_ICONS = {
  'Consult report': '🩺',
  'Hospitalization report': '🏥',
  'Dental report': '🦷',
  'Surgical report': '🔪',
  'Ultrasound report': '🔊',
  'X-ray report': '🩻',
  'Gastroscopy report': '🔬',
};

export function reportKindIcon(kind) {
  return REPORT_KIND_ICONS[kind] || '🧪';
}
