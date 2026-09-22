// app/api/vaccinations/send-reminder/route.js
// POST /api/vaccinations/send-reminder  { ids: [uuid, ...] }
//   -> sends one grouped vaccination-due reminder over WhatsApp (see
//      lib/metaWhatsapp.js's sendVaccinationReminder — a pre-approved
//      template, since this has to reach a client regardless of an
//      existing WhatsApp conversation, same as consent-form-requests) and
//      marks every id reminded on success. ids is the same grouping the
//      Vaccination Reminders page already computes (one message per
//      patient+due-date, covering however many vaccines fall on it) — see
//      app/(admin)/vaccinations/page.jsx's groupRows.
//
// Unlike consent-form-requests, the WhatsApp send here IS the point of the
// request (there's no underlying record being created either way), so a
// send failure is a real error, not a best-effort footnote — nothing is
// marked reminded unless it actually sent.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendVaccinationReminder } from '@/lib/metaWhatsapp';
import { NextResponse } from 'next/server';

function listNames(names) {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: 'ids is required' }, { status: 400 });
  }

  const { data: rows, error: rowsError } = await supabase
    .from('vaccinations')
    .select('id, patient_id, vaccine_name, next_due_date')
    .in('id', ids);
  if (rowsError) {
    return NextResponse.json({ error: rowsError.message }, { status: 500 });
  }
  if (!rows || rows.length !== ids.length) {
    return NextResponse.json({ error: 'one or more vaccination records were not found' }, { status: 404 });
  }
  const patientId = rows[0].patient_id;
  if (!rows.every((r) => r.patient_id === patientId)) {
    return NextResponse.json({ error: 'ids must all belong to the same patient' }, { status: 400 });
  }

  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .select('name, clients(id, full_name, phone)')
    .eq('id', patientId)
    .single();
  if (patientError || !patient) {
    return NextResponse.json({ error: 'patient not found' }, { status: 404 });
  }

  const digits = (patient.clients?.phone || '').replace(/\D/g, '');
  if (!digits) {
    return NextResponse.json(
      { error: 'This client has no phone number on file to send a WhatsApp reminder to' },
      { status: 400 }
    );
  }

  const vaccineNames = listNames(rows.map((r) => r.vaccine_name));
  const dueDateLabel = new Date(`${rows[0].next_due_date}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  let waMessageId;
  try {
    waMessageId = await sendVaccinationReminder(digits, {
      clientName: patient.clients?.full_name,
      patientName: patient.name,
      vaccineNames,
      dueDateLabel,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }

  const { error: markError } = await supabaseAdmin
    .from('vaccinations')
    .update({ reminder_sent_at: new Date().toISOString() })
    .in('id', ids);
  if (markError) {
    return NextResponse.json({ error: markError.message }, { status: 500 });
  }

  await supabaseAdmin.from('client_messages').insert([
    {
      client_id: patient.clients.id,
      phone: digits,
      channel: 'whatsapp',
      sender: 'staff',
      body: `Vaccination reminder sent: ${patient.name} — ${vaccineNames} due ${dueDateLabel}`,
      wa_message_id: waMessageId,
      status: 'sent',
    },
  ]);

  return NextResponse.json({ ok: true });
}
