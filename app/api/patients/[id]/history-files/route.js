// app/api/patients/[id]/history-files/route.js
// A patient's outside history and results (migration 189).
// GET  -> staff: every file. The owner's client app (in middleware.js's
//         CLIENT_APP_READ_PATTERNS, GET only): just the files shared with
//         the owner, and only for their own pet.
// POST { file_path, file_name, content_type, title, category,
//        document_date, share_with_owner, uploaded_by }
//      -> staff only (POST isn't in any public pattern). The browser has
//         already uploaded the file to patient-history/<patient_id>/.

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isStaffRequest } from '@/lib/staffAuth';
import { getClientSession } from '@/lib/clientAppAuth';
import { HISTORY_CATEGORIES, historyFileUrl } from '@/lib/patientHistoryFiles';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_APP_URL;

export async function GET(request, { params }) {
  const staff = await isStaffRequest(request);
  if (!staff) {
    const sessionClientId = await getClientSession(request);
    const { data: owner } = await supabaseAdmin.from('patients').select('client_id').eq('id', params.id).maybeSingle();
    if (!sessionClientId || !owner || sessionClientId !== owner.client_id) {
      return NextResponse.json({ error: 'not authorized' }, { status: 403 });
    }
  }

  let query = supabaseAdmin
    .from('patient_history_files')
    .select(staff ? '*, staff:uploaded_by(full_name)' : 'id, file_path, file_name, content_type, title, category, document_date, created_at')
    .eq('patient_id', params.id)
    .order('document_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (!staff) query = query.eq('share_with_owner', true);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data || []).map((row) => ({ ...row, url: historyFileUrl(SUPABASE_URL, row.file_path) })));
}

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const { file_path, file_name, content_type, title, category, document_date, share_with_owner, uploaded_by } = body;
  if (!file_path || !file_name) return NextResponse.json({ error: 'file_path and file_name are required' }, { status: 400 });
  if (!file_path.startsWith(`patient-history/${params.id}/`)) {
    return NextResponse.json({ error: "That file wasn't uploaded for this patient" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('patient_history_files')
    .insert([
      {
        patient_id: params.id,
        file_path,
        file_name,
        content_type: content_type || null,
        title: (title || '').trim() || null,
        category: HISTORY_CATEGORIES.some((c) => c.value === category) ? category : 'other',
        document_date: document_date || null,
        share_with_owner: share_with_owner !== false,
        uploaded_by: uploaded_by || null,
      },
    ])
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...data, url: historyFileUrl(SUPABASE_URL, data.file_path) }, { status: 201 });
}
