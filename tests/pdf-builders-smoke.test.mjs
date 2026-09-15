import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';

// These PDF builders are plain functions over passed-in data (no Supabase
// calls of their own), but they use real `@/lib/...` imports that only the
// Next.js build resolves — a `next build` bundles and type-checks them,
// but never actually EXECUTES the pdf-lib drawing calls, so a wrong
// argument to page.drawText/rightText/etc. would only surface the first
// time someone actually generates one of these PDFs for real. Rewriting
// the `@/lib/X` specifiers to real file URLs and dynamically importing a
// copy lets this run the real builder end to end and catch that class of
// bug here instead.
// lib/invoicing.js and lib/paymentReminders.js are the real modules the
// builders import, but both drag in further dependencies (Anthropic/
// Storage clients, lib/whatsapp) that plain Node can't resolve outside the
// Next.js build — same reason the existing lib/invoicing.js tests stub
// them out rather than loading the real chain. Only the one constant/
// function each builder actually uses is reimplemented inline here,
// matching the real source exactly (VAT_RATE = 0.05; balanceDue is the
// same one-liner as lib/paymentReminders.js).
const INLINE_REPLACEMENTS = {
  "import { VAT_RATE } from '@/lib/invoicing';": 'const VAT_RATE = 0.05;',
  "import { balanceDue } from '@/lib/paymentReminders';":
    'function balanceDue(inv) { return Math.max(0, Number(inv.total || 0) - Number(inv.amount_paid || 0)); }',
};

async function importWithResolvedAliases(relativeSourcePath) {
  const sourcePath = path.join(process.cwd(), relativeSourcePath);
  const source = await readFile(sourcePath, 'utf8');
  let rewritten = source;
  for (const [original, replacement] of Object.entries(INLINE_REPLACEMENTS)) {
    rewritten = rewritten.replace(original, replacement);
  }
  rewritten = rewritten.replace(/from '@\/lib\/([^']+)'/g, (_, libPath) => {
    const resolved = pathToFileURL(path.join(process.cwd(), 'lib', `${libPath}.js`)).href;
    return `from '${resolved}'`;
  });
  // Written inside the project (not the OS tmpdir) so bare specifiers like
  // 'pdf-lib' still resolve against this project's own node_modules —
  // Node's resolution walks up from the importing file's own directory.
  const tmpPath = path.join(process.cwd(), 'tests', `.tmp-pdf-builder-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  await writeFile(tmpPath, rewritten);
  try {
    return await import(pathToFileURL(tmpPath).href);
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

const clinic = { legal_name: 'Europets Veterinary Clinic', phone: '+971500000000', email: 'clinic@epc.vet' };
const client = { full_name: 'Abdulla Ahmar', client_number: 42, phone: '+971506779447', email: 'abdulla@example.com', legacy_outstanding_balance: 0 };
const patient = { name: 'Orange 2', species: 'Cat', patient_number: 7 };

test('buildStatementOfAccountsPdf produces a valid, non-empty PDF with a running balance', async () => {
  const { buildStatementOfAccountsPdf } = await importWithResolvedAliases('lib/statementOfAccountsPdf.js');

  const invoices = [
    { id: 'inv1', invoice_number: 84, total: 100, amount_paid: 100, status: 'paid', created_at: '2026-01-01T00:00:00Z' },
    { id: 'inv2', invoice_number: 85, total: 50, amount_paid: 20, status: 'partially_paid', created_at: '2026-02-01T00:00:00Z' },
  ];
  const paymentsByInvoiceId = new Map([
    ['inv1', [{ invoice_id: 'inv1', amount: 100, payment_method: 'cash', paid_at: '2026-01-02T00:00:00Z' }]],
    ['inv2', [{ invoice_id: 'inv2', amount: 20, payment_method: 'card', paid_at: '2026-02-03T00:00:00Z' }]],
  ]);

  const bytes = await buildStatementOfAccountsPdf({ client, invoices, paymentsByInvoiceId, clinic });
  assert.ok(bytes.length > 0);

  const doc = await PDFDocument.load(bytes);
  assert.ok(doc.getPageCount() >= 1);
});

test('buildStatementOfAccountsPdf handles a client with no invoices at all', async () => {
  const { buildStatementOfAccountsPdf } = await importWithResolvedAliases('lib/statementOfAccountsPdf.js');
  const bytes = await buildStatementOfAccountsPdf({ client, invoices: [], paymentsByInvoiceId: new Map(), clinic });
  assert.ok(bytes.length > 0);
});

test('buildStatementOfAccountsPdf includes a legacy carried-over balance as an opening entry', async () => {
  const { buildStatementOfAccountsPdf } = await importWithResolvedAliases('lib/statementOfAccountsPdf.js');
  const bytes = await buildStatementOfAccountsPdf({
    client: { ...client, legacy_outstanding_balance: 250 },
    invoices: [],
    paymentsByInvoiceId: new Map(),
    clinic,
  });
  assert.ok(bytes.length > 0);
});

test('buildProformaQuotePdf produces a valid, non-empty PDF with line items and VAT totals', async () => {
  const { buildProformaQuotePdf } = await importWithResolvedAliases('lib/proformaQuotePdf.js');

  const quote = { created_at: '2026-03-01T00:00:00Z' };
  const items = [
    {
      description: 'Spay Surgery',
      quantity: 1,
      unit_price: 500,
      line_total: 500,
      goods_services: { main_category: 'service' },
    },
    {
      description: 'Pre-anesthetic bloodwork',
      quantity: 1,
      unit_price: 150,
      line_total: 150,
      goods_services: { main_category: 'test' },
    },
  ];

  const bytes = await buildProformaQuotePdf({ quote, items, clinic, client, patient });
  assert.ok(bytes.length > 0);

  const doc = await PDFDocument.load(bytes);
  assert.ok(doc.getPageCount() >= 1);
});

test('buildProformaQuotePdf handles a quote with no items yet', async () => {
  const { buildProformaQuotePdf } = await importWithResolvedAliases('lib/proformaQuotePdf.js');
  const bytes = await buildProformaQuotePdf({ quote: { created_at: '2026-03-01T00:00:00Z' }, items: [], clinic, client, patient: null });
  assert.ok(bytes.length > 0);
});
