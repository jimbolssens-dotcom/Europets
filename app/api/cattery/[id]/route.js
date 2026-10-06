// app/api/cattery/[id]/route.js
// GET   -> one cattery booking with its daily logs. Staff, or the
//          logged-in client-app owner of this booking only (see middleware.js
//          CLIENT_APP_READ_PATTERNS: the path is open GET-only, this route
//          does the real check). Owners get the owner view: the
//          staff-internal booking notes and each day's internal comments are
//          stripped. There's deliberately no public link to a stay: owners
//          see it in the client app (app/client-app/cattery/[id]).
// PATCH -> staff: update dates, space, status (check in / check out /
//          cancel), treatments or notes. Moving dates/space re-checks that
//          the space is free. For a client's request (status 'requested',
//          migration 170): { action: 'approve' } (optionally with changed
//          space/dates) confirms it as 'booked', sends the cattery consent
//          form on WhatsApp and tells the client; { action: 'decline',
//          decline_reason } declines it and tells the client why.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isStaffRequest } from '@/lib/staffAuth';
import { getClientSession } from '@/lib/clientAppAuth';
import { findSpaceClash, validateBookingInput, notifyCatteryClient } from '@/lib/catteryServer';
import { createConsentFormRequest } from '@/lib/consentForms';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const EDITABLE = [
  'space_number',
  'date_in',
  'date_out',
  'status',
  'deworming_done',
  'deworming_product',
  'external_parasite_done',
  'external_parasite_product',
  'notes',
];
const STATUSES = ['booked', 'checked_in', 'checked_out', 'cancelled'];

function prettyDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export async function GET(request, { params }) {
  const { data, error } = await supabase
    .from('cattery_bookings')
    .select('*, patients(id, name, species, patient_number, sex, breed), clients(id, full_name, phone, client_number), cattery_daily_logs(*)')
    .eq('id', params.id)
    .single();
  if (error || !data) return NextResponse.json({ error: 'booking not found' }, { status: 404 });

  data.cattery_daily_logs = (data.cattery_daily_logs || []).sort((a, b) => a.log_date.localeCompare(b.log_date));
  if (!(await isStaffRequest(request))) {
    const sessionClientId = await getClientSession(request);
    if (!sessionClientId || sessionClientId !== data.client_id) {
      return NextResponse.json({ error: 'booking not found' }, { status: 404 });
    }
    delete data.notes;
    if (data.clients) data.clients = { id: data.clients.id, full_name: data.clients.full_name };
    data.cattery_daily_logs = data.cattery_daily_logs.map(({ comments, recorded_by, ...owner }) => owner);
  } else {
    // Staff see where the cattery consent form stands (sent automatically
    // when the booking was made, see POST /api/cattery).
    const { data: requests } = await supabase
      .from('consent_form_requests')
      .select('id, status, created_at')
      .eq('cattery_booking_id', params.id)
      .order('created_at', { ascending: false });
    data.consent_requests = requests || [];
  }
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const { data: current, error: readError } = await supabaseAdmin.from('cattery_bookings').select('*').eq('id', params.id).single();
  if (readError || !current) return NextResponse.json({ error: 'booking not found' }, { status: 404 });

  const action = body.action;
  if (action && current.status !== 'requested') {
    return NextResponse.json({ error: 'This request has already been answered or has expired.' }, { status: 409 });
  }
  if (action === 'decline') {
    const reason = typeof body.decline_reason === 'string' ? body.decline_reason.trim() : '';
    if (!reason) return NextResponse.json({ error: 'Add a short reason for the client.' }, { status: 400 });
    const { data, error } = await supabaseAdmin
      .from('cattery_bookings')
      .update({ status: 'declined', decline_reason: reason, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select('*, patients(name)')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await notifyCatteryClient(data, {
      title: `Cattery request for ${data.patients?.name || 'your cat'} not confirmed`,
      body: `Sorry, we can't confirm ${prettyDate(data.date_in)} to ${prettyDate(data.date_out)}: ${reason}`,
    });
    return NextResponse.json(data);
  }

  const update = { updated_at: new Date().toISOString() };
  for (const key of EDITABLE) if (key in body) update[key] = body[key];
  if (action === 'approve') {
    update.status = 'booked';
    update.approved_at = new Date().toISOString();
    update.request_expires_at = null;
  } else if (action) {
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  }
  if ('status' in update && !STATUSES.includes(update.status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 });
  }
  if ('space_number' in update) update.space_number = Number(update.space_number);

  const next = { ...current, ...update };
  if (action === 'approve' || 'space_number' in body || 'date_in' in body || 'date_out' in body || (update.status && update.status !== 'cancelled' && current.status === 'cancelled')) {
    const invalid = validateBookingInput(next);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
    const clash = await findSpaceClash({ spaceNumber: next.space_number, dateIn: next.date_in, dateOut: next.date_out, ignoreId: params.id });
    if (clash) {
      return NextResponse.json(
        { error: `Space ${next.space_number} is already booked for ${clash.patients?.name || 'another cat'} (${clash.date_in} to ${clash.date_out}).` },
        { status: 409 }
      );
    }
  }

  const { data, error } = await supabaseAdmin.from('cattery_bookings').update(update).eq('id', params.id).select('*, patients(name)').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (action === 'approve') {
    // Same as a staff-made booking from here on: the consent form goes out
    // automatically, then the client is told it's confirmed.
    const consent = await createConsentFormRequest({ catteryBookingId: data.id, formType: 'cattery' }).catch((err) => ({ error: err.message }));
    await notifyCatteryClient(data, {
      title: `Cattery stay for ${data.patients?.name || 'your cat'} confirmed`,
      body: `Space ${data.space_number}, ${prettyDate(data.date_in)} to ${prettyDate(data.date_out)}. Please sign the cattery consent form we've sent you on WhatsApp.`,
    });
    return NextResponse.json({ ...data, consent: consent?.error ? { error: consent.error } : { whatsapp: consent.whatsapp } });
  }
  return NextResponse.json(data);
}
