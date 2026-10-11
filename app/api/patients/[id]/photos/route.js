// app/api/patients/[id]/photos/route.js
// GET -> every photo on file for this patient's consults and hospital
// stays, newest first, each tagged with its record and where on it the
// photo was filed (see lib/patientPhotos.js). Staff only: unlike the
// report overview, this isn't shown in the client app.

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';
import { isStaffRequest } from '@/lib/staffAuth';
import { loadPatientPhotos } from '@/lib/patientPhotos';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  if (!(await isStaffRequest(request))) {
    return NextResponse.json({ error: 'not authorized' }, { status: 403 });
  }
  try {
    return NextResponse.json(await loadPatientPhotos(supabase, params.id));
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
