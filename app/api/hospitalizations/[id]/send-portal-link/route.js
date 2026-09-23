// app/api/hospitalizations/[id]/send-portal-link/route.js
// POST /api/hospitalizations/:id/send-portal-link -> sends this
// admission's client portal link ("here's the live care-update page")
// over WhatsApp from the clinic's own WhatsApp Business number, via a
// pre-approved template (see lib/metaWhatsapp.js's
// sendHospitalizationPortalLink) — never staff's own personal WhatsApp,
// which is what the "Share" button on the hospitalization page used to
// open instead (see lib/whatsapp.js's openWhatsApp, still used there as
// the fallback when this fails).
//
// Best-effort: the send failing (template not approved yet, no phone on
// file, ...) is reported back rather than thrown, so the page can fall
// back to the old manual-share flow instead of leaving staff with no way
// to get the link to the client at all.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendHospitalizationPortalLink } from '@/lib/metaWhatsapp';
import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  const { data: admission, error } = await supabase
    .from('hospitalizations')
    .select('id, patients(name), clients(id, full_name, phone)')
    .eq('id', params.id)
    .single();
  if (error || !admission) {
    return NextResponse.json({ error: 'admission not found' }, { status: 404 });
  }

  const digits = (admission.clients?.phone || '').replace(/\D/g, '');
  if (!digits) {
    return NextResponse.json({ sent: false, reason: 'no phone number on file for this client' });
  }
  if (!process.env.APP_URL) {
    return NextResponse.json({ sent: false, reason: 'APP_URL is not configured' });
  }

  const portalUrl = `${process.env.APP_URL}/portal/hospitalization/${admission.id}`;

  try {
    const waMessageId = await sendHospitalizationPortalLink(digits, {
      clientName: admission.clients.full_name,
      patientName: admission.patients?.name,
      portalUrl,
    });
    await supabaseAdmin.from('client_messages').insert([
      {
        client_id: admission.clients.id,
        phone: digits,
        channel: 'whatsapp',
        sender: 'staff',
        body: `Care-update link sent: ${portalUrl}`,
        wa_message_id: waMessageId,
        status: 'sent',
      },
    ]);
    await supabaseAdmin.from('hospitalizations').update({ portal_link_shared_at: new Date().toISOString() }).eq('id', admission.id);
    return NextResponse.json({ sent: true });
  } catch (err) {
    return NextResponse.json({ sent: false, reason: err.message });
  }
}
