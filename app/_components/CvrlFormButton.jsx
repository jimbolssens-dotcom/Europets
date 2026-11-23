// app/_components/CvrlFormButton.jsx
// "🧪 CVRL form" on a test that goes to the lab (a biopsy, cytology,
// culture, postmortem): CVRL's General Requisition Form, filled in from the
// case (lib/cvrlForm.js). The panel shows what will be ticked and written,
// so the site, tests and history can be checked first, then it opens the
// filled PDF to print.

'use client';

import { useState } from 'react';

export default function CvrlFormButton({ diagnosticId }) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function start() {
    setOpen(true);
    if (info) return;
    setError(null);
    const res = await fetch(`/api/diagnostics/${diagnosticId}/cvrl-form`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error || 'Could not load the case');
    setInfo(data);
    setForm({
      samples: data.data.samples,
      tests: data.data.tests,
      site: data.data.site || '',
      history: data.data.history || '',
      other_sample: '',
      other_test: '',
    });
  }

  const toggle = (key, value) =>
    setForm((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value] }));

  async function print() {
    setBusy(true);
    setError(null);
    // Opened first, filled after: a tab opened after the wait would be
    // blocked as a pop-up on phones.
    const tab = window.open('', '_blank');
    try {
      const res = await fetch(`/api/diagnostics/${diagnosticId}/cvrl-form`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not fill the form');
      const url = URL.createObjectURL(await res.blob());
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (err) {
      tab?.close();
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="secondary cvrl-form-button" onClick={start} title="CVRL's requisition form for this sample, filled in from the case">
        🧪 CVRL form
      </button>
    );
  }
  return (
    <div className="cvrl-form-panel">
      <div className="cvrl-form-head">
        <strong>CVRL requisition form</strong>
        <button type="button" className="rare-link" onClick={() => setOpen(false)}>Close</button>
      </div>
      {error && <p className="error">{error}</p>}
      {!form ? (
        !error && <p className="visit-meta">Loading…</p>
      ) : (
        <>
          <p className="visit-meta">
            {info.data.animal} · owner {info.data.owner || 'not on file'} · sampled {info.data.sampledAt}
          </p>
          <fieldset>
            <legend>Sample</legend>
            {info.samples.map((s) => (
              <label key={s.key} className="cvrl-check">
                <input type="checkbox" checked={form.samples.includes(s.key)} onChange={() => toggle('samples', s.key)} /> {s.label}
              </label>
            ))}
            <input placeholder="Site (biopsy / swab)" value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })} />
            <input placeholder="Other sample (optional)" value={form.other_sample} onChange={(e) => setForm({ ...form, other_sample: e.target.value })} />
          </fieldset>
          <fieldset>
            <legend>Investigations</legend>
            {info.tests.map((t) => (
              <label key={t.key} className="cvrl-check">
                <input type="checkbox" checked={form.tests.includes(t.key)} onChange={() => toggle('tests', t.key)} /> {t.label}
              </label>
            ))}
            <input placeholder="Other investigation (optional)" value={form.other_test} onChange={(e) => setForm({ ...form, other_test: e.target.value })} />
          </fieldset>
          <label className="cvrl-history">
            History
            <textarea rows={4} value={form.history} maxLength={900} onChange={(e) => setForm({ ...form, history: e.target.value })} />
          </label>
          <button type="button" onClick={print} disabled={busy}>{busy ? 'Filling…' : '📄 Open the filled form'}</button>
        </>
      )}
    </div>
  );
}
