// app/_components/PatientAlerts.jsx
// A patient's long-term notes — dated, newest first, with an add form.
// Takes usePatientAlerts' state as props (same split as
// useVaccinations/VaccinationForm/VaccinationHistory) so the consult page
// and patient page can lay it out differently.

'use client';

export default function PatientAlerts({ alerts, text, setText, authorId, setAuthorId, submitting, addAlert, deleteAlert, staff = [] }) {
  return (
    <div className="patient-alerts">
      {alerts.length === 0 ? (
        <p className="visit-meta">No long-term notes for this patient yet.</p>
      ) : (
        <ul className="patient-alerts-list">
          {alerts.map((a) => (
            <li key={a.id}>
              <span className="patient-alert-date">
                {new Date(a.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              <span className="patient-alert-text">{a.note_text}</span>
              <span className="patient-alert-author">{a.staff?.full_name || 'Unknown'}</span>
              <button type="button" onClick={() => deleteAlert(a.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={addAlert} className="patient-alerts-form">
        <select value={authorId} onChange={(e) => setAuthorId(e.target.value)}>
          <option value="">Author...</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </select>
        <input
          placeholder="e.g. Aggressive with handling, allergic to penicillin..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : 'Add'}
        </button>
      </form>
    </div>
  );
}
