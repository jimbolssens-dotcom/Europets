// app/(admin)/dose-guidelines/page.jsx
// Dose guidelines: the dose each medicine is filled in at from the pet's
// weight on the consult, hospital and day-procedure screens, and the range
// it warns outside (migration 237, lib/doseGuidelines.js). One line per
// medicine and species (and variant, e.g. GS by FIP form). Editing a line
// saves it as approved under the name picked at the top, so every dose
// shows who set it and when.

'use client';

import { useEffect, useMemo, useState } from 'react';
import { loadReferenceList } from '@/lib/viewCache';
import { formatAmount } from '@/lib/doseGuidelines';

const RULE_LABELS = {
  mg_per_kg: 'Dose per kg',
  per_kg_amount: 'Amount per kg',
  per_animal: 'Same amount for every pet',
  bands: 'By weight band',
  note: 'Guidance only',
};
const SPECIES_LABELS = { cat: 'Cat', dog: 'Dog', any: 'Cat & dog' };
const SIGNER_KEY = 'europets_dose_signer';

const num = (v) => (v === null || v === undefined ? '' : String(Number(v)));
const range = (g) => {
  if (g.min_per_kg == null || g.max_per_kg == null) return '';
  return Number(g.min_per_kg) === Number(g.max_per_kg) ? num(g.min_per_kg) : `${num(g.min_per_kg)}–${num(g.max_per_kg)}`;
};

// What a line says when it isn't being edited.
function summary(g) {
  const unit = `${g.strength_unit || 'mg'}/kg`;
  if (g.rule === 'mg_per_kg') {
    return `${num(g.dose_per_kg)} ${unit}${range(g) ? ` (range ${range(g)})` : ''} · ${num(g.strength)} ${g.strength_unit || 'mg'} per ${g.dose_unit}`;
  }
  if (g.rule === 'per_kg_amount') return `${num(g.amount_per_kg)} ${g.dose_unit} per kg`;
  if (g.rule === 'per_animal') {
    const who = g.weight_min_kg != null ? ` for ${num(g.weight_min_kg)}–${num(g.weight_max_kg)} kg` : '';
    return `${g.fixed_amount != null ? formatAmount(g.fixed_amount, g.dose_unit) : '—'} per pet${who}`;
  }
  if (g.rule === 'bands') {
    const bands = (g.bands || []).map((b) => `≤${num(b.max_kg)} kg ${formatAmount(b.amount, g.dose_unit)}`).join(' · ');
    const more = g.band_step_kg ? ` · then +${formatAmount(g.band_step_amount, g.dose_unit)} per ${num(g.band_step_kg)} kg` : '';
    return bands + more;
  }
  return g.notes || 'Guidance only';
}

const bandsText = (bands) => (bands || []).map((b) => `${num(b.max_kg)}:${num(b.amount)}`).join(', ');
const parseBands = (text) =>
  String(text || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [max_kg, amount] = s.split(':').map((x) => Number(x.trim()));
      return { max_kg, amount };
    });

function Field({ label, children, wide }) {
  return (
    <label className={`dose-field${wide ? ' dose-field-wide' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

// The editing form for one line (or a new one).
function GuidelineForm({ initial, medicines, onSave, onCancel, onDelete, saving }) {
  const [f, setF] = useState(() => ({ ...initial, bandsText: bandsText(initial.bands) }));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const input = (k, props = {}) => <input value={f[k] ?? ''} onChange={set(k)} inputMode="decimal" {...props} />;
  return (
    <form
      className="dose-form"
      onSubmit={(e) => {
        e.preventDefault();
        const { bandsText: bt, goods_services, id, created_at, updated_at, approved_at, approved_by, ...rest } = f;
        onSave({ ...rest, bands: f.rule === 'bands' ? parseBands(bt) : null });
      }}
    >
      {!initial.id && (
        <Field label="Medicine" wide>
          <select value={f.goods_service_id || ''} onChange={set('goods_service_id')} required>
            <option value="">Pick a medicine…</option>
            {medicines.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Species">
        <select value={f.species} onChange={set('species')}>
          <option value="cat">Cat</option>
          <option value="dog">Dog</option>
          <option value="any">Cat & dog</option>
        </select>
      </Field>
      <Field label="Variant">{input('variant', { inputMode: 'text', placeholder: 'e.g. wet FIP' })}</Field>
      <Field label="How it's worked out" wide>
        <select value={f.rule} onChange={set('rule')}>
          {Object.entries(RULE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </Field>
      <Field label="Given as">
        <select value={f.dose_unit} onChange={set('dose_unit')}>
          {['ml', 'tablet', 'capsule', 'vial', 'ampoule', 'pipette', 'ribbon'].map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
      </Field>
      {f.rule === 'mg_per_kg' && (
        <>
          <Field label={`Strength (${f.strength_unit || 'mg'} per ${f.dose_unit})`}>{input('strength')}</Field>
          <Field label={`Dose (${f.strength_unit || 'mg'}/kg)`}>{input('dose_per_kg')}</Field>
          <Field label="Lowest">{input('min_per_kg')}</Field>
          <Field label="Highest">{input('max_per_kg')}</Field>
          <Field label="Round to">{input('round_to', { placeholder: '0.01' })}</Field>
        </>
      )}
      {f.rule === 'per_kg_amount' && (
        <>
          <Field label={`${f.dose_unit} per kg`}>{input('amount_per_kg')}</Field>
          <Field label="Round to">{input('round_to', { placeholder: '0.1' })}</Field>
        </>
      )}
      {f.rule === 'per_animal' && (
        <>
          <Field label={`Amount (${f.dose_unit})`}>{input('fixed_amount')}</Field>
          <Field label="For pets from (kg)">{input('weight_min_kg')}</Field>
          <Field label="to (kg)">{input('weight_max_kg')}</Field>
        </>
      )}
      {f.rule === 'bands' && (
        <>
          <Field label="Bands: up to kg:amount, …" wide>{input('bandsText', { inputMode: 'text', placeholder: '2.5:0.25, 5:0.5, 10:1, 20:2' })}</Field>
          <Field label="Then + amount">{input('band_step_amount')}</Field>
          <Field label="per kg above">{input('band_step_kg')}</Field>
        </>
      )}
      <Field label="How often" wide>{input('frequency', { inputMode: 'text' })}</Field>
      <Field label="Notes" wide>{input('notes', { inputMode: 'text' })}</Field>
      <div className="dose-form-actions">
        <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save & approve'}</button>
        <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
        {onDelete && (
          <button type="button" className="dose-delete" onClick={onDelete}>Remove</button>
        )}
      </div>
    </form>
  );
}

export default function DoseGuidelinesPage() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [vets, setVets] = useState([]);
  const [signer, setSigner] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // a guideline id, or 'new'
  const [saving, setSaving] = useState(false);
  const [catalog, setCatalog] = useState([]);

  const load = () =>
    fetch('/api/dose-guidelines', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => (Array.isArray(d) ? setRows(d) : setError(d.error || 'Could not load the guidelines')))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    loadReferenceList('/api/staff?active=true', (list) => setVets(list.filter((s) => s.role === 'vet')));
    try {
      setSigner(window.localStorage.getItem(SIGNER_KEY) || '');
    } catch {
      // storage blocked: pick each visit
    }
  }, []);

  useEffect(() => {
    if (editing !== 'new' || catalog.length) return;
    loadReferenceList('/api/goods-services?main_category=product&active=true', setCatalog);
  }, [editing, catalog.length]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byItem = new Map();
    for (const g of rows || []) {
      const name = g.goods_services?.name || 'Unknown item';
      if (q && !name.toLowerCase().includes(q)) continue;
      if (!byItem.has(g.goods_service_id)) byItem.set(g.goods_service_id, { name, inactive: g.goods_services?.active === false, lines: [] });
      byItem.get(g.goods_service_id).lines.push(g);
    }
    const order = { cat: 0, dog: 1, any: 2 };
    return [...byItem.values()]
      .map((grp) => ({ ...grp, lines: grp.lines.sort((a, b) => order[a.species] - order[b.species] || String(a.variant || '').localeCompare(String(b.variant || ''))) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, search]);

  function pickSigner(name) {
    setSigner(name);
    try {
      window.localStorage.setItem(SIGNER_KEY, name);
    } catch {
      // ignore
    }
  }

  async function save(id, values) {
    if (!signer) {
      setError('Pick who is approving (top right) before saving.');
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch(id ? `/api/dose-guidelines/${id}` : '/api/dose-guidelines', {
      method: id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...values, approved_by: signer }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error || 'Could not save');
      return;
    }
    setEditing(null);
    load();
  }

  async function remove(g) {
    if (!window.confirm(`Remove the ${SPECIES_LABELS[g.species].toLowerCase()} guideline for ${g.goods_services?.name}? It will no longer be filled in.`)) return;
    await fetch(`/api/dose-guidelines/${g.id}`, { method: 'DELETE' });
    setEditing(null);
    load();
  }

  const medicines = catalog.filter((c) => c.main_category === 'product').sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="dose-page">
      <div className="page-header">
        <h1>💊 Dose guidelines</h1>
        <div className="page-header-actions">
          <select value={signer} onChange={(e) => pickSigner(e.target.value)} aria-label="Approving as" className="dose-signer">
            <option value="">Approving as…</option>
            {vets.map((v) => (
              <option key={v.id} value={v.full_name}>{v.full_name}</option>
            ))}
          </select>
          <a href="/catalog" className="button-link">← Catalog</a>
        </div>
      </div>
      <p className="visit-meta dose-intro">
        Filled in from the pet&apos;s weight and billed as given. Outside the range it warns; well outside, it asks why.
      </p>
      <div className="dose-toolbar">
        <input type="search" placeholder="Search medicines" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button type="button" onClick={() => setEditing('new')}>+ Add</button>
      </div>
      {error && <p className="error">{error}</p>}
      {editing === 'new' && (
        <div className="card dose-card">
          <GuidelineForm
            initial={{ species: 'cat', rule: 'mg_per_kg', dose_unit: 'ml', strength_unit: 'mg', round_to: 0.01 }}
            medicines={medicines}
            saving={saving}
            onSave={(v) => save(null, v)}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}
      {!rows && !error && <p>Loading…</p>}
      {rows && groups.length === 0 && <p>No medicines match.</p>}
      {groups.map((grp) => (
        <div key={grp.name} className="card dose-card">
          <div className="dose-name">
            {grp.name}
            {grp.inactive && <span className="dose-chip">inactive</span>}
          </div>
          {grp.lines.map((g) =>
            editing === g.id ? (
              <GuidelineForm key={g.id} initial={g} medicines={medicines} saving={saving} onSave={(v) => save(g.id, v)} onCancel={() => setEditing(null)} onDelete={() => remove(g)} />
            ) : (
              <div key={g.id} className="dose-line">
                <span className="dose-species">{SPECIES_LABELS[g.species]}{g.variant ? ` · ${g.variant}` : ''}</span>
                <span className="dose-summary">
                  {summary(g)}
                  {g.frequency ? <em> · {g.frequency}</em> : null}
                  {g.notes && g.rule !== 'note' && !(g.rule === 'bands' && g.band_step_kg) ? <em> · {g.notes}</em> : null}
                </span>
                <span className="dose-approved" title={g.source || ''}>
                  {g.approved_at ? `✓ ${g.approved_by || 'Approved'}, ${new Date(g.approved_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'Not approved'}
                </span>
                <button type="button" className="secondary dose-edit" onClick={() => setEditing(g.id)}>Edit</button>
              </div>
            )
          )}
        </div>
      ))}
    </div>
  );
}
