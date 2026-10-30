// lib/invoiceSearch.js
// The Invoices page's search box (GET /api/invoices?q=...): what staff type,
// broken into terms that each have to match. Jim: search by invoice number,
// client and patient number, and more, dates included. Pure, so it can be
// tested (tests/invoice-search.test.mjs).
//
//   INV-000916, inv916, #916   the invoice number
//   15343                      an invoice, client or patient number, or a
//                              whole-dirham amount
//   619.50, aed 619            the amount
//   0501234567, +971 50...     part of the client's phone number
//   28/10, 28/10/2026, 2026-10-28, 28 Oct, Oct 2026, October   the date made
//   paid, unpaid, part, void   the status
//   anything else              the client's or pet's name, the email, or an
//                              item on the invoice (e.g. PCR)

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const STATUS = { paid: ['paid'], unpaid: ['unpaid'], part: ['partially_paid'], partial: ['partially_paid'], partly: ['partially_paid'], void: ['void'], voided: ['void'] };

const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const monthIndex = (word) => MONTHS.indexOf(word.slice(0, 3).toLowerCase()) + 1;
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// The UAE date today, as [year, month, day].
function uaeToday(now) {
  const d = new Date(now + 4 * 60 * 60 * 1000);
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
}

// A day or month with no year means the latest one not in the future.
function yearFor(m, d, now) {
  const [y, tm, td] = uaeToday(now);
  return m > tm || (m === tm && d > td) ? y - 1 : y;
}

function validDay(y, m, d) {
  return m >= 1 && m <= 12 && d >= 1 && d <= lastDay(y, m);
}

const fullYear = (y) => (y < 100 ? 2000 + y : y);

// A date range term, both ends inclusive, as UAE calendar days.
const dateTerm = (from, to, label) => ({ kind: 'date', from, to, label });

export function parseInvoiceSearch(q, now = Date.now()) {
  let text = String(q || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const terms = [];

  // Dates written with a month name: "28 oct 2026", "28 october", "oct 2026", "october".
  text = text.replace(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)? ${MONTH_RE}\\.?(?: (\\d{4}))?\\b`, 'g'), (all, d, mon, y) => {
    const m = monthIndex(mon);
    const year = y ? Number(y) : yearFor(m, Number(d), now);
    if (!validDay(year, m, Number(d))) return all;
    terms.push(dateTerm(iso(year, m, Number(d)), iso(year, m, Number(d)), all));
    return ' ';
  });
  text = text.replace(new RegExp(`\\b${MONTH_RE}\\.?(?: (\\d{4}))?\\b`, 'g'), (all, mon, y) => {
    const m = monthIndex(mon);
    const year = y ? Number(y) : yearFor(m, 1, now);
    terms.push(dateTerm(iso(year, m, 1), iso(year, m, lastDay(year, m)), all));
    return ' ';
  });
  // "aed 619.50" / "619.50 aed": the amount.
  text = text.replace(/\baed ?(\d+(?:[.,]\d{1,2})?)\b|\b(\d+(?:[.,]\d{1,2})?) ?aed\b/g, (all, a, b) => {
    terms.push({ kind: 'amount', value: Number(String(a || b).replace(',', '.')) });
    return ' ';
  });
  // A phone number typed with spaces: "+971 50 123 4567", "050 123 4567".
  text = text.replace(/(?:\+|\b)\d{2,4}(?: \d{2,4}){2,4}\b/g, (all) => {
    const digits = all.replace(/\D/g, '');
    if (digits.length < 7) return all;
    terms.push({ kind: 'phone', digits });
    return ' ';
  });

  for (const token of text.split(' ').filter(Boolean)) {
    let m;
    if ((m = token.match(/^(?:inv-?|#)0*(\d+)$/))) terms.push({ kind: 'invoice', n: Number(m[1]) });
    else if ((m = token.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)) && validDay(+m[1], +m[2], +m[3])) terms.push(dateTerm(iso(+m[1], +m[2], +m[3]), iso(+m[1], +m[2], +m[3]), token));
    else if ((m = token.match(/^(\d{4})-(\d{1,2})$/)) && +m[2] >= 1 && +m[2] <= 12) terms.push(dateTerm(iso(+m[1], +m[2], 1), iso(+m[1], +m[2], lastDay(+m[1], +m[2])), token));
    else if ((m = token.match(/^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2}|\d{4}))?$/))) {
      // Day first, as written in the UAE.
      const d = +m[1];
      const mo = +m[2];
      const y = m[3] ? fullYear(+m[3]) : yearFor(mo, d, now);
      if (validDay(y, mo, d)) terms.push(dateTerm(iso(y, mo, d), iso(y, mo, d), token));
      else terms.push({ kind: 'text', text: token });
    } else if ((m = token.match(/^(\d+)[.,](\d{1,2})$/))) terms.push({ kind: 'amount', value: Number(`${m[1]}.${m[2]}`) });
    else if ((m = token.match(/^\+?(\d{7,})$/))) terms.push({ kind: 'phone', digits: m[1] });
    else if ((m = token.match(/^\d{1,6}$/))) terms.push({ kind: 'number', n: Number(token) });
    else if (STATUS[token]) terms.push({ kind: 'status', statuses: STATUS[token] });
    else if (token.length >= 2) terms.push({ kind: 'text', text: token });
  }
  return terms;
}

// The UTC instants a date term covers (UAE midnight to midnight).
export function dateTermBounds(term) {
  const start = Date.parse(`${term.from}T00:00:00+04:00`);
  const end = Date.parse(`${term.to}T00:00:00+04:00`) + 24 * 60 * 60 * 1000;
  return { from: new Date(start).toISOString(), to: new Date(end).toISOString() };
}
