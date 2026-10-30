// app/api/invoices/route.js
// GET  /api/invoices?client_id=X&status=unpaid&visit_id=Y&hospitalization_id=Z  -> list invoices
//      status accepts a comma-separated list (e.g. status=unpaid,partially_paid)
//      ?invoice_no=&client_no=&patient_no=&name=&phone=&date=&item=&amount=
//      -> the Invoices page's search fields (lib/invoiceSearch.js), each
//      matching only its own thing; ?q=... the older single box. Every
//      invoice matching all of them, whatever its status, newest first
//      (at most SEARCH_LIMIT). Staff only.
// POST /api/invoices                            -> open a new (empty) invoice
//
// An invoice can be tied to a visit (visit_id) or a hospitalization
// (hospitalization_id) for context, or stand alone (e.g. a product-only
// sale). Line items are added afterwards via /api/invoices/:id/line-items,
// which recompute the totals.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { selectAll } from '@/lib/selectAll';
import { NextResponse } from 'next/server';
import { isStaffRequest } from '@/lib/staffAuth';
import { getClientSession } from '@/lib/clientAppAuth';
import { parseInvoiceSearch, fieldSearchTerms, INVOICE_SEARCH_FIELDS } from '@/lib/invoiceSearch';
import { searchInvoiceIds } from '@/lib/invoiceSearchServer';

const SEARCH_LIMIT = 300;
const LIST_SELECT =
  '*, clients(full_name, phone, email, client_number), visits(patient_id, patients(name, patient_number)), hospitalizations(patient_id, patients(name, patient_number))';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('client_id');
  const status = searchParams.get('status');
  const visitId = searchParams.get('visit_id');
  const hospitalizationId = searchParams.get('hospitalization_id');
  // ?limit=N: only the N newest (the Invoices page's Paid / Void / All
  // views, which would otherwise send every invoice ever made).
  const limit = Math.max(0, Math.min(1000, Number(searchParams.get('limit')) || 0));

  // Reachable without the staff PIN now (the client app's own Invoices
  // tab — see middleware.js) — a non-staff caller must be asking for
  // their own invoices, never the broad staff queries (e.g. status=unpaid
  // with no client_id) this same route also serves.
  if (!(await isStaffRequest(request))) {
    const sessionClientId = await getClientSession(request);
    if (!clientId || sessionClientId !== clientId) {
      return NextResponse.json({ error: 'not authorized' }, { status: 403 });
    }
  }

  const q = (searchParams.get('q') || '').trim();
  const fields = Object.fromEntries(INVOICE_SEARCH_FIELDS.map(({ key }) => [key, (searchParams.get(key) || '').trim()]));
  const byField = Object.values(fields).some(Boolean);
  if (q || byField) {
    // Every client's invoices: never for the client app's own session.
    if (!(await isStaffRequest(request))) return NextResponse.json({ error: 'not authorized' }, { status: 403 });
    const ids = await searchInvoiceIds(supabase, byField ? fieldSearchTerms(fields) : parseInvoiceSearch(q));
    if (ids !== null) {
      const rows = [];
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await supabase.from('invoices').select(LIST_SELECT).in('id', ids.slice(i, i + 200));
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        rows.push(...(data || []));
      }
      rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      return NextResponse.json(rows.slice(0, SEARCH_LIMIT), { headers: { 'X-Total-Matches': String(rows.length) } });
    }
  }

  const buildQuery = () => {
    let query = supabase
      .from('invoices')
      .select(LIST_SELECT)
      .order('created_at', { ascending: false });

    if (clientId) query = query.eq('client_id', clientId);
    if (status) {
      const statuses = status.split(',').map((s) => s.trim()).filter(Boolean);
      query = statuses.length > 1 ? query.in('status', statuses) : query.eq('status', statuses[0]);
    }
    if (visitId) query = query.eq('visit_id', visitId);
    if (hospitalizationId) query = query.eq('hospitalization_id', hospitalizationId);
    return query.order('id');
  };

  // Paged (lib/selectAll.js): a single request stops at 1000 rows.
  const { data, error } = limit ? await buildQuery().limit(limit) : await selectAll(buildQuery);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json();
  let { client_id, visit_id } = body;

  if (visit_id && !client_id) {
    const { data: visit, error: visitError } = await supabase
      .from('visits')
      .select('client_id')
      .eq('id', visit_id)
      .single();

    if (visitError || !visit) {
      return NextResponse.json({ error: 'visit not found' }, { status: 400 });
    }
    client_id = visit.client_id;
  }

  if (!client_id) {
    return NextResponse.json(
      { error: 'client_id is required (directly, or via visit_id)' },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from('invoices')
    .insert([{ client_id, visit_id: visit_id || null }])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
