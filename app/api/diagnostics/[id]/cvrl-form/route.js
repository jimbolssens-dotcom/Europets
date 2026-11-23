// app/api/diagnostics/[id]/cvrl-form/route.js
// Staff only. CVRL's General Requisition Form for a test sent to the lab
// (a biopsy, cytology, culture, postmortem), filled in from the case
// (lib/cvrlForm.js, Jim, 23 Nov).
// GET  -> what the form will say ({ data, samples, tests }), for the panel
//         where staff check the ticks, the site and the history first.
// POST { samples, tests, site, history, other_sample, other_test } -> the
//         filled PDF.

import fs from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { sanitizeForFont } from '@/lib/pdfTextSafety';
import { cvrlFormData, fillCvrlForm, CVRL_SAMPLES, CVRL_TESTS } from '@/lib/cvrlForm';

export const dynamic = 'force-dynamic';

function clip(text, max) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trim()}…` : t;
}

async function loadCase(id) {
  const { data: d } = await supabase
    .from('diagnostics')
    .select('id, created_at, description, result, visit_id, hospitalization_id, goods_services(name)')
    .eq('id', id)
    .maybeSingle();
  if (!d) return null;
  const patientCols = 'name, patient_number, species, breed, sex, date_of_birth, microchip_number';
  let record = null;
  let history = '';
  let vetName = null;
  if (d.visit_id) {
    const { data: v } = await supabase
      .from('visits')
      .select(`anamnesis, findings, diagnosis, attending_vet_id, patients(${patientCols}), clients(full_name)`)
      .eq('id', d.visit_id)
      .maybeSingle();
    record = v;
    history = [v?.anamnesis && `History: ${clip(v.anamnesis, 300)}`, v?.findings && `Findings: ${clip(v.findings, 300)}`, v?.diagnosis && `Diagnosis: ${clip(v.diagnosis, 200)}`]
      .filter(Boolean)
      .join('\n');
    if (v?.attending_vet_id) {
      const { data: s } = await supabase.from('staff').select('full_name').eq('id', v.attending_vet_id).maybeSingle();
      vetName = s?.full_name || null;
    }
  } else if (d.hospitalization_id) {
    const { data: h } = await supabase
      .from('hospitalizations')
      .select(`reason, admitted_at, patients(${patientCols}), clients(full_name)`)
      .eq('id', d.hospitalization_id)
      .maybeSingle();
    record = h;
    history = h?.reason ? `Hospitalised: ${clip(h.reason, 500)}` : '';
  }
  const { data: clinic } = await supabase.from('clinic_settings').select('legal_name, address, phone, email').eq('id', true).maybeSingle();
  return { diagnostic: d, testName: d.goods_services?.name || 'Sample', patient: record?.patients, client: record?.clients, clinic, vetName, history };
}

export async function GET(request, { params }) {
  const c = await loadCase(params.id);
  if (!c) return NextResponse.json({ error: 'test not found' }, { status: 404 });
  return NextResponse.json({ data: cvrlFormData(c), samples: CVRL_SAMPLES, tests: CVRL_TESTS });
}

export async function POST(request, { params }) {
  const body = await request.json().catch(() => ({}));
  const c = await loadCase(params.id);
  if (!c) return NextResponse.json({ error: 'test not found' }, { status: 404 });
  const keys = (list, allowed) => (Array.isArray(list) ? list.filter((k) => allowed.some((a) => a.key === k)) : undefined);
  const overrides = {
    samples: keys(body.samples, CVRL_SAMPLES),
    tests: keys(body.tests, CVRL_TESTS),
    site: typeof body.site === 'string' ? body.site.slice(0, 120) : undefined,
    history: typeof body.history === 'string' ? body.history.slice(0, 900) : undefined,
    other_sample: typeof body.other_sample === 'string' ? body.other_sample.slice(0, 120) : '',
    other_test: typeof body.other_test === 'string' ? body.other_test.slice(0, 120) : '',
  };
  const template = await fs.readFile(path.join(process.cwd(), 'assets', 'cvrl-requisition-form.pdf'));
  const probe = await PDFDocument.create();
  const font = await probe.embedFont(StandardFonts.Helvetica);
  const bytes = await fillCvrlForm(template, cvrlFormData({ ...c, overrides }), { PDFDocument, StandardFonts, sanitize: (t) => sanitizeForFont(font, t) });
  const name = `CVRL-${(c.patient?.name || 'sample').replace(/[^A-Za-z0-9]+/g, '-')}.pdf`;
  return new NextResponse(bytes, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${name}"`, 'Cache-Control': 'no-store' },
  });
}
