// app/api/patients/[id]/transfer/route.js
// Transfer a patient to another owner (migration 181), keeping the same
// patient and patient number. Staff only.
//
// GET  ?to=<client id>  -> preview: who it moves from/to, how much history
//                          moves, and the pet's unpaid invoices (the bills
//                          staff choose to keep with the old owner or move)
// GET                   -> this patient's earlier transfers (for the
//                          "Previous owner" line on the patient page)
// POST { to_client_id, move_unpaid_invoices, staff_id? } -> does it, all
//                          in one transaction (transfer_patient())

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';
import { isStaffRequest } from '@/lib/staffAuth';
import { balanceDue, invoiceLabel, money } from '@/lib/paymentReminders';

async function petRecordIds(patientId) {
  const [{ data: visits }, { data: stays }] = await Promise.all([
    supabaseAdmin.from('visits').select('id').eq('patient_id', patientId),
    supabaseAdmin.from('hospitalizations').select('id').eq('patient_id', patientId),
  ]);
  return { visitIds: (visits || []).map((v) => v.id), stayIds: (stays || []).map((h) => h.id) };
}

export async function GET(request, { params }) {
  if (!(await isStaffRequest(request))) return NextResponse.json({ error: 'staff only' }, { status: 403 });
  const { id } = await params;
  const to = new URL(request.url).searchParams.get('to');

  if (!to) {
    const { data, error } = await supabaseAdmin
      .from('patient_owner_transfers')
      .select('id, created_at, moved_unpaid_invoices, from:from_client_id(id, full_name, client_number), to:to_client_id(id, full_name, client_number), staff(full_name)')
      .eq('patient_id', id)
      .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data || []);
  }

  const { data: patient } = await supabaseAdmin
    .from('patients')
    .select('id, name, patient_number, client_id, clients(id, full_name, client_number)')
    .eq('id', id)
    .maybeSingle();
  if (!patient) return NextResponse.json({ error: 'patient not found' }, { status: 404 });
  const { data: newOwner } = await supabaseAdmin.from('clients').select('id, full_name, client_number').eq('id', to).maybeSingle();
  if (!newOwner) return NextResponse.json({ error: 'new owner not found' }, { status: 404 });

  const { visitIds, stayIds } = await petRecordIds(id);
  const invoiceFilters = [];
  if (visitIds.length) invoiceFilters.push(`visit_id.in.(${visitIds.join(',')})`);
  if (stayIds.length) invoiceFilters.push(`hospitalization_id.in.(${stayIds.join(',')})`);
  let unpaid = [];
  let paidCount = 0;
  if (invoiceFilters.length) {
    const { data: invoices } = await supabaseAdmin
      .from('invoices')
      .select('id, invoice_number, total, amount_paid, status')
      .eq('client_id', patient.client_id)
      .neq('status', 'void')
      .or(invoiceFilters.join(','));
    for (const inv of invoices || []) {
      if (inv.status === 'unpaid' || inv.status === 'partially_paid') unpaid.push(inv);
      else paidCount += 1;
    }
  }
  const [{ count: appointments }, { count: vaccinations }] = await Promise.all([
    supabaseAdmin.from('appointments').select('id', { count: 'exact', head: true }).eq('patient_id', id),
    supabaseAdmin.from('vaccinations').select('id', { count: 'exact', head: true }).eq('patient_id', id),
  ]);

  return NextResponse.json({
    patient: { id: patient.id, name: patient.name, patient_number: patient.patient_number },
    from: patient.clients,
    to: newOwner,
    sameOwner: patient.client_id === newOwner.id,
    moves: { consults: visitIds.length, stays: stayIds.length, appointments: appointments || 0, vaccinations: vaccinations || 0 },
    paidInvoices: paidCount,
    unpaidInvoices: unpaid.map((inv) => ({ id: inv.id, label: invoiceLabel(inv), due: `AED ${money(balanceDue(inv))}` })),
    unpaidTotal: `AED ${money(unpaid.reduce((sum, inv) => sum + balanceDue(inv), 0))}`,
  });
}

export async function POST(request, { params }) {
  if (!(await isStaffRequest(request))) return NextResponse.json({ error: 'staff only' }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  if (!body.to_client_id) return NextResponse.json({ error: 'to_client_id is required' }, { status: 400 });
  const { data, error } = await supabaseAdmin.rpc('transfer_patient', {
    p_patient: id,
    p_new_client: body.to_client_id,
    p_move_unpaid: body.move_unpaid_invoices === true,
    p_staff: body.staff_id || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
