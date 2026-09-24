// lib/hospitalizationPortalLink.js
// Server-only: sends an admission's client portal link ("here's the live
// care-update page") over WhatsApp from the clinic's own WhatsApp Business
// number, via the pre-approved hospitalization_portal_link template (see
// lib/metaWhatsapp.js's sendHospitalizationPortalLink). Shared by the
// manual "Share" button (POST /api/hospitalizations/:id/send-portal-link)
// and the automatic send fired the moment a consent form for this
// admission comes back signed (see POST /api/consent-form-requests/[id]).
//
// Idempotent: does nothing (and reports back {sent:false, reason:'already
// sent'}) once portal_link_shared_at is already set, so signing a second
// consent form for the same admission — or a stray retry — never
// double-sends.

import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendHospitalizationPortalLink } from '@/lib/metaWhatsapp';

export async function sendHospitalizationPortalLinkForAdmission(hospitalizationId) {
  const { data: admission, error } = await supabase
    .from('hospitalizations')
    .select('id, portal_link_shared_at, patients(name), clients(id, full_name, phone)')
    .eq('id', hospitalizationId)
    .single();
  if (error || !admission) {
    return { sent: false, reason: 'admission not found' };
  }
  if (admission.portal_link_shared_at) {
    return { sent: false, reason: 'already sent' };
  }

  const digits = (admission.clients?.phone || '').replace(/\D/g, '');
  if (!digits) {
    return { sent: false, reason: 'no phone number on file for this client' };
  }
  if (!process.env.APP_URL) {
    return { sent: false, reason: 'APP_URL is not configured' };
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
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}
