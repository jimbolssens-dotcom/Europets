// app/api/patients/[id]/status-overview/route.js
// GET /api/patients/:id/status-overview -> whether this patient currently
// has an open consult, hospitalization, day procedure, and/or unpaid
// invoice, and which one — feeds the color-coded status pills on the
// patient file (see the same button-link-consult/-hospitalization/
// -day-procedure/-invoice classes already used on the consult,
// hospitalization, and invoice pages' own cross-record links).

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { id } = params;

  const { data: patient } = await supabase.from('patients').select('client_id').eq('id', id).single();

  const [{ data: consults }, { data: hospitalizations }, { data: invoices }] = await Promise.all([
    supabase
      .from('visits')
      .select('id, started_at')
      .eq('patient_id', id)
      .eq('status', 'in_progress')
      .order('started_at', { ascending: false })
      .limit(1),
    supabase.from('hospitalizations').select('id, kind, admitted_at').eq('patient_id', id).eq('status', 'admitted'),
    patient?.client_id
      ? supabase
          .from('invoices')
          .select('id, status, created_at, visits(patient_id), hospitalizations(patient_id)')
          .eq('client_id', patient.client_id)
          .in('status', ['unpaid', 'partially_paid'])
      : Promise.resolve({ data: [] }),
  ]);

  const hospitalization = (hospitalizations || []).find((h) => h.kind === 'admission') || null;
  const dayProcedure = (hospitalizations || []).find((h) => h.kind === 'day_procedure') || null;
  const invoice =
    (invoices || []).find((inv) => inv.visits?.patient_id === id || inv.hospitalizations?.patient_id === id) || null;

  return NextResponse.json({
    consult: consults?.[0] || null,
    hospitalization,
    dayProcedure,
    invoice: invoice ? { id: invoice.id, status: invoice.status } : null,
  });
}
