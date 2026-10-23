// lib/staffExpiry.js
// Switches off staff whose access_until date has passed (interns,
// migration 223): they leave the pickers, the team chat and its WhatsApp.
// Run a few times a day by the Social sweep (app/api/social-duty/sweep).

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { dubaiDateISO } from '@/lib/dayProcedureSchedule';

export async function expireTemporaryStaff(now = Date.now()) {
  const today = dubaiDateISO(new Date(now));
  const { data, error } = await supabaseAdmin
    .from('staff')
    .update({ active: false })
    .eq('active', true)
    .not('access_until', 'is', null)
    .lt('access_until', today)
    .select('full_name');
  if (error) return { error: error.message };
  return { switched_off: (data || []).map((s) => s.full_name) };
}
