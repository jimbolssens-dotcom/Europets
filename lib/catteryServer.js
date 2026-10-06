// lib/catteryServer.js
// Server-only booking checks shared by POST /api/cattery and
// PATCH /api/cattery/[id] (route files can't export helpers themselves).

import { supabaseAdmin } from './supabaseAdmin';
import { CATTERY_SPACES } from './cattery';

// Is this space free for these dates? Returns the clashing booking, if any.
export async function findSpaceClash({ spaceNumber, dateIn, dateOut, ignoreId }) {
  let query = supabaseAdmin
    .from('cattery_bookings')
    .select('id, date_in, date_out, patients(name)')
    .eq('space_number', spaceNumber)
    .neq('status', 'cancelled')
    .neq('status', 'checked_out')
    .lte('date_in', dateOut)
    .gte('date_out', dateIn);
  if (ignoreId) query = query.neq('id', ignoreId);
  const { data } = await query.limit(1);
  return data?.[0] || null;
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

