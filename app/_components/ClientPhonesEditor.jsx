// app/_components/ClientPhonesEditor.jsx
// Editable list of a client's phone numbers (see client_phones,
// migrations/055) — add as many as needed, each with a mandatory label
// (a preset from the dropdown, or free-typed custom text), and pick which
// one — at most one — is their preferred WhatsApp number. Used by both
// the "Add Client" form and the inline edit row on app/(admin)/clients.
//
// The whole list is replaced on save (see PATCH /api/clients/[id]), so
// this component just holds an array of {phone, label, is_whatsapp} (plus
// the UI-only `useCustomLabel` flag, ignored server-side) and reports the
// full array back up on every change — no per-row API calls.

'use client';

export const PRESET_PHONE_LABELS = ['Mobile', 'Home', 'Work', 'Husband', 'Wife', 'Maid', 'Driver', 'Other'];

export function emptyPhoneRow(isFirst) {
  return { phone: '', label: '', useCustomLabel: false, is_whatsapp: isFirst };
}

// Turns a saved {phone, label, is_whatsapp} row (from client_phones) back
// into this editor's shape, correctly detecting a custom label so it
// doesn't silently disappear behind a blank "Label..." dropdown.
export function toEditableRow(row) {
  const label = row.label || '';
  return {
    phone: row.phone || '',
    label,
    useCustomLabel: label !== '' && !PRESET_PHONE_LABELS.includes(label),
    is_whatsapp: Boolean(row.is_whatsapp),
  };
}

export default function ClientPhonesEditor({ phones, onChange, groupName }) {
  function updateRow(index, patch) {
    onChange(phones.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function setWhatsapp(index) {
    onChange(phones.map((p, i) => ({ ...p, is_whatsapp: i === index })));
  }

  function addRow() {
    onChange([...phones, emptyPhoneRow(phones.length === 0)]);
  }

  function removeRow(index) {
    const wasWhatsapp = phones[index]?.is_whatsapp;
    const rest = phones.filter((_, i) => i !== index);
    if (wasWhatsapp && rest.length > 0 && !rest.some((p) => p.is_whatsapp)) {
      rest[0] = { ...rest[0], is_whatsapp: true };
    }
    onChange(rest);
  }

  return (
    <div className="client-phones-editor">
      {phones.map((p, i) => (
        <div key={i} className="client-phone-row">
          <input
            type="tel"
            placeholder="Phone number"
            value={p.phone}
            onChange={(e) => updateRow(i, { phone: e.target.value })}
          />
          {p.useCustomLabel ? (
            <input
              placeholder="Custom label"
              value={p.label}
              onChange={(e) => updateRow(i, { label: e.target.value })}
            />
          ) : (
            <select
              value={PRESET_PHONE_LABELS.includes(p.label) ? p.label : ''}
              onChange={(e) =>
                e.target.value === '__custom__'
                  ? updateRow(i, { useCustomLabel: true, label: '' })
                  : updateRow(i, { label: e.target.value })
              }
            >
              <option value="">Label...</option>
              {PRESET_PHONE_LABELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
              <option value="__custom__">Custom...</option>
            </select>
          )}
          <label className="client-phone-whatsapp-choice">
            <input
              type="radio"
              name={`whatsapp-${groupName}`}
              checked={p.is_whatsapp}
              onChange={() => setWhatsapp(i)}
            />
            WhatsApp
          </label>
          <button type="button" className="client-phone-remove" onClick={() => removeRow(i)} aria-label="Remove number">
            ×
          </button>
        </div>
      ))}
      <button type="button" className="secondary client-phone-add" onClick={addRow}>
        + Add a phone number
      </button>
    </div>
  );
}
