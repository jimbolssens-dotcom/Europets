// app/api/patients/[id]/deworming/route.js
// GET   -> this patient's deworming reminder: { intervalMonths (3 | 6 |
//          null), lastDate, lastDateSource ('set' | 'invoice'), nextDue,
//          remindedFor }
// PATCH { interval_months, last_date } -> turn it on (3 or 6), off (null)
//          or change the last deworming date. Turning it on with no
//          deworming known counts from today. See lib/deworming.js.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { dubaiLocalDateString } from '@/lib/dubaiTime';
import { DEWORM_INTERVALS, lastDeworming, nextDewormingDue } from '@/lib/deworming';
import { invoiceDewormingDates } from '@/lib/dewormingReminders';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function state(id) {
  const { data: p, error } = await supabaseAdmin
    .from('patients')
    .select('id, deworm_interval_months, deworm_last_date, deworm_reminded_for, deworm_reminder_sent_at')
    .eq('id', id)
    .single();
  if (error || !p) return { error: 'patient not found' };
  const invoiceDate = (await invoiceDewormingDates(supabaseAdmin, [id]))[id] || null;
  const lastDate = lastDeworming(p.deworm_last_date, invoiceDate);
  return {
    intervalMonths: p.deworm_interval_months,
    lastDate,
    lastDateSource: lastDate && lastDate === invoiceDate && lastDate !== p.deworm_last_date ? 'invoice' : lastDate ? 'set' : null,
    nextDue: nextDewormingDue({ intervalMonths: p.deworm_interval_months, lastDate, today: dubaiLocalDateString() }),
    remindedFor: p.deworm_reminded_for,
    reminderSentAt: p.deworm_reminder_sent_at,
  };
}

export async function GET(request, { params }) {
  try {
    const s = await state(params.id);
    return NextResponse.json(s, { status: s.error ? 404 : 200 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const update = {};
  if ('interval_months' in body) {
    const v = body.interval_months == null ? null : Number(body.interval_months);
    if (v !== null && !DEWORM_INTERVALS.includes(v)) {
      return NextResponse.json({ error: 'Choose every 3 or 6 months' }, { status: 400 });
    }
    update.deworm_interval_months = v;
  }
  if ('last_date' in body) {
    if (body.last_date && !/^\d{4}-\d{2}-\d{2}$/.test(body.last_date)) {
      return NextResponse.json({ error: 'Last deworming must be a date' }, { status: 400 });
    }
    update.deworm_last_date = body.last_date || null;
  }
  try {
    if (update.deworm_interval_months && !('deworm_last_date' in update)) {
      const current = await state(params.id);
      if (current.error) return NextResponse.json(current, { status: 404 });
      if (!current.lastDate) update.deworm_last_date = dubaiLocalDateString();
    }
    const { error } = await supabaseAdmin.from('patients').update(update).eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(await state(params.id));
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
