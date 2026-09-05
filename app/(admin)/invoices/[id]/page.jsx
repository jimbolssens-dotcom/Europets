// app/invoices/[id]/page.jsx
// A single invoice: client/consult context, line items, VAT breakdown,
// add-item form, and status controls. Reachable from the invoices list or
// directly from a consult ("View Invoice" once one's been created for it).

'use client';

import { Fragment, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import CatalogPicker from '@/app/_components/CatalogPicker';
import InvoicePaymentPanel from '@/app/_components/InvoicePaymentPanel';
import MicrochipCaptureModal from '@/app/_components/MicrochipCaptureModal';
import VoiceNoteBox from '@/app/_components/VoiceNoteBox';
import { groupLineItemsByCategory, ADD_ITEM_LABELS } from '@/lib/catalogGrouping';
import { isMicrochipProduct } from '@/lib/microchipProduct';
import { printPdfUrl } from '@/lib/printPdf';

function money(n) {
  return Number(n || 0).toFixed(2);
}

const STATUS_LABELS = {
  unpaid: 'unpaid',
  partially_paid: 'partially paid',
  paid: 'paid',
  void: 'void',
};

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [staff, setStaff] = useState([]);
  const [goodsServiceId, setGoodsServiceId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [addCategory, setAddCategory] = useState('product');
  const [dispenseInstructions, setDispenseInstructions] = useState({}); // line item id -> text override
  const [printingLabelId, setPrintingLabelId] = useState(null); // line item id currently printing, or null
  const [labelsError, setLabelsError] = useState(null);
  const [paymentLinkError, setPaymentLinkError] = useState(null);
  const [microchipModalOpen, setMicrochipModalOpen] = useState(false);

  const loadInvoice = () =>
    fetch(`/api/invoices/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setInvoice(data);
        setLoading(false);
      });

  useEffect(() => {
    loadInvoice();
    fetch('/api/goods-services?active=true')
      .then((res) => res.json())
      .then((data) => setCatalog(Array.isArray(data) ? data : []));
    fetch('/api/catalog-subcategories')
      .then((res) => res.json())
      .then((data) => setSubcategories(Array.isArray(data) ? data : []));
    fetch('/api/staff')
      .then((res) => res.json())
      .then((data) => setStaff(Array.isArray(data) ? data : []));

    const channel = supabase
      .channel(`invoice-detail-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'invoice_line_items', filter: `invoice_id=eq.${id}` },
        () => loadInvoice()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'invoices', filter: `id=eq.${id}` },
        () => loadInvoice()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'invoice_payments', filter: `invoice_id=eq.${id}` },
        () => loadInvoice()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function postLineItem() {
    const res = await fetch(`/api/invoices/${id}/line-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goods_service_id: goodsServiceId,
        quantity: quantity ? Number(quantity) : undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to add item');
    return data;
  }

  async function addLineItem(e) {
    e.preventDefault();
    if (!goodsServiceId) return;

    if (isMicrochipProduct(selected?.name)) {
      setMicrochipModalOpen(true);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await postLineItem();
      setGoodsServiceId('');
      setQuantity('');
      loadInvoice();
    } catch (err) {
      setError(err.message);
    }
    setSubmitting(false);
  }

  // Called once the microchip popup is confirmed: adds the line item as
  // usual, then saves the chip number + implantation date straight to the
  // patient file (see EDITABLE_FIELDS in app/api/patients/[id]) so nobody
  // has to remember to do that as a separate step. Returns an error
  // message on failure (shown inside the modal), or null on success.
  async function confirmMicrochip(number, date) {
    setError(null);
    try {
      await postLineItem();
    } catch (err) {
      return err.message;
    }

    const patientId = invoice.visits?.patients?.id || invoice.hospitalizations?.patients?.id;
    if (patientId) {
      const res = await fetch(`/api/patients/${patientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ microchip_number: number, microchip_implanted_at: date }),
      });
      const data = await res.json();
      if (!res.ok) {
        // The invoice line item is already added at this point — only the
        // patient-file save failed (e.g. that chip number is already
        // registered to another patient) — so surface it but don't retry
        // adding the item again.
        loadInvoice();
        return `Line item added, but couldn't save to the patient file: ${data.error || 'unknown error'}`;
      }
    }

    setGoodsServiceId('');
    setQuantity('');
    setMicrochipModalOpen(false);
    loadInvoice();
    return null;
  }

  async function removeLineItem(itemId) {
    setError(null);
    const res = await fetch(`/api/invoices/${id}/line-items/${itemId}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || 'Failed to remove item');
      return;
    }
    loadInvoice();
  }

  // Dispensing labels: each medication line item prints independently —
  // nothing goes to the printer unless its own button is clicked. Saves
  // that item's (possibly edited) instructions back to it first (see
  // app/api/invoices/[id]/line-items/[itemId]), so what prints always
  // matches what was reviewed on screen, then prints its one-page label
  // (see app/api/invoices/[id]/dispensing-labels-pdf).
  async function saveLineItemVoiceNote(lineItemId, path) {
    setLabelsError(null);
    const res = await fetch(`/api/invoices/${id}/line-items/${lineItemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voice_note_path: path }),
    });
    if (!res.ok) {
      const data = await res.json();
      setLabelsError(data.error || 'Failed to save voice note');
      return;
    }
    loadInvoice();
  }

  async function printLabel(li) {
    setLabelsError(null);
    setPrintingLabelId(li.id);
    try {
      const currentText = dispenseInstructions[li.id] ?? li.instructions ?? '';
      if (currentText !== (li.instructions || '')) {
        const res = await fetch(`/api/invoices/${id}/line-items/${li.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instructions: currentText }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to save instructions');
        }
      }
      printPdfUrl(`/api/invoices/${id}/dispensing-labels-pdf?item_ids=${li.id}&t=${Date.now()}`);
    } catch (err) {
      setLabelsError(err.message);
    } finally {
      setPrintingLabelId(null);
    }
  }

  // No link is generated here — it just points the client at their own
  // "Settle Your Bill" page on the website (website/app/settle-bill/[id]),
  // which creates the actual Nomod link itself, for whatever the balance
  // due happens to be at the moment they open it (see
  // website/app/api/settle-bill/[id]).
  function sendPaymentLink() {
    setPaymentLinkError(null);
    const websiteUrl = process.env.NEXT_PUBLIC_WEBSITE_URL || 'https://epc.vet';
    const url = `${websiteUrl}/settle-bill/${id}`;
    const digits = (invoice.clients?.phone || '').replace(/\D/g, '');
    const message = `Hi ${invoice.clients?.full_name || ''}! You can settle your Europets Clinic invoice online here: ${url}`;
    if (digits.length > 3) {
      window.open(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`, '_blank');
    } else {
      navigator.clipboard.writeText(url);
      setPaymentLinkError('No phone number on file — link copied to clipboard instead.');
    }
  }

  function downloadTaxInvoice() {
    // A cache-busting query param, on top of the route's own no-store
    // headers, so a browser/download manager can never reuse a previous
    // download of this same invoice after it's been edited.
    window.open(`/api/invoices/${id}/tax-invoice-pdf?t=${Date.now()}`, '_blank');
  }

  if (loading || !invoice) return <p>Loading invoice...</p>;
  if (invoice.error) return <p>Invoice not found.</p>;

  const selected = catalog.find((c) => c.id === goodsServiceId);
  const patientName = invoice.visits?.patients?.name || invoice.hospitalizations?.patients?.name;
  const lineItemGroups = groupLineItemsByCategory(invoice.line_items);
  const editable = invoice.status === 'unpaid' || invoice.status === 'partially_paid';
  const columnCount = editable ? 5 : 4;
  const medicationLineItems = invoice.line_items.filter((li) => li.goods_services?.main_category === 'product');

  return (
    <div>
      <p>
        <a href="/invoices">&larr; All invoices</a>
      </p>
      <h1>
        Invoice {invoice.invoice_number ? `#INV-${String(invoice.invoice_number).padStart(6, '0')}` : ''} —{' '}
        {invoice.clients?.full_name}
        {patientName ? ` — ${patientName}` : ''} <span>({STATUS_LABELS[invoice.status] || invoice.status})</span>
      </h1>
      <p className="visit-meta">
        {invoice.clients?.phone} · {invoice.clients?.email}
        {invoice.visit_id && (
          <>
            {' · '}
            <a href={`/consults/${invoice.visit_id}`}>View originating consult</a>
          </>
        )}
      </p>
      <p>
        <button type="button" onClick={downloadTaxInvoice}>
          📄 Download Tax Invoice (PDF)
        </button>{' '}
        {editable && (
          <button type="button" onClick={sendPaymentLink}>
            💳 Send Payment Link
          </button>
        )}
      </p>
      {paymentLinkError && <p className="error">{paymentLinkError}</p>}

      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Unit price</th>
            <th>Line total</th>
            {editable && <th></th>}
          </tr>
        </thead>
        <tbody>
          {lineItemGroups.map((group) => (
            <Fragment key={group.mainCategory || 'other'}>
              <tr className="invoice-category-row">
                <td colSpan={columnCount}>{group.label}</td>
              </tr>
              {group.items.map((li) => (
                <tr key={li.id}>
                  <td>{li.description}</td>
                  <td>
                    {li.quantity} {li.goods_services?.unit || ''}
                  </td>
                  <td>{money(li.unit_price)}</td>
                  <td>{money(li.line_total)}</td>
                  {editable && (
                    <td>
                      <button type="button" onClick={() => removeLineItem(li.id)}>
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </Fragment>
          ))}
          {invoice.line_items.length === 0 && (
            <tr>
              <td colSpan={5}>No line items yet.</td>
            </tr>
          )}
        </tbody>
      </table>

      <p>
        Subtotal: {money(invoice.subtotal)} · VAT (5%): {money(invoice.vat_amount)} ·{' '}
        <strong>Total: {money(invoice.total)}</strong>
      </p>

      {editable && (
        <form className="note-form catalog-add-form" onSubmit={addLineItem}>
          {error && <p className="error">{error}</p>}
          <CatalogPicker
            catalog={catalog}
            subcategories={subcategories}
            value={goodsServiceId}
            onChange={setGoodsServiceId}
            onItemCreated={(item) => setCatalog((prev) => [...prev, item])}
            onCategoryChange={setAddCategory}
          />
          <div className="catalog-add-form-row">
            <input
              className="qty-input"
              type="number"
              step="0.01"
              placeholder={selected?.pricing_type === 'per_kg' ? 'kg (blank = patient weight)' : 'qty (default 1)'}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            <button type="submit" disabled={submitting || !goodsServiceId}>
              {`+ Add ${ADD_ITEM_LABELS[addCategory]}`}
            </button>
          </div>
        </form>
      )}

      {medicationLineItems.length > 0 && (
        <div className="card dispensing-labels">
          <h3>Dispensing Labels</h3>
          <p className="visit-meta">
            Instructions carry straight over from the treatment plan entered during the consult —
            review/edit here if needed, then print just that one label; nothing goes to the printer
            until you click its button. Labels are sized for the Brother QL-800 (62mm continuous
            tape). If nothing was dictated or typed during the consult, record a plain voice note
            below instead — it isn&apos;t transcribed or printed, just kept for reference.
          </p>
          {labelsError && <p className="error">{labelsError}</p>}
          <ul className="dispensing-labels-list">
            {medicationLineItems.map((li) => {
              const instructionsValue = dispenseInstructions[li.id] ?? li.instructions ?? '';
              return (
                <li key={li.id} className="dispensing-label-row">
                  <strong>{li.goods_services?.name || li.description}</strong>
                  <textarea
                    placeholder="Dispensing instructions for the label"
                    value={instructionsValue}
                    onChange={(e) => setDispenseInstructions({ ...dispenseInstructions, [li.id]: e.target.value })}
                  />
                  <VoiceNoteBox
                    lineItemId={li.id}
                    path={li.voice_note_path}
                    onUploaded={(path) => saveLineItemVoiceNote(li.id, path)}
                    onCleared={() => saveLineItemVoiceNote(li.id, null)}
                  />
                  <button type="button" onClick={() => printLabel(li)} disabled={printingLabelId === li.id}>
                    {printingLabelId === li.id ? 'Printing...' : '🏷️ Print Label'}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <h3>Payments</h3>
      <InvoicePaymentPanel invoice={invoice} staff={staff} onChanged={loadInvoice} />

      {microchipModalOpen && (
        <MicrochipCaptureModal
          patientName={patientName}
          confirmLabel="Save & Add to Invoice"
          onCancel={() => setMicrochipModalOpen(false)}
          onConfirm={confirmMicrochip}
        />
      )}
    </div>
  );
}
