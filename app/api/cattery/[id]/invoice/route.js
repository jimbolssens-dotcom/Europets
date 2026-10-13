// app/api/cattery/[id]/invoice/route.js
// Staff only (not in middleware's client-app patterns).
// GET  -> the booking's invoice (if linked) and the owner's other invoices
//         that aren't linked to a stay yet, to pick from.
// POST {}              -> create the stay's invoice: one boarding line per
//                         cat for the nights booked (a shared bungalow's
//                         cats included, see migration 183). Every cat of the same
//                         owner staying over the same dates without an
//                         invoice goes on it too: the first at "Boarding -
//                         Cattery", each further cat at "Boarding - Cattery
//                         (2nd)". All those bookings are linked to it.
// POST { invoice_id }  -> link an invoice that already exists (e.g. one
//                         made by hand before this button existed).
// POST { invoice_id: null } -> unlink.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { recomputeInvoiceTotals } from '@/lib/invoicing';
import { bookingDays, rangesOverlap } from '@/lib/cattery';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const FIRST_CAT = 'Boarding - Cattery';
const EXTRA_CAT = 'Boarding - Cattery (2nd)';
const NOT_STAYING = ['cancelled', 'declined', 'expired', 'requested'];

// date_in and date_out are both days in the cattery, so a 5 to 13 Nov
// stay is 8 nights.
function nights(b) {
  return Math.max(1, bookingDays(b.date_in, b.date_out).length - 1);
}

function shortDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

async function loadBooking(id) {
  const { data } = await supabase
    .from('cattery_bookings')
    .select('id, client_id, patient_id, date_in, date_out, status, invoice_id, patients(name), cattery_booking_cats(patient_id, patients(name))')
    .eq('id', id)
    .single();
  return data;
}

export async function GET(request, { params }) {
  const booking = await loadBooking(params.id);
  if (!booking) return NextResponse.json({ error: 'booking not found' }, { status: 404 });

  const [{ data: invoices }, { data: linked }] = await Promise.all([
    supabase
      .from('invoices')
      .select('id, invoice_number, status, total, amount_paid, created_at')
      .eq('client_id', booking.client_id)
      .neq('status', 'void')
      .order('created_at', { ascending: false }),
    supabase.from('cattery_bookings').select('invoice_id').eq('client_id', booking.client_id).not('invoice_id', 'is', null),
  ]);
  const taken = new Set((linked || []).map((b) => b.invoice_id));
  const all = invoices || [];
  return NextResponse.json({
    invoice: all.find((inv) => inv.id === booking.invoice_id) || null,
    choices: all.filter((inv) => !taken.has(inv.id)),
  });
}

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const booking = await loadBooking(params.id);
  if (!booking) return NextResponse.json({ error: 'booking not found' }, { status: 404 });

  if ('invoice_id' in body) {
    if (body.invoice_id) {
      const { data: inv } = await supabase.from('invoices').select('id, client_id').eq('id', body.invoice_id).single();
      if (!inv) return NextResponse.json({ error: 'invoice not found' }, { status: 404 });
      if (inv.client_id !== booking.client_id) {
        return NextResponse.json({ error: 'That invoice belongs to a different client' }, { status: 400 });
      }
    }
    const { error } = await supabaseAdmin
      .from('cattery_bookings')
      .update({ invoice_id: body.invoice_id || null })
      .eq('id', booking.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ invoice_id: body.invoice_id || null });
  }

  if (booking.invoice_id) return NextResponse.json({ invoice_id: booking.invoice_id, existing: true });
  if (NOT_STAYING.includes(booking.status)) {
    return NextResponse.json({ error: `A ${booking.status} booking can't be invoiced` }, { status: 400 });
  }

  // The owner's other cats staying over the same dates, not billed yet.
  const { data: siblings } = await supabase
    .from('cattery_bookings')
    .select('id, date_in, date_out, status, invoice_id, patient_id, patients(name)')
    .eq('client_id', booking.client_id)
    .is('invoice_id', null)
    .neq('id', booking.id);
  // A shared bungalow's other cats (migration 183) are on this booking
  // itself: same dates, billed at the further-cat rate.
  const together = [
    booking,
    ...(booking.cattery_booking_cats || []).map((c) => ({ ...booking, patient_id: c.patient_id, patients: c.patients })),
  ];
  for (const b of siblings || []) {
    if (NOT_STAYING.includes(b.status)) continue;
    if (!rangesOverlap(b.date_in, b.date_out, booking.date_in, booking.date_out)) continue;
    if (together.some((t) => t.patient_id === b.patient_id)) continue;
    together.push(b);
  }

  const { data: items } = await supabase
    .from('goods_services')
    .select('id, name, base_price')
    .in('name', [FIRST_CAT, EXTRA_CAT]);
  const first = (items || []).find((i) => i.name === FIRST_CAT);
  const extra = (items || []).find((i) => i.name === EXTRA_CAT) || first;
  if (!first) return NextResponse.json({ error: `"${FIRST_CAT}" is missing from the price list` }, { status: 500 });

  const { data: invoice, error: invoiceError } = await supabaseAdmin
    .from('invoices')
    .insert([{ client_id: booking.client_id }])
    .select()
    .single();
  if (invoiceError) return NextResponse.json({ error: invoiceError.message }, { status: 500 });

  const lines = together.map((b, i) => {
    const item = i === 0 ? first : extra;
    const qty = nights(b);
    const unit_price = Number(item.base_price);
    return {
      invoice_id: invoice.id,
      goods_service_id: item.id,
      description: `${item.name}: ${b.patients?.name || 'cat'} (${shortDate(b.date_in)} to ${shortDate(b.date_out)})`,
      quantity: qty,
      unit_price,
      line_total: Math.round(unit_price * qty * 100) / 100,
    };
  });
  const { error: linesError } = await supabaseAdmin.from('invoice_line_items').insert(lines);
  if (linesError) return NextResponse.json({ error: linesError.message }, { status: 500 });
  await recomputeInvoiceTotals(supabase, invoice.id);

  const { error: linkError } = await supabaseAdmin
    .from('cattery_bookings')
    .update({ invoice_id: invoice.id })
    .in('id', [...new Set(together.map((b) => b.id))]);
  if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 });

  return NextResponse.json({ invoice_id: invoice.id, cats: together.length }, { status: 201 });
}
