// app/api/patients/[id]/prescriptions/route.js
// Staff only. Prescriptions for an outside pharmacy (migration 249).
// GET  -> this patient's prescriptions, newest first, with the vet's name
// POST { vet_id, items, notes } -> saves one (lib/prescriptions.js checks
//      the medicines). With a clinic prescribing vet set (migration 252)
//      it's always in their name, whatever vet_id says; the PDF is GET /api/prescriptions/:id/pdf.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { cleanRxItems } from '@/lib/prescriptions';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { data, error } = await supabaseAdmin
    .from('prescriptions')
    .select('id, rx_number, items, notes, created_at, vet_id, staff:vet_id(full_name)')
    .eq('patient_id', params.id)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const { items, error: invalid } = cleanRxItems(body.items);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  const { data: clinic } = await supabaseAdmin.from('clinic_settings').select('prescribing_vet_id').eq('id', true).maybeSingle();
  const vetId = clinic?.prescribing_vet_id || body.vet_id;
  if (!vetId) return NextResponse.json({ error: 'Choose the prescribing vet' }, { status: 400 });

  const [{ data: patient }, { data: vet }] = await Promise.all([
    supabaseAdmin.from('patients').select('id, client_id, current_weight_kg').eq('id', params.id).maybeSingle(),
    supabaseAdmin.from('staff').select('id, role').eq('id', vetId).maybeSingle(),
  ]);
  if (!patient) return NextResponse.json({ error: 'patient not found' }, { status: 404 });
  if (!vet || vet.role !== 'vet') return NextResponse.json({ error: 'Only a vet can prescribe' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('prescriptions')
    .insert([{
      patient_id: patient.id,
      client_id: patient.client_id,
      vet_id: vet.id,
      items,
      notes: String(body.notes || '').trim().slice(0, 1000) || null,
      weight_kg: patient.current_weight_kg ?? null,
    }])
    .select('id, rx_number, items, notes, created_at, vet_id, staff:vet_id(full_name)')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
