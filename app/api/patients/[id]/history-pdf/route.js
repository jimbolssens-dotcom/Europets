// app/api/patients/[id]/history-pdf/route.js
// GET -> the patient's full medical history as a PDF (lib/patientHistoryPdf.js).
// Staff can open it straight away; an owner opens it from the link staff
// sent them (app/api/patients/[id]/history-link), which is signed and
// expires after 30 days (lib/historyLink.js). Public in middleware.js for
// that reason, checked here.

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { isStaffRequest } from '@/lib/staffAuth';
import { historyLinkValid } from '@/lib/historyLink';
import { patientReportRows } from '@/lib/patientReportOverview';
import { buildPatientHistoryPdf } from '@/lib/patientHistoryPdf';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request, { params }) {
  const { searchParams } = new URL(request.url);
  if (!(await isStaffRequest(request)) && !historyLinkValid(params.id, searchParams.get('exp'), searchParams.get('sig'))) {
    return new NextResponse('This link has expired or is not valid. Please ask the clinic to send a new one.', {
      status: 403,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const { data: patient } = await supabase
    .from('patients')
    .select('id, name, species, breed, sex, color, date_of_birth, date_of_birth_estimated, microchip_number, microchip_implanted_at, current_weight_kg, patient_number, clients(full_name, client_number)')
    .eq('id', params.id)
    .maybeSingle();
  if (!patient) return NextResponse.json({ error: 'patient not found' }, { status: 404 });

  const [{ data: clinic }, { data: vaccinations }, { data: outside }, rows] = await Promise.all([
    supabase.from('clinic_settings').select('legal_name').eq('id', true).maybeSingle(),
    supabase.from('vaccinations').select('vaccine_name, date_given, next_due_date, batch_number').eq('patient_id', params.id).order('date_given', { ascending: false }),
    supabase
      .from('patient_history_files')
      .select('title, file_name, document_date, source')
      .eq('patient_id', params.id)
      .eq('share_with_owner', true)
      .order('document_date', { ascending: false, nullsFirst: false }),
    patientReportRows(params.id),
  ]);

  const bytes = await buildPatientHistoryPdf({
    patient,
    client: patient.clients,
    clinic,
    vaccinations: vaccinations || [],
    outsideRecords: outside || [],
    rows,
  });
  const safeName = String(patient.name || 'patient').replace(/[^A-Za-z0-9 _-]/g, '').trim() || 'patient';
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${safeName} - medical history.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
