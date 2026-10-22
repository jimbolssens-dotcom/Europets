// lib/clientPayLinks.js
// A client's personal payment link (migration 213): made from the client's
// page in the admin app, paid on the website (website/app/pay/[token]).

import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { websiteUrl } from '@/lib/invoiceReminders';

const TOKEN_CHARS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newToken(length = 12) {
  const bytes = crypto.randomBytes(length);
  return [...bytes].map((b) => TOKEN_CHARS[b % TOKEN_CHARS.length]).join('');
}

export function payLinkUrl(token) {
  return `${websiteUrl()}/pay/${token}`;
}

export async function activePayLink(clientId) {
  return supabaseAdmin.from('client_payment_links').select('id, token, patient_id, created_at, patients(name)').eq('client_id', clientId).eq('active', true).maybeSingle();
}

// The client's live link, made if there isn't one. fresh: turn the old one
// off first (it stops taking payments) and make a new one, e.g. if a link
// went somewhere it shouldn't. patientId sets the pet it's shown as for.
export async function getOrCreatePayLink(clientId, { patientId = undefined, staffId = null, fresh = false } = {}) {
  const { data: current, error } = await activePayLink(clientId);
  if (error) return { error };
  if (current && !fresh) {
    if (patientId === undefined || (patientId || null) === (current.patient_id || null)) return { data: current };
    const { data, error: updateError } = await supabaseAdmin
      .from('client_payment_links')
      .update({ patient_id: patientId || null })
      .eq('id', current.id)
      .select('id, token, patient_id, created_at, patients(name)')
      .single();
    return updateError ? { error: updateError } : { data };
  }
  if (current) await supabaseAdmin.from('client_payment_links').update({ active: false }).eq('id', current.id);
  const { data, error: insertError } = await supabaseAdmin
    .from('client_payment_links')
    .insert([{ token: newToken(), client_id: clientId, patient_id: patientId || current?.patient_id || null, created_by: staffId || null }])
    .select('id, token, patient_id, created_at, patients(name)')
    .single();
  return insertError ? { error: insertError } : { data };
}
