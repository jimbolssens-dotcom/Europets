// lib/stayDiagnostics.js
// The tests (bloodwork, PCR, x-ray images, ...) that belong to one
// hospital stay: those logged on the stay itself (diagnostics.
// hospitalization_id, see migration 085) plus those ordered on the consult
// the patient was admitted from (hospitalizations.originating_visit_id),
// since tests done just before admission are usually recorded there.
// Shared by the client portal's GET /api/hospitalizations/:id/tests and
// the stay's test-report-pdf, so both always show the same list.

export async function loadStayDiagnostics(supabase, hospitalizationId) {
  const { data: stay, error } = await supabase
    .from('hospitalizations')
    .select('id, originating_visit_id')
    .eq('id', hospitalizationId)
    .maybeSingle();
  if (error) return { error };
  if (!stay) return { data: null };

  const filter = stay.originating_visit_id
    ? `hospitalization_id.eq.${stay.id},visit_id.eq.${stay.originating_visit_id}`
    : `hospitalization_id.eq.${stay.id}`;
  const { data, error: diagError } = await supabase
    .from('diagnostics')
    .select('*, goods_services(name)')
    .or(filter)
    .order('created_at', { ascending: true });
  if (diagError) return { error: diagError };
  return { data: data || [], originatingVisitId: stay.originating_visit_id };
}

export function diagnosticLabel(d) {
  return d.goods_services?.name || d.description || 'Test';
}
