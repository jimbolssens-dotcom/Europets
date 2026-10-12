// app/api/invoices/send-due-reminders/route.js
// GET /api/invoices/send-due-reminders -> the automatic outstanding-invoice
// reminder pass (lib/invoiceReminders.js): 2 weeks, 1 month and 2 months
// after an invoice, by WhatsApp and email, logged in invoice_reminders.
//
// Triggered by Vercel Cron (see vercel.json) with the CRON_SECRET bearer
// token, like the other cron routes; anyone else gets a 401.

import { sendDueInvoiceReminders } from '@/lib/invoiceReminders';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json(await sendDueInvoiceReminders());
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
