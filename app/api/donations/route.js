// app/api/donations/route.js
// GET  /api/donations  -> every donation, newest received first, each with
//      its running `allocated`/`remaining` balance computed from whichever
//      invoice_payments rows are tagged with its id (see migration 111).
// POST /api/donations  -> log a new donation, auto-assigning the next
//      donation_number for its received_at month (YY-MM-NN, resets every
//      month — see nextDonationNumber below).
//
// Accounting-only (see middleware.js) — donations never come through the
// front desk, so this never needs to be reachable by PIN-only staff.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

const SOURCES = ['nomod', 'paymob', 'paypal', 'bank_transfer'];

function today() {
  return new Date().toISOString().slice(0, 10);
}

// Counts existing donations already numbered in this same YY-MM to find
// the next one — not a DB sequence, since the whole point is that it
// resets to 01 every month rather than ever climbing indefinitely.
async function nextDonationNumber(receivedDate) {
  const d = new Date(`${receivedDate}T00:00:00`);
  const yy = String(d.getFullYear() % 100).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const prefix = `${yy}-${mm}-`;

  const { data, error } = await supabase.from('donations').select('id').like('donation_number', `${prefix}%`);
  if (error) return { error };

  const seq = (data || []).length + 1;
  return { donationNumber: `${prefix}${String(seq).padStart(2, '0')}` };
}

export async function GET() {
  const { data: donations, error } = await supabase
    .from('donations')
    .select('*')
    .order('received_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (donations || []).map((d) => d.id);
  let allocations = [];
  if (ids.length > 0) {
    const { data, error: allocError } = await supabase
      .from('invoice_payments')
      .select('donation_id, amount')
      .in('donation_id', ids);
    if (allocError) return NextResponse.json({ error: allocError.message }, { status: 500 });
    allocations = data || [];
  }

  const allocatedByDonation = {};
  for (const a of allocations) {
    allocatedByDonation[a.donation_id] = (allocatedByDonation[a.donation_id] || 0) + Number(a.amount);
  }

  const result = (donations || []).map((d) => {
    const allocated = Math.round((allocatedByDonation[d.id] || 0) * 100) / 100;
    return { ...d, allocated, remaining: Math.round((Number(d.amount) - allocated) * 100) / 100 };
  });

  return NextResponse.json(result);
}

export async function POST(request) {
  const body = await request.json();
  const { donor_name, donor_contact, amount, source, received_at, notes } = body;

  const numericAmount = Number(amount);
  if (!numericAmount || Number.isNaN(numericAmount) || numericAmount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
  }
  if (!source || !SOURCES.includes(source)) {
    return NextResponse.json({ error: `source must be one of ${SOURCES.join(', ')}` }, { status: 400 });
  }

  const receivedDate = received_at || today();

  // A unique-violation retry, not a lock — this is an accountant-only,
  // low-traffic form, but two tabs open at once should still never produce
  // a duplicate donation_number.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { donationNumber, error: numberError } = await nextDonationNumber(receivedDate);
    if (numberError) return NextResponse.json({ error: numberError.message }, { status: 500 });

    const { data, error } = await supabaseAdmin
      .from('donations')
      .insert([
        {
          donation_number: donationNumber,
          donor_name: donor_name || null,
          donor_contact: donor_contact || null,
          amount: Math.round(numericAmount * 100) / 100,
          source,
          received_at: receivedDate,
          notes: notes || null,
        },
      ])
      .select()
      .single();

    if (!error) return NextResponse.json({ ...data, allocated: 0, remaining: Number(data.amount) }, { status: 201 });
    if (error.code !== '23505') return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { error: 'Failed to generate a unique donation number — please try again' },
    { status: 500 }
  );
}
