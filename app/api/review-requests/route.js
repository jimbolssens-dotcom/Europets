// app/api/review-requests/route.js
// GET  /api/review-requests  -> list every review/testimonial request,
//                                newest first, for the staff Reviews page
// POST /api/review-requests  -> { client_id, sent_to_phone? } generate a
//                                fresh link to send a client over WhatsApp,
//                                asking them to leave a review on the
//                                public website (see app/(admin)/clients/
//                                [id]'s "Request a Review")

import { supabase } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function GET() {
  const { data, error } = await supabase
    .from('review_requests')
    .select('*, clients(id, full_name)')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));

  if (!body.client_id) {
    return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
  }

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id')
    .eq('id', body.client_id)
    .single();
  if (clientError || !client) {
    return NextResponse.json({ error: 'client not found' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('review_requests')
    .insert([{ client_id: body.client_id, sent_to_phone: body.sent_to_phone || null }])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
