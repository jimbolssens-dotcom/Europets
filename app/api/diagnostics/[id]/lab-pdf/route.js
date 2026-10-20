// app/api/diagnostics/[id]/lab-pdf/route.js
// GET /api/diagnostics/:id/lab-pdf[?file=<attachment id>] -> the lab's own
// PDF attached to this test (bloods, urine...), exactly as the lab sent it.
// The client app links a test straight here (lib/clientAppReports.js), so
// an owner opening "Bloods" gets the bloods report itself, even when the
// lab's PDF is one that can't be copied into the combined test report
// (../../../visits/[id]/test-report-pdf). Public by the test's id, like the
// test report that already carries these pages (see middleware.js).

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isPdfAttachment, fetchAttachmentBytes } from '@/lib/pdfAttachments';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const fileId = new URL(request.url).searchParams.get('file');
  const { data: attachments } = await supabaseAdmin
    .from('attachments')
    .select('*')
    .eq('entity_type', 'diagnostic')
    .eq('entity_id', params.id)
    .order('created_at', { ascending: true });
  const pdfs = (attachments || []).filter(isPdfAttachment);
  const attachment = fileId ? pdfs.find((a) => a.id === fileId) : pdfs[0];
  if (!attachment) return NextResponse.json({ error: 'No lab report on this test' }, { status: 404 });

  const file = await fetchAttachmentBytes(attachment);
  if (!file) return NextResponse.json({ error: 'Could not read the lab report' }, { status: 502 });
  const name = (attachment.file_name || 'lab-report.pdf').replace(/[^\w .()-]/g, '_');
  return new NextResponse(file.bytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${name}"`,
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}
