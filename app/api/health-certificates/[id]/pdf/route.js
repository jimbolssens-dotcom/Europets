// app/api/health-certificates/[id]/pdf/route.js
// GET -> the export health certificate as a PDF, from what was saved when it
// was issued (migration 231, lib/healthCertificatePdf.js). Staff only.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { buildHealthCertificatePdf } from '@/lib/healthCertificatePdf';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { data: cert, error } = await supabaseAdmin.from('health_certificates').select('certificate_number, data').eq('id', params.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!cert) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const bytes = await buildHealthCertificatePdf({ certificateNumber: cert.certificate_number, data: cert.data });
  const name = `${cert.certificate_number}-${(cert.data?.animal?.name || 'pet').replace(/[^a-z0-9]+/gi, '-')}.pdf`;
  return new NextResponse(bytes, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${name}"` } });
}
