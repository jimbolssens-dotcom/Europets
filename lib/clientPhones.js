// lib/clientPhones.js
// Shared validation/sync logic for a client's phones list (see
// client_phones, migrations/055_client_phones) — used by both
// POST /api/clients and PATCH /api/clients/[id], which each replace the
// whole list on save rather than diffing individual rows (the list is
// always small, so this is simpler than tracking per-row adds/edits/
// removes separately).

const MAX_LABEL_LENGTH = 60;

// Validates and cleans up a client's submitted phones list: every entry
// needs a non-blank phone and a mandatory label (a preset or custom
// text — the UI enforces this, this is the server-side backstop), and at
// most one can be flagged as the WhatsApp number. If none is flagged but
// there's at least one number, the first becomes the WhatsApp one — there
// should always be a clear answer once a client has any number on file.
export function normalizeClientPhones(rawPhones) {
  const list = Array.isArray(rawPhones) ? rawPhones : [];
  const cleaned = list
    .map((p) => ({
      phone: String(p?.phone || '').trim(),
      label: String(p?.label || '').trim().slice(0, MAX_LABEL_LENGTH),
      is_whatsapp: Boolean(p?.is_whatsapp),
    }))
    .filter((p) => p.phone);

  for (const p of cleaned) {
    if (!p.label) {
      throw new Error(`"${p.phone}" needs a label`);
    }
  }

  const whatsappCount = cleaned.filter((p) => p.is_whatsapp).length;
  if (whatsappCount > 1) {
    throw new Error('only one number can be the preferred WhatsApp number');
  }
  if (whatsappCount === 0 && cleaned.length > 0) {
    cleaned[0].is_whatsapp = true;
  }

  return cleaned;
}

// Attaches each client's client_phones rows as `.client_phones` (fetched
// separately rather than via a PostgREST embed) so a missing table —
// migrations/055_client_phones not run yet — degrades to an empty list
// per client instead of failing the whole clients query it would
// otherwise be embedded in. Accepts and returns either a single client
// object or an array, mutated in place.
export async function attachClientPhones(supabase, clientOrClients) {
  const list = Array.isArray(clientOrClients) ? clientOrClients : [clientOrClients];
  if (list.length === 0) return clientOrClients;

  const byClientId = new Map();
  try {
    const { data, error } = await supabase
      .from('client_phones')
      .select('*')
      .in('client_id', list.map((c) => c.id));
    if (error) throw error;
    for (const row of data || []) {
      if (!byClientId.has(row.client_id)) byClientId.set(row.client_id, []);
      byClientId.get(row.client_id).push(row);
    }
  } catch {
    // client_phones isn't there yet — every client just gets an empty list.
  }

  for (const c of list) {
    c.client_phones = byClientId.get(c.id) || [];
  }
  return clientOrClients;
}

// clients.phone is a synced convenience copy of whichever number is
// flagged is_whatsapp — most of the app (search, WhatsApp draft links,
// PDFs, the invite auto-detect-by-phone feature) reads it directly rather
// than joining client_phones, so it needs to stay current every time the
// list changes.
export async function syncClientWhatsappPhone(supabase, clientId, normalizedPhones) {
  const whatsappPhone = normalizedPhones.find((p) => p.is_whatsapp)?.phone || null;
  const { error } = await supabase.from('clients').update({ phone: whatsappPhone }).eq('id', clientId);
  if (error) throw error;
}
