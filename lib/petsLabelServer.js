// lib/petsLabelServer.js
// Server-side: which pets a set of invoices is for (the consult or stay each
// came from), for the payment messages' wording (lib/petsLabel.js). An
// invoice tied to neither (a product sale) falls back to the owner's pets
// when they have one or two. A pet that has died or been rehomed is left
// out, so no message hopes they're "doing well".

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { petsLabel } from '@/lib/petsLabel';

const alive = (p) => p && !p.deceased && !p.rehomed;

export async function petsLabelForInvoices(invoiceIds, clientId) {
  try {
    const ids = (invoiceIds || []).filter(Boolean);
    const { data } = ids.length
      ? await supabaseAdmin
          .from('invoices')
          .select('visits(patients(name, deceased, rehomed)), hospitalizations(patients(name, deceased, rehomed))')
          .in('id', ids)
      : { data: [] };
    const pets = (data || []).flatMap((inv) => [inv.visits?.patients, inv.hospitalizations?.patients]).filter(Boolean);
    if (pets.length) return petsLabel(pets.filter(alive).map((p) => p.name));
    if (!clientId) return petsLabel([]);
    const { data: own } = await supabaseAdmin.from('patients').select('name, deceased, rehomed').eq('client_id', clientId);
    const living = (own || []).filter(alive);
    return living.length <= 2 ? petsLabel(living.map((p) => p.name)) : petsLabel([]);
  } catch {
    return petsLabel([]);
  }
}
