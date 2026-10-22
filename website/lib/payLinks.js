// lib/payLinks.js
// A client's personal payment link (the clinic app's migration 213,
// client_payment_links): anyone with it pays any amount towards that
// client's account (app/pay/[token]). The payment is logged as an Online
// Payment for the client (lib/nomodPayments.js#recordPayLinkPayment); the
// clinic app then applies it to their unpaid invoices and keeps the rest as
// credit (its lib/clientCredit.js).

import { supabaseServerAdmin } from '@/lib/supabaseServerAdmin';

export { PAY_LINK_MIN, PAY_LINK_MAX, PAY_LINK_STARTS_PER_HOUR, payLinkAmountError } from '@/lib/payLinkRules';

// The live link for a token, with its client and pet, or null.
export async function loadPayLink(token) {
  if (!/^[A-Za-z0-9]{8,32}$/.test(token || '')) return null;
  const { data } = await supabaseServerAdmin
    .from('client_payment_links')
    .select(
      'id, token, client_id, active, clients(id, full_name), patients(name), page_enabled, page_title, page_story, page_cover_path, page_story_image_path, instagram_handle, page_instagram, show_supporters, show_bills'
    )
    .eq('token', token)
    .maybeSingle();
  return data?.active && data.clients ? data : null;
}

// What the client still owes on their invoices.
export async function balanceDue(clientId) {
  const { data: invoices } = await supabaseServerAdmin
    .from('invoices')
    .select('total, amount_paid')
    .eq('client_id', clientId)
    .in('status', ['unpaid', 'partially_paid']);
  return Math.round((invoices || []).reduce((sum, inv) => sum + Math.max(0, Number(inv.total) - Number(inv.amount_paid || 0)), 0) * 100) / 100;
}

function storageUrl(path) {
  return path ? supabaseServerAdmin.storage.from('consult-files').getPublicUrl(path).data.publicUrl : null;
}

// A rescuer's personalised page (the clinic app's migration 214), or null
// when it's off: the pictures, words and Instagram staff set up, how many
// of their animals we've looked after, and (if staff chose to show them)
// recent supporters who ticked "show my gift" and the bills already paid
// from this link.
export async function payPage(link) {
  if (!link.page_enabled) return null;
  const [{ count: animals }, { data: paid }] = await Promise.all([
    supabaseServerAdmin.from('patients').select('id', { count: 'exact', head: true }).eq('client_id', link.client_id),
    supabaseServerAdmin
      .from('nomod_payment_links')
      .select('id, amount, payer_name, show_name, paid_at')
      .eq('pay_link_id', link.id)
      .eq('status', 'paid')
      .order('paid_at', { ascending: false })
      .limit(200),
  ]);
  let billsPaid = null;
  if (link.show_bills && paid?.length) {
    const { data: donations } = await supabaseServerAdmin.from('donations').select('id').in('nomod_payment_link_id', paid.map((p) => p.id));
    const ids = (donations || []).map((d) => d.id);
    if (ids.length) {
      const { data: payments } = await supabaseServerAdmin.from('invoice_payments').select('amount').in('donation_id', ids);
      billsPaid = Math.round((payments || []).reduce((sum, p) => sum + Number(p.amount), 0) * 100) / 100;
    }
  }
  const ig = link.page_instagram;
  return {
    title: link.page_title || null,
    story: link.page_story || null,
    cover_url: storageUrl(link.page_cover_path),
    story_image_url: storageUrl(link.page_story_image_path),
    animals: animals || 0,
    instagram: link.instagram_handle
      ? {
          username: ig?.username || link.instagram_handle,
          name: ig?.name || null,
          profile_picture_url: ig?.profile_picture_url || null,
          followers_count: ig?.followers_count ?? null,
          posts: (ig?.posts || []).slice(0, 6),
        }
      : null,
    supporters: link.show_supporters
      ? (paid || []).filter((p) => p.show_name && p.payer_name).slice(0, 8).map((p) => ({ name: p.payer_name.split(/\s+/)[0], amount: Number(p.amount), at: p.paid_at }))
      : null,
    supporter_count: (paid || []).length,
    bills_paid: link.show_bills ? billsPaid || 0 : null,
  };
}
