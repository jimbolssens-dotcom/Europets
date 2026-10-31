// lib/catteryServer.js
// Server-only cattery booking logic shared by the /api/cattery routes
// (route files can't export helpers themselves): the space clash check,
// input validation, expiring unanswered client requests, and telling the
// client what happened to their request.

import { supabaseAdmin } from './supabaseAdmin';
import { CATTERY_SPACES } from './cattery';
import { sendPushToClient } from './pushNotifications';
import { sendWhatsAppText } from './metaWhatsapp';

// Statuses that occupy a space. A client's 'requested' booking holds its
// space too (migration 170), so two clients can't ask for the same space
// and dates at once; it stops holding it once declined or expired.
export const HOLDING_STATUSES = ['requested', 'booked', 'checked_in'];

// How long staff have to answer a client's request before it expires.
export const REQUEST_TTL_MS = 48 * 60 * 60 * 1000;

// Is this space free for these dates? Returns the clashing booking, if any.
// With patientId (staff booking that cat directly), the cat's own pending
// request doesn't count: the booking answers it (closeRequestsCoveredBy).
// It used to, so staff booking a cat into the space its owner had asked
// for were told the space was taken by that same cat.
export async function findSpaceClash({ spaceNumber, dateIn, dateOut, ignoreId, patientId }) {
  let query = supabaseAdmin
    .from('cattery_bookings')
    .select('id, patient_id, date_in, date_out, status, patients(name)')
    .eq('space_number', spaceNumber)
    .in('status', HOLDING_STATUSES)
    .lte('date_in', dateOut)
    .gte('date_out', dateIn);
  if (ignoreId) query = query.neq('id', ignoreId);
  const { data } = await query.limit(10);
  return (data || []).find((b) => !(patientId && b.status === 'requested' && b.patient_id === patientId)) || null;
}

// Which spaces are taken on any day between dateIn and dateOut. Used by
// the client app's space picker, which only learns taken/free, never whose
// cat is where.
export async function takenSpaces(dateIn, dateOut) {
  const { data } = await supabaseAdmin
    .from('cattery_bookings')
    .select('space_number')
    .in('status', HOLDING_STATUSES)
    .lte('date_in', dateOut)
    .gte('date_out', dateIn);
  return [...new Set((data || []).map((b) => b.space_number))].sort((a, b) => a - b);
}

// Adds other cats from the booking's household to share its space
// (cattery_booking_cats, migration 183). Each must belong to the same
// client. Returns { added } or { error }.
export async function addBookingCats(booking, patientIds) {
  const ids = [...new Set(patientIds)].filter((pid) => pid && pid !== booking.patient_id);
  if (ids.length === 0) return { added: 0 };
  const { data: pets } = await supabaseAdmin.from('patients').select('id, client_id, name').in('id', ids);
  const strangers = (pets || []).filter((p) => p.client_id !== booking.client_id);
  if ((pets || []).length !== ids.length || strangers.length) {
    return { error: 'A cat sharing the space must belong to the same owner.' };
  }
  const { error } = await supabaseAdmin
    .from('cattery_booking_cats')
    .upsert(ids.map((patient_id) => ({ booking_id: booking.id, patient_id })), { onConflict: 'booking_id,patient_id' });
  if (error) return { error: error.message };
  return { added: ids.length };
}

export function validateBookingInput(body) {
  const space = Number(body.space_number);
  if (!CATTERY_SPACES.includes(space)) return 'Pick a cattery space (1 to 7).';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date_in || '') || !/^\d{4}-\d{2}-\d{2}$/.test(body.date_out || '')) {
    return 'Date in and date out are both required.';
  }
  if (body.date_out < body.date_in) return 'Date out cannot be before date in.';
  return null;
}

const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;

// Tells the client about their request: a push notification (if they've
// turned them on in the client app), plus a WhatsApp message when there's
// an open 24-hour conversation window (free-text WhatsApp is only allowed
// inside one). Never throws.
export async function notifyCatteryClient(booking, { title, body, url }) {
  if (!booking?.client_id) return;
  await sendPushToClient(booking.client_id, { title, body, url: url || `/client-app/cattery/${booking.id}` }).catch(() => {});
  try {
    const { data: client } = await supabaseAdmin.from('clients').select('phone').eq('id', booking.client_id).maybeSingle();
    const digits = (client?.phone || '').replace(/\D/g, '');
    if (!digits) return;
    const { data: last } = await supabaseAdmin
      .from('client_messages')
      .select('created_at')
      .eq('client_id', booking.client_id)
      .eq('sender', 'client')
      .eq('channel', 'whatsapp')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!last || Date.now() - new Date(last.created_at).getTime() >= WHATSAPP_WINDOW_MS) return;
    const text = `${title}. ${body}`;
    const waMessageId = await sendWhatsAppText(digits, text);
    await supabaseAdmin.from('client_messages').insert([
      { client_id: booking.client_id, phone: digits, channel: 'whatsapp', sender: 'system', body: text, wa_message_id: waMessageId, status: 'sent' },
    ]);
  } catch (err) {
    console.error('Cattery client WhatsApp notice failed', booking.id, err);
  }
}

// '9 Dec', for messages to the client.
export function prettyDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

// Is this cat already booked (or staying) on any of these dates? A client's
// request that staff answered by making a booking of their own, rather
// than approving the request, must not later expire with "we couldn't
// confirm": a client was told that about a cat already booked, and the
// team had to phone him to straighten it out.
async function catAlreadyBooked({ patientId, dateIn, dateOut, ignoreId }) {
  const { data: shared } = await supabaseAdmin.from('cattery_booking_cats').select('booking_id').eq('patient_id', patientId);
  const sharedIds = (shared || []).map((r) => r.booking_id);
  let query = supabaseAdmin
    .from('cattery_bookings')
    .select('id')
    .in('status', ['booked', 'checked_in'])
    .lte('date_in', dateOut)
    .gte('date_out', dateIn)
    .or(sharedIds.length ? `patient_id.eq.${patientId},id.in.(${sharedIds.join(',')})` : `patient_id.eq.${patientId}`);
  if (ignoreId) query = query.neq('id', ignoreId);
  const { data } = await query.limit(1);
  return Boolean(data?.length);
}

// After staff book a cat directly: the client's own open requests for the
// same cat and overlapping dates are answered by it, so they're closed
// (cancelled, freeing the space they held) without a message. Returns how
// many were closed.
export async function closeRequestsCoveredBy(booking, patientIds = []) {
  const ids = [...new Set([booking.patient_id, ...patientIds].filter(Boolean))];
  if (!ids.length) return 0;
  const { data } = await supabaseAdmin
    .from('cattery_bookings')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('status', 'requested')
    .in('patient_id', ids)
    .neq('id', booking.id)
    .lte('date_in', booking.date_out)
    .gte('date_out', booking.date_in)
    .select('id');
  return (data || []).length;
}

// Marks client requests nobody answered within 48 hours as 'expired',
// which frees their space, and tells each client, unless the cat is
// already booked for those dates another way. Called at the start of
// the cattery routes (the staff Cattery alarm polls every minute, so this
// runs promptly without a separate scheduled job).
export async function expireStaleRequests() {
  const { data } = await supabaseAdmin
    .from('cattery_bookings')
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .eq('status', 'requested')
    .lt('request_expires_at', new Date().toISOString())
    .select('id, client_id, patient_id, date_in, date_out, patients(name)');
  for (const b of data || []) {
    const covered = await catAlreadyBooked({ patientId: b.patient_id, dateIn: b.date_in, dateOut: b.date_out, ignoreId: b.id }).catch(() => false);
    if (covered) continue;
    await notifyCatteryClient(b, {
      title: `Cattery request for ${b.patients?.name || 'your cat'} not confirmed`,
      body: "We couldn't confirm your cattery request in time, sorry. Please send a new request or message us in Chat.",
    });
  }
}
