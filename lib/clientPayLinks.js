// lib/clientPayLinks.js
// A client's personal payment link (migration 213): made from the client's
// page in the admin app, paid on the website (website/app/pay/[token]).

import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { websiteUrl } from '@/lib/invoiceReminders';
import { publicUrl } from '@/lib/socialDraft';

const TOKEN_CHARS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newToken(length = 12) {
  const bytes = crypto.randomBytes(length);
  return [...bytes].map((b) => TOKEN_CHARS[b % TOKEN_CHARS.length]).join('');
}

export function payLinkUrl(token) {
  return `${websiteUrl()}/pay/${token}`;
}

// Everything the client page shows about the link, its personalised page
// (migration 214) included.
export const PAY_LINK_FIELDS =
  'id, token, patient_id, created_at, patients(name), page_enabled, page_title, page_story, page_photo_path, page_cover_path, page_story_image_path, instagram_handle, page_instagram, page_instagram_fetched_at, show_supporters, show_bills, page_updated_at';

export async function activePayLink(clientId) {
  return supabaseAdmin.from('client_payment_links').select(PAY_LINK_FIELDS).eq('client_id', clientId).eq('active', true).maybeSingle();
}

// The link as the client page uses it.
export function presentPayLink(link) {
  if (!link) return null;
  const url = (path) => (path ? publicUrl(path) : null);
  return {
    token: link.token,
    url: payLinkUrl(link.token),
    patient_id: link.patient_id,
    patient_name: link.patients?.name || null,
    created_at: link.created_at,
    page: {
      enabled: !!link.page_enabled,
      title: link.page_title || '',
      story: link.page_story || '',
      photo_path: link.page_photo_path || null,
      photo_url: url(link.page_photo_path),
      cover_url: url(link.page_cover_path),
      story_image_url: url(link.page_story_image_path),
      instagram_handle: link.instagram_handle || '',
      instagram: link.page_instagram || null,
      show_supporters: link.show_supporters !== false,
      show_bills: link.show_bills !== false,
    },
  };
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
      .select(PAY_LINK_FIELDS)
      .single();
    return updateError ? { error: updateError } : { data };
  }
  if (current) await supabaseAdmin.from('client_payment_links').update({ active: false }).eq('id', current.id);
  const { data, error: insertError } = await supabaseAdmin
    .from('client_payment_links')
    .insert([
      {
        token: newToken(),
        client_id: clientId,
        patient_id: patientId || current?.patient_id || null,
        created_by: staffId || null,
        // A new link keeps the page; its pictures are drawn again (the Story
        // picture has the link on it).
        ...(current
          ? {
              page_enabled: current.page_enabled,
              page_title: current.page_title,
              page_story: current.page_story,
              page_photo_path: current.page_photo_path,
              instagram_handle: current.instagram_handle,
              page_instagram: current.page_instagram,
              page_instagram_fetched_at: current.page_instagram_fetched_at,
              show_supporters: current.show_supporters,
              show_bills: current.show_bills,
            }
          : {}),
      },
    ])
    .select(PAY_LINK_FIELDS)
    .single();
  return insertError ? { error: insertError } : { data };
}
