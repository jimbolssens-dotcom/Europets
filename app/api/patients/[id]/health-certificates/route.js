// app/api/patients/[id]/health-certificates/route.js
// GET  -> this pet's export health certificates (migration 231), newest first.
// POST { exam_date, vet_id, destination?, travel_date?, owner_address?,
//        microchip_location?, internal_product?, internal_date?,
//        external_product?, external_date?, visited?, remarks?, staff_id?,
//        preview? }
//      -> preview: what the certificate would say, with what's missing
//         (warnings), nothing saved. Otherwise issues it: numbered
//         HC-YY-NNN, the details saved as printed (lib/healthCertificate.js),
//         and returns { id, certificate_number } for its PDF
//         (/api/health-certificates/:id/pdf).

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { buildCertificateData } from '@/lib/healthCertificate';
import { uaeToday } from '@/lib/vaccinationCourse';

export const dynamic = 'force-dynamic';

const FORM_FIELDS = ['exam_date', 'destination', 'travel_date', 'owner_address', 'microchip_location', 'internal_product', 'internal_date', 'external_product', 'external_date', 'visited', 'remarks'];
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');

export async function GET(request, { params }) {
  const { data, error } = await supabaseAdmin
    .from('health_certificates')
    .select('id, certificate_number, exam_date, destination, created_at, staff:vet_id(full_name)')
    .eq('patient_id', params.id)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const form = {};
  for (const f of FORM_FIELDS) if (body[f] !== undefined && body[f] !== null) form[f] = String(body[f]).trim().slice(0, 500);
  for (const f of ['internal_date', 'external_date', 'travel_date']) if (form[f] && !isDate(form[f])) delete form[f];
  if (!isDate(form.exam_date)) return NextResponse.json({ error: 'Pick the date of the examination' }, { status: 400 });
  if (form.exam_date > uaeToday()) return NextResponse.json({ error: "The examination can't be in the future" }, { status: 400 });
  if (!body.vet_id) return NextResponse.json({ error: 'Pick the vet who signs it' }, { status: 400 });

  const { data: patient, error: patientError } = await supabaseAdmin.from('patients').select('*').eq('id', params.id).single();
  if (patientError || !patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
  const [{ data: client }, { data: clinic }, { data: vet }, { data: vaccinations }, { data: protocols }] = await Promise.all([
    patient.client_id ? supabaseAdmin.from('clients').select('full_name, address, phone').eq('id', patient.client_id).maybeSingle() : Promise.resolve({ data: null }),
    supabaseAdmin.from('clinic_settings').select('legal_name, address, phone, email').eq('id', true).maybeSingle(),
    supabaseAdmin.from('staff').select('id, full_name, licence_number').eq('id', body.vet_id).maybeSingle(),
    supabaseAdmin.from('vaccinations').select('vaccine_protocol_id, vaccine_name, date_given, next_due_date, batch_number').eq('patient_id', params.id),
    supabaseAdmin.from('vaccine_protocols').select('id, name, core, is_rabies'),
  ]);
  if (!vet) return NextResponse.json({ error: 'That vet was not found' }, { status: 400 });

  const data = buildCertificateData({ patient, client, clinic, vet, vaccinations, protocols, form });
  if (body.preview) return NextResponse.json({ data });

  const { data: seq, error: seqError } = await supabaseAdmin.rpc('next_payment_sequence', { prefix: `HC-${form.exam_date.slice(2, 4)}` });
  if (seqError) return NextResponse.json({ error: seqError.message }, { status: 500 });
  const certificate_number = `HC-${form.exam_date.slice(2, 4)}-${String(seq).padStart(3, '0')}`;
  const { data: row, error } = await supabaseAdmin
    .from('health_certificates')
    .insert([{ certificate_number, patient_id: params.id, vet_id: vet.id, exam_date: form.exam_date, destination: form.destination || null, data, created_by: body.staff_id || null }])
    .select('id, certificate_number')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(row, { status: 201 });
}
