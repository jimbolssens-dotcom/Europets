// app/_components/VaccinationForm.jsx
// The "Add Vaccination" card — species-filtered checklist plus the
// Annual/Primary Booster choice. Takes the state/handlers from
// useVaccinations as props so it can be laid out differently per page.

'use client';

import InfoHint from '@/app/_components/InfoHint';
import { todayISODate } from '@/app/_components/useVaccinations';

function formatShort(iso) {
  return new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

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
  addBooster,
  openCourse,
  ageMonths,
  staff,
}) {
  return (
    <form className="card" onSubmit={(e) => e.preventDefault()}>
      <h3>
        Add Vaccination{' '}
        <InfoHint>
          Primary charges the whole course today (the consult, both doses of the core vaccine and
          rabies) and books the core vaccine&apos;s booster a month later. From 3 months old rabies
          goes in today; younger, it waits for the booster. At the booster visit, press Booster:
          it&apos;s free, linked to the first visit, and starts the normal 12-month cycle.
        </InfoHint>
        {ageMonths != null && <span className="vaccine-chip">{ageMonths < 24 ? `${ageMonths} months old` : `${Math.floor(ageMonths / 12)} years old`}</span>}
      </h3>
      {error && <p className="error">{error}</p>}
      {openCourse && (
        <div className="vaccine-course-line">
          <span className="vaccine-chip vaccine-chip-paid">
            Primary {formatShort(openCourse.course.date_given)} · booster {openCourse.boosterDue ? formatShort(openCourse.boosterDue) : 'due'} · paid
          </span>
        </div>
      )}
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

      {(() => {
        const core = relevantProtocols.find((p) => p.core && !p.is_rabies);
        const rabies = relevantProtocols.find((p) => p.is_rabies);
        const both = core && rabies && form.vaccine_protocol_ids.includes(core.id) && form.vaccine_protocol_ids.includes(rabies.id);
        if (!both) return null;
        return (
          <div className="vaccine-given-as" role="radiogroup" aria-label="Vials used">
            <label>
              <input type="radio" name="given_as" checked={(form.given_as || 'combo') === 'combo'} onChange={() => setForm({ ...form, given_as: 'combo' })} />
              One combo vial
            </label>
            <label>
              <input type="radio" name="given_as" checked={form.given_as === 'separate'} onChange={() => setForm({ ...form, given_as: 'separate' })} />
              Two separate vials
            </label>
          </div>
        );
      })()}

      <label>
        Date given
        <input
          type="date"
          required
          max={todayISODate()}
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

      <label className="treat-item-billable-toggle">
        <input
          type="checkbox"
          checked={form.skip_billing}
          onChange={(e) => setForm({ ...form, skip_billing: e.target.checked })}
        />
        Already paid for — just record it, don&apos;t add a charge
      </label>

      <div className="vaccine-submit-actions">
        {openCourse && (
          <button type="button" onClick={addBooster} disabled={submitting || form.vaccine_protocol_ids.length === 0}>
            {submitting ? 'Saving...' : '💉 Booster'}
          </button>
        )}
        <button
          type="button"
          className={openCourse ? 'secondary' : undefined}
          onClick={(e) => addVaccination(e, false)}
          disabled={submitting || form.vaccine_protocol_ids.length === 0}
        >
          {submitting ? 'Saving...' : 'Annual'}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={(e) => addVaccination(e, true)}
          disabled={submitting || form.vaccine_protocol_ids.length === 0}
        >
          {submitting ? 'Saving...' : 'Primary'}
        </button>
      </div>
    </form>
  );
}
