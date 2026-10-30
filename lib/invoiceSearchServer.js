// lib/invoiceSearchServer.js
// Server-side: the invoice ids that match each term of the Invoices page's
// search (lib/invoiceSearch.js): its separate fields, or the older single
// box. Every term has to match, so the results are the ids common to all
// of them.

import { clientIdsWithPhoneLike } from '@/lib/phoneMatch';
import { dateTermBounds } from '@/lib/invoiceSearch';

const CAP = 3000;
const ids = (rows, key = 'id') => (rows || []).map((r) => r[key]).filter(Boolean);
const like = (t) => `%${t.replace(/[%_,()]/g, ' ').trim()}%`;

async function inChunks(values, run) {
  const out = [];
  for (let i = 0; i < values.length; i += 200) {
    const { data } = await run(values.slice(i, i + 200));
    out.push(...(data || []));
  }
  return out;
}

// Invoices for these pets: through the consult or stay they came from, plus
// the owners' invoices that aren't tied to any consult or stay.
async function invoicesForPatients(db, patientRows) {
  if (!patientRows.length) return [];
  const patientIds = ids(patientRows);
  const ownerIds = [...new Set(ids(patientRows, 'client_id'))];
  const [visits, stays] = await Promise.all([
    inChunks(patientIds, (c) => db.from('visits').select('id').in('patient_id', c)),
    inChunks(patientIds, (c) => db.from('hospitalizations').select('id').in('patient_id', c)),
  ]);
  const [byVisit, byStay, standalone] = await Promise.all([
    inChunks(ids(visits), (c) => db.from('invoices').select('id').in('visit_id', c)),
    inChunks(ids(stays), (c) => db.from('invoices').select('id').in('hospitalization_id', c)),
    inChunks(ownerIds, (c) => db.from('invoices').select('id').in('client_id', c).is('visit_id', null).is('hospitalization_id', null)),
  ]);
  return [...ids(byVisit), ...ids(byStay), ...ids(standalone)];
}

async function invoicesForClients(db, clientIds) {
  if (!clientIds.length) return [];
  return ids(await inChunks(clientIds, (c) => db.from('invoices').select('id').in('client_id', c)));
}

async function idsForTerm(db, term) {
  switch (term.kind) {
    case 'invoice': {
      const { data } = await db.from('invoices').select('id').eq('invoice_number', term.n);
      return ids(data);
    }
    case 'number': {
      const [{ data: inv }, { data: clients }, { data: patients }, { data: byTotal }] = await Promise.all([
        db.from('invoices').select('id').eq('invoice_number', term.n),
        db.from('clients').select('id').eq('client_number', term.n),
        db.from('patients').select('id, client_id').eq('patient_number', term.n),
        db.from('invoices').select('id').eq('total', term.n).limit(CAP),
      ]);
      return [...ids(inv), ...(await invoicesForClients(db, ids(clients))), ...(await invoicesForPatients(db, patients || [])), ...ids(byTotal)];
    }
    case 'client': {
      const { data } = await db.from('clients').select('id').eq('client_number', term.n);
      return invoicesForClients(db, ids(data));
    }
    case 'patient': {
      const { data } = await db.from('patients').select('id, client_id').eq('patient_number', term.n);
      return invoicesForPatients(db, data || []);
    }
    case 'name': {
      // The client's or the pet's name, nothing else.
      const pattern = like(term.text);
      const [{ data: clients }, { data: patients }] = await Promise.all([
        db.from('clients').select('id').ilike('full_name', pattern).limit(CAP),
        db.from('patients').select('id, client_id').ilike('name', pattern).limit(CAP),
      ]);
      return [...(await invoicesForClients(db, ids(clients))), ...(await invoicesForPatients(db, patients || []))];
    }
    case 'item': {
      const { data } = await db.from('invoice_line_items').select('invoice_id').ilike('description', like(term.text)).limit(CAP);
      return ids(data, 'invoice_id');
    }
    case 'none':
      return [];
    case 'amount': {
      const { data } = await db.from('invoices').select('id').eq('total', term.value).limit(CAP);
      return ids(data);
    }
    case 'phone': {
      // The main number and any other number on file; the last 9 digits, so
      // +971 50... finds a number saved as 050...
      const tail = term.digits.slice(-9);
      const [extra, { data: main }] = await Promise.all([
        clientIdsWithPhoneLike(db, `%${tail}%`),
        db.from('clients').select('id').ilike('phone', `%${tail}%`).limit(CAP),
      ]);
      return invoicesForClients(db, [...new Set([...extra, ...ids(main)])]);
    }
    case 'date': {
      const { from, to } = dateTermBounds(term);
      const { data } = await db.from('invoices').select('id').gte('created_at', from).lt('created_at', to).limit(CAP);
      return ids(data);
    }
    case 'status': {
      const { data } = await db.from('invoices').select('id').in('status', term.statuses).limit(CAP);
      return ids(data);
    }
    case 'text': {
      const pattern = like(term.text);
      const [{ data: clients }, { data: patients }, { data: lines }] = await Promise.all([
        db.from('clients').select('id').or(`full_name.ilike.${pattern},email.ilike.${pattern}`).limit(CAP),
        db.from('patients').select('id, client_id').ilike('name', pattern).limit(CAP),
        db.from('invoice_line_items').select('invoice_id').ilike('description', pattern).limit(CAP),
      ]);
      return [...(await invoicesForClients(db, ids(clients))), ...(await invoicesForPatients(db, patients || [])), ...ids(lines, 'invoice_id')];
    }
    default:
      return null;
  }
}

// The ids matching every term, or null when there's nothing to search by.
export async function searchInvoiceIds(db, terms) {
  let result = null;
  for (const term of terms) {
    const found = await idsForTerm(db, term);
    if (found === null) continue;
    const set = new Set(found);
    result = result === null ? set : new Set([...result].filter((id) => set.has(id)));
    if (result.size === 0) break;
  }
  return result === null ? null : [...result];
}
