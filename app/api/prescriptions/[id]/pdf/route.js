// app/api/prescriptions/[id]/pdf/route.js
// GET -> the prescription as a PDF (lib/prescriptionPdf.js). Opens with no
// login, like an invoice PDF, since it's sent to the owner to show at a
// pharmacy (middleware.js PUBLIC_PATTERNS); the id is a random uuid.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { buildPrescriptionPdf } from '@/lib/prescriptionPdf';
import { rxNumber } from '@/lib/prescriptions';
import { loadSignaturePng, signatureKey } from '@/lib/signatureImages';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { data: rx } = await supabaseAdmin.from('prescriptions').select('*').eq('id', params.id).maybeSingle();
  if (!rx) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const [{ data: patient }, { data: client }, { data: vet }, { data: clinic }] = await Promise.all([
    supabaseAdmin.from('patients').select('name, species, breed, sex, date_of_birth, current_weight_kg, microchip_number, patient_number').eq('id', rx.patient_id).maybeSingle(),
    rx.client_id ? supabaseAdmin.from('clients').select('full_name, client_number, phone').eq('id', rx.client_id).maybeSingle() : { data: null },
    rx.vet_id ? supabaseAdmin.from('staff').select('full_name, licence_number').eq('id', rx.vet_id).maybeSingle() : { data: null },
    supabaseAdmin.from('clinic_settings').select('legal_name, address, phone, phone2, email').eq('id', true).maybeSingle(),
  ]);
  // The vet's signature and stamp, when uploaded (migration 251).
  const [signaturePng, stampPng] = rx.vet_id
    ? await Promise.all([
        loadSignaturePng(supabaseAdmin, signatureKey(rx.vet_id, 'signature')),
        loadSignaturePng(supabaseAdmin, signatureKey(rx.vet_id, 'stamp')),
      ])
    : [null, null];
  const bytes = await buildPrescriptionPdf({ rx, patient, client, vet, clinic, signaturePng, stampPng });
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${rxNumber(rx.rx_number)}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
