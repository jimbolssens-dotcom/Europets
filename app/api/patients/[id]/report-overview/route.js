import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';
import { isStaffRequest } from '@/lib/staffAuth';
import { getClientSession } from '@/lib/clientAppAuth';
import { patientReportRows } from '@/lib/patientReportOverview';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  if (!(await isStaffRequest(request))) {
    const sessionClientId = await getClientSession(request);
    const { data: owner } = await supabase.from('patients').select('client_id').eq('id', params.id).single();
    if (!sessionClientId || !owner || sessionClientId !== owner.client_id) {
      return NextResponse.json({ error: 'not authorized' }, { status: 403 });
    }
  }
  const rows = await patientReportRows(params.id);
  return NextResponse.json(rows);
}
