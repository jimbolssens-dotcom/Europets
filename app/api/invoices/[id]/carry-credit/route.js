// app/api/invoices/[id]/carry-credit/route.js
// POST /api/invoices/:id/carry-credit { by } -> move this invoice's credit
// to the client's unpaid invoices, oldest first (lib/invoiceCreditCarry.js).
// Staff press this ("Move to next invoice") for credit that doesn't move
// on its own: an overpayment that wasn't a deposit, or a deposit whose
// case is still open. Staff only (middleware.js).

import { NextResponse } from 'next/server';
import { carryOverCredit } from '@/lib/invoiceCreditCarry';

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const { moved, error } = await carryOverCredit({ fromInvoiceId: params.id, depositsOnly: false, by: body.by || 'Staff' });
  if (error) return NextResponse.json({ error }, { status: 500 });
  if (!moved.length) {
    return NextResponse.json({ moved, message: 'No unpaid invoice for this client to move it to yet.' });
  }
  return NextResponse.json({ moved });
}
