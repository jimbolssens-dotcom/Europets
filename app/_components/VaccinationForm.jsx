// app/_components/VaccinationForm.jsx
// The "Add Vaccination" card — species-filtered checklist plus the
// Annual/Primary Booster choice. Takes the state/handlers from
// useVaccinations as props so it can be laid out differently per page.

'use client';

export default function VaccinationForm({
  species,
  speciesClass,
  relevantProtocols,
  protocolsError,
  form,
  setForm,
  submitting,
  error,
  toggleProtocol,
  addVaccination,
  staff,
}) {
  return (
    <form className="card" onSubmit={(e) => e.preventDefault()}>
      <h3>Add Vaccination</h3>
      {error && <p className="error">{error}</p>}
      {protocolsError && (
        <p className="error">
          {protocolsError} — check the <a href="/vaccine-protocols">Vaccine Protocols catalog</a> in
          Settings.
        </p>
      )}
      {!protocolsError && relevantProtocols.length === 0 && (
        <p className="error">
          No active vaccine protocols found. Add some on the{' '}
          <a href="/vaccine-protocols">Vaccine Protocols</a> page under Settings.
        </p>
      )}
      {!speciesClass && relevantProtocols.length > 0 && (
        <p className="visit-meta">
          Couldn&apos;t tell cat vs dog from &quot;{species}&quot; — showing every protocol.
        </p>
      )}
      {relevantProtocols.length > 0 && (
        <fieldset className="vaccine-checklist">
          <legend>Vaccines given</legend>
          {relevantProtocols.map((p) => (
            <label key={p.id} className="vaccine-checklist-item">
              <input
                type="checkbox"
                checked={form.vaccine_protocol_ids.includes(p.id)}
                onChange={() => toggleProtocol(p.id)}
              />
              {p.name} {p.core ? '' : '(optional)'}
            </label>
          ))}
        </fieldset>
      )}

      <label>
        Date given
        <input
          type="date"
          required
          value={form.date_given}
          onChange={(e) => setForm({ ...form, date_given: e.target.value })}
        />
      </label>

      <input
        placeholder="Batch number (optional)"
        value={form.batch_number}
        onChange={(e) => setForm({ ...form, batch_number: e.target.value })}
      />

      <select
        value={form.administered_by}
        onChange={(e) => setForm({ ...form, administered_by: e.target.value })}
      >
        <option value="">Administered by (optional)...</option>
        {(staff || []).map((s) => (
          <option key={s.id} value={s.id}>
            {s.full_name}
          </option>
        ))}
      </select>

      <textarea
        rows={2}
        placeholder="Notes (optional)"
        value={form.notes}
        onChange={(e) => setForm({ ...form, notes: e.target.value })}
      />

      <p className="visit-meta" style={{ margin: 0 }}>
        Primary Booster schedules the core vaccine for a 1-month booster and, if rabies isn&apos;t
        checked above, adds a rabies reminder for that same date.
      </p>
      <div className="vaccine-submit-actions">
        <button
          type="button"
          onClick={(e) => addVaccination(e, false)}
          disabled={submitting || form.vaccine_protocol_ids.length === 0}
        >
          {submitting ? 'Saving...' : 'Add as Annual Vaccine'}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={(e) => addVaccination(e, true)}
          disabled={submitting || form.vaccine_protocol_ids.length === 0}
        >
          {submitting ? 'Saving...' : 'Add as Primary Booster'}
        </button>
      </div>
    </form>
  );
}
