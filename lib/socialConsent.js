// lib/socialConsent.js
// The owner's answer to "may we share photos and videos of your pet on
// Instagram and Facebook?" (clients.social_media_consent, migration 201).
// Asked as a tick on the intake form and on every consent form; staff can
// also set it on the client page.
//
// A tick only ever adds a yes. Leaving it unticked records a no only when
// nothing was on file: an owner who said yes before and skips the optional
// tick on a surgery form hasn't changed their mind. Taking a yes back is
// done by staff on the client page.

import { supabaseAdmin } from './supabaseAdmin.js';

// The new value to store, or undefined for no change.
export function nextSocialConsent(current, ticked) {
  if (ticked === true) return current === true ? undefined : true;
  if (ticked === false) return current == null ? false : undefined;
  return undefined;
}

// Best-effort: never fails the form it came with.
export async function applySocialConsent(clientId, ticked, source) {
  if (!clientId || typeof ticked !== 'boolean') return;
  try {
    const { data } = await supabaseAdmin.from('clients').select('social_media_consent').eq('id', clientId).maybeSingle();
    const next = nextSocialConsent(data?.social_media_consent ?? null, ticked);
    if (next === undefined) return;
    await supabaseAdmin
      .from('clients')
      .update({ social_media_consent: next, social_media_consent_at: new Date().toISOString(), social_media_consent_source: source })
      .eq('id', clientId);
  } catch (err) {
    console.error('Failed to save social media consent', clientId, err);
  }
}

