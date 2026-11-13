// app/_components/SignatureUpload.jsx
// Upload a vet's signature or stamp (Staff page), printed on prescriptions
// (migration 251). A photo of it on white paper is
// enough: the paper is made transparent and the image cropped before it's
// saved (lib/inkImage.js). Shows the saved one with Replace / Remove.

'use client';

import { useEffect, useRef, useState } from 'react';
import { cleanInkImage } from '@/lib/inkImage';

export default function SignatureUpload({ staffId, kind = 'signature', label = '✍️ Signature' }) {
  const base = `/api/signatures/${staffId}?kind=${kind}`;
  const [version, setVersion] = useState(0);
  const [has, setHas] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const input = useRef(null);
  const src = `${base}&v=${version}`;

  useEffect(() => {
    let off = false;
    fetch(src, { method: 'GET' })
      .then((r) => !off && setHas(r.ok))
      .catch(() => !off && setHas(false));
    return () => {
      off = true;
    };
  }, [src]);

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await cleanInkImage(file);
      const res = await fetch(base, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data_url: dataUrl }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'Could not save it');
      setVersion((v) => v + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm('Remove it? Prescriptions will print it blank instead.')) return;
    setBusy(true);
    await fetch(base, { method: 'DELETE' }).catch(() => {});
    setBusy(false);
    setVersion((v) => v + 1);
  }

  return (
    <span className="sig-upload">
      <span className="sig-label">{label}</span>
      {has && <img className="sig-preview" src={src} alt="" />}
      <input ref={input} type="file" accept="image/*" hidden onChange={pick} />
      <button type="button" className="hc-link" disabled={busy} onClick={() => input.current?.click()} title="A close photo of it on white paper">
        {busy ? 'Saving…' : has ? 'Replace' : '+ Upload photo'}
      </button>
      {has && (
        <button type="button" className="hc-link" disabled={busy} onClick={remove}>
          Remove
        </button>
      )}
      {error && <span className="error">{error}</span>}
    </span>
  );
}
