// app/_components/HomeCareLogSheet.jsx
// "+ Log something" in the client app (home care, Jim, 10 Nov): the owner
// logs what they did for one pet or several at once (medication,
// deworming, flea/tick, supplement, weight, temperature, eating, a note or
// photo). Saved with POST /api/client-app/home-care/logs; staff see it on
// the patient file. A temperature over 39.5 °C shows the owner a warning to
// recheck and contact us; the clinic is not notified.

'use client';

import { useMemo, useRef, useState } from 'react';
import { LOG_KINDS, PRODUCT_SUGGESTIONS, TEMPERATURE_WARN_C } from '@/lib/homeCare';
import { uploadOwnerLogPhoto } from '@/lib/attachments';

function nowLocalInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

// pets: every pet the owner can choose ({ id, name, patient_number }).
// selected: the pets ticked to start with. pickMany: show the pet list
// straight away (the "Log for several" button).
export default function HomeCareLogSheet({ pets, selected = [], pickMany = false, onClose, onSaved }) {
  const [kind, setKind] = useState(null);
  const [product, setProduct] = useState('');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [when, setWhen] = useState(nowLocalInput());
  const [chosen, setChosen] = useState(() => new Set(selected));
  const [showPets, setShowPets] = useState(pickMany);
  const [search, setSearch] = useState('');
  const [photo, setPhoto] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);
  const fileRef = useRef(null);

  const info = LOG_KINDS.find((k) => k.kind === kind);
  const petList = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? pets.filter((p) => p.name?.toLowerCase().includes(q) || String(p.patient_number || '').includes(q)) : pets;
    return list.slice(0, 200);
  }, [pets, search]);
  const chosenNames = pets.filter((p) => chosen.has(p.id)).map((p) => p.name);

  function toggle(id) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setError(null);
    if (!info) return setError('Choose what you did');
    if (chosen.size === 0) return setError('Choose at least one pet');
    setSaving(true);
    try {
      let photoUrl = null;
      if (photo) photoUrl = await uploadOwnerLogPhoto([...chosen][0], photo);
      const res = await fetch('/api/client-app/home-care/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_ids: [...chosen],
          kind,
          product: product || undefined,
          value: value || undefined,
          note: note || undefined,
          photo_url: photoUrl || undefined,
          given_at: when ? new Date(when).toISOString() : undefined,
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'Could not save');
      onSaved?.(out.logs || []);
      if (kind === 'temperature' && Number(String(value).replace(',', '.')) > TEMPERATURE_WARN_C) {
        setWarning({ value: String(value).replace(',', '.'), name: chosenNames.length === 1 ? chosenNames[0] : 'your pet' });
      } else {
        onClose?.();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (warning) {
    return (
      <div className="hcl-backdrop">
        <div className="hcl-warning" role="alertdialog" aria-label="Temperature warning">
          <div className="hcl-warning-title">🌡️ {warning.value} °C is higher than normal</div>
          <p>Please check it again in 1 to 2 hours, with {warning.name} calm and rested.</p>
          <p>If it stays over {TEMPERATURE_WARN_C} °C, or {warning.name} seems unwell, contact us.</p>
          <div className="hcl-warning-actions">
            <a className="hcl-btn" href="/client-app/messages">💬 Contact us</a>
            <button type="button" className="hcl-btn hcl-btn-ghost" onClick={() => onClose?.()}>OK, I&apos;ll recheck</button>
          </div>
          <p className="hcl-small">Saved to {warning.name === 'your pet' ? 'the file' : `${warning.name}'s file`}. The clinic is not notified automatically.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="hcl-backdrop" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="hcl-sheet" role="dialog" aria-label="Log something">
        <div className="hcl-grab" />
        <div className="hcl-head">
          <b>What did you do?</b>
          <button type="button" className="hcl-close" onClick={() => onClose?.()} aria-label="Close">×</button>
        </div>
        <div className="hcl-tiles">
          {LOG_KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              className={`hcl-tile${kind === k.kind ? ' on' : ''}`}
              onClick={() => {
                setKind(k.kind);
                setProduct('');
                setValue('');
                setError(null);
              }}
            >
              <span>{k.icon}</span>
              {k.label}
            </button>
          ))}
        </div>

        {info && (
          <div className="hcl-fields">
            {info.product && (
              <>
                <label className="hcl-field">
                  <span>{kind === 'medication' ? 'Medicine' : 'Product'}</span>
                  <input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Name" maxLength={120} />
                </label>
                {PRODUCT_SUGGESTIONS[kind] && (
                  <div className="hcl-suggest">
                    {PRODUCT_SUGGESTIONS[kind].map((p) => (
                      <button key={p} type="button" className={product === p ? 'on' : ''} onClick={() => setProduct(p)}>{p}</button>
                    ))}
                  </div>
                )}
              </>
            )}
            {info.unit && (
              <label className="hcl-field">
                <span>{info.label}</span>
                <span className="hcl-unit">
                  <input type="text" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={kind === 'weight' ? '4.2' : '38.6'} />
                  {info.unit}
                </span>
              </label>
            )}
            {info.choices && (
              <div className="hcl-suggest">
                {info.choices.map((c) => (
                  <button key={c} type="button" className={product === c ? 'on' : ''} onClick={() => setProduct(c)}>{c}</button>
                ))}
              </div>
            )}
            <label className="hcl-field">
              <span>When</span>
              <input type="datetime-local" value={when} max={nowLocalInput()} onChange={(e) => setWhen(e.target.value)} />
            </label>
            <label className="hcl-field hcl-field-note">
              <span>{kind === 'note' ? 'Note' : 'Note (optional)'}</span>
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
            </label>
            <div className="hcl-photo">
              <button type="button" className="hcl-btn hcl-btn-ghost" onClick={() => fileRef.current?.click()}>📷 {photo ? 'Change photo' : 'Add a photo'}</button>
              {photo && <span className="hcl-small">{photo.name}</span>}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
            </div>
          </div>
        )}

        <div className="hcl-pets">
          <div className="hcl-pets-head">
            <span>
              For: <b>{chosen.size === 0 ? 'choose pets' : chosen.size <= 3 ? chosenNames.join(', ') : `${chosen.size} pets`}</b>
            </span>
            {pets.length > 1 && (
              <button type="button" className="hcl-link" onClick={() => setShowPets((v) => !v)}>
                {showPets ? 'Done' : 'Other pets too'}
              </button>
            )}
          </div>
          {showPets && (
            <>
              {pets.length > 8 && (
                <input className="hcl-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Search by name or number" />
              )}
              <div className="hcl-petlist">
                {petList.map((p) => (
                  <button key={p.id} type="button" className="hcl-pet" onClick={() => toggle(p.id)}>
                    <span className={`hcl-tick${chosen.has(p.id) ? ' on' : ''}`}>{chosen.has(p.id) ? '✓' : ''}</span>
                    <span className="hcl-pet-name">{p.name}</span>
                    {p.patient_number && <span className="hcl-small">#{p.patient_number}</span>}
                    {p.hint && <span className="hcl-small hcl-pet-hint">{p.hint}</span>}
                  </button>
                ))}
                {petList.length === 0 && <p className="hcl-small">No pet with that name.</p>}
              </div>
            </>
          )}
        </div>

        {error && <p className="client-app-login-error">{error}</p>}
        <button type="button" className="hcl-save" onClick={save} disabled={saving || !info || chosen.size === 0}>
          {saving ? 'Saving…' : chosen.size > 1 ? `Save for ${chosen.size} pets` : 'Save'}
        </button>
        {kind === 'deworm' && <p className="hcl-small">This also moves the deworming reminder on.</p>}
      </div>
    </div>
  );
}
