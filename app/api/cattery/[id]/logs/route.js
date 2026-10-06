// app/api/cattery/[id]/logs/route.js
// PUT -> staff: save one day of a cattery booking's daily sheet
//        { log_date, weight_kg?, food_am?, food_pm?, litter?, checked?,
//          comments?, update_for_owner?, recorded_by? } — one row per
//        booking per day (upsert on booking_id + log_date). Returns the
//        saved row, whose id is what that day's photos attach to
//        (attachments.entity_type 'cattery_log').
//
//        When the owner update text is newly added or changed, the client
//        gets a push notification (if they've turned them on in the client
//        app) that opens this stay in the client app.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendPushToClient } from '@/lib/pushNotifications';
import { withoutDashes } from '@/lib/noDashes';
import { NextResponse } from 'next/server';

const FIELDS = ['weight_kg', 'food_am', 'food_pm', 'litter', 'checked', 'comments', 'update_for_owner', 'recorded_by'];

export async function PUT(request, { params }) {
  const body = await request.json().catch(() => ({}));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.log_date || '')) {
    return NextResponse.json({ error: 'log_date is required' }, { status: 400 });
  }

  const { data: booking } = await supabaseAdmin
    .from('cattery_bookings')
    .select('id, client_id, date_in, date_out, patients(name)')
    .eq('id', params.id)
    .single();
  if (!booking) return NextResponse.json({ error: 'booking not found' }, { status: 404 });

  const { data: existing } = await supabaseAdmin
    .from('cattery_daily_logs')
    .select('*')
    .eq('booking_id', params.id)
    .eq('log_date', body.log_date)
    .maybeSingle();

  const row = { booking_id: params.id, log_date: body.log_date, updated_at: new Date().toISOString() };
  for (const key of FIELDS) {
    if (!(key in body)) continue;
    let value = body[key];
    if (key === 'weight_kg') {
      value = value === '' || value === null ? null : Number(value);
      if (value !== null && !(value > 0 && value < 100)) {
        return NextResponse.json({ error: 'Weight must be a number of kg, e.g. 4.25' }, { status: 400 });
      }
    } else if (key === 'checked') {
      value = Boolean(value);
    } else if (typeof value === 'string') {
      value = value.trim() || null;
      // Owner-facing text follows the same no-long-dash rule as every
      // other client message (see lib/noDashes.js).
      if (key === 'update_for_owner' && value) value = withoutDashes(value);
    }
    row[key] = value;
  }

  const { data, error } = await supabaseAdmin
    .from('cattery_daily_logs')
    .upsert([{ ...(existing || {}), ...row }], { onConflict: 'booking_id,log_date' })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ownerUpdateChanged = data.update_for_owner && data.update_for_owner !== existing?.update_for_owner;
  if (ownerUpdateChanged && booking.client_id) {
    sendPushToClient(booking.client_id, {
      title: `Cattery update for ${booking.patients?.name || 'your cat'}`,
      body: data.update_for_owner.slice(0, 140),
      url: `/client-app/cattery/${booking.id}`,
    }).catch((err) => console.error('Cattery update push failed', booking.id, err));
  }

  return NextResponse.json(data);
}
