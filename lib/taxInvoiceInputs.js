// lib/taxInvoiceInputs.js
// Everything buildTaxInvoicePdf (lib/taxInvoicePdf.js) needs for one
// invoice: the invoice with its client, the patient (from its consult or
// stay), the line items and the clinic's details. Shared by the single
// invoice PDF (app/api/invoices/[id]/tax-invoice-pdf) and the client's
// "all open invoices" PDF (app/api/clients/[id]/open-invoices-pdf), so both
// print each invoice exactly the same way.

export async function loadTaxInvoiceInputs(supabase, invoiceId, clinic = undefined) {
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('*, clients(client_number, full_name, phone, email, address, trn, client_app_last_seen_at)')
    .eq('id', invoiceId)
    .single();
  if (error || !invoice) return { error: 'invoice not found' };

  // Two separate queries rather than one nested visits(...)/hospitalizations(...)
  // embed off invoices — see app/api/invoices/[id]/route.js for why.
  let patient = null;
  if (invoice.visit_id) {
    const { data: visit } = await supabase
      .from('visits')
      .select('patients(patient_number, name, species, microchip_number)')
      .eq('id', invoice.visit_id)
      .single();
    patient = visit?.patients || null;
  } else if (invoice.hospitalization_id) {
    const { data: hospitalization } = await supabase
      .from('hospitalizations')
      .select('patients(patient_number, name, species, microchip_number)')
      .eq('id', invoice.hospitalization_id)
      .single();
    patient = hospitalization?.patients || null;
  }

  const [{ data: lineItems }, clinicResult] = await Promise.all([
    supabase.from('invoice_line_items').select('*, goods_services(main_category)').eq('invoice_id', invoiceId).order('id'),
    clinic === undefined ? supabase.from('clinic_settings').select('*').eq('id', true).single() : Promise.resolve({ data: clinic }),
  ]);

  return { invoice, lineItems: lineItems || [], clinic: clinicResult.data, client: invoice.clients, patient };
}
