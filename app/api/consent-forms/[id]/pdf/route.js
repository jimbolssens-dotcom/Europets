// app/api/consent-forms/[id]/pdf/route.js
// GET /api/consent-forms/:id/pdf -> the signed consent form as a PDF, for
// the vet to download and give/send to the client.

import { supabase } from '@/lib/supabaseClient';
import { buildConsentFormPdf } from '@/lib/consentFormPdf';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { data: consentForm, error } = await supabase
    .from('consent_forms')
    .select('*, staff(full_name)')
    .eq('id', params.id)
    .single();

  if (error || !consentForm) {
    return NextResponse.json({ error: 'consent form not found' }, { status: 404 });
  }

  const [{ data: patient }, { data: client }, { data: clinic }] = await Promise.all([
    supabase.from('patients').select('name, species').eq('id', consentForm.patient_id).single(),
    supabase.from('clients').select('full_name').eq('id', consentForm.client_id).single(),
    supabase.from('clinic_settings').select('*').eq('id', true).single(),
  ]);

  const pdfBytes = await buildConsentFormPdf({ consentForm, patient, client, clinic });

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="consent-form-${consentForm.form_type}-${params.id}.pdf"`,
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}
