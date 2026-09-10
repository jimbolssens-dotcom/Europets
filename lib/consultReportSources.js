// Text only: attachments are never inputs to the consult-summary model.
export function formatConsultReportSources({ diagnostics = [], dental = [], surgical = [], ultrasound = [], xray = [] }) {
  const entries = diagnostics.map((row) => ({
    label: row.goods_services?.name || row.type || 'Test',
    text: row.result || 'Result not yet recorded.',
  }));
  for (const [label, rows] of [['Dental', dental], ['Surgery', surgical], ['Ultrasound', ultrasound], ['X-ray', xray]]) {
    for (const row of rows) {
      entries.push({
        label: `${label}${row.procedure_name ? ` — ${row.procedure_name}` : ''}`,
        text: row.ai_summary?.trim() || [row.findings, row.procedures_performed, row.notes].filter(Boolean).join('\n') || 'Report pending.',
      });
    }
  }
  return entries.map(({ label, text }) => `${label}:\n${text}`).join('\n\n');
}
