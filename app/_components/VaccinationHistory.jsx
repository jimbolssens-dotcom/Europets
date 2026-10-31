// app/_components/VaccinationHistory.jsx
// Read-only vaccination history table for one patient, with a Delete
// action per record.

'use client';

import { formatDate, dueStatus } from './useVaccinations';

export default function VaccinationHistory({ vaccinations, onDelete }) {
  if (vaccinations.length === 0) return <p>No vaccinations recorded yet.</p>;

  return (
    <table className="phone-list vaccination-history">
      <thead>
        <tr>
          <th>Vaccine</th>
          <th>Given</th>
          <th>Next due</th>
          <th>By</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {vaccinations.map((v) => {
          // A later dose of this vaccine replaced it (migration 228): done,
          // not overdue.
          const status = v.superseded_by ? { label: 'Done, next dose given', className: 'visit-meta' } : dueStatus(v.next_due_date);
          return (
            <tr key={v.id}>
              <td className="pl-main">
                {v.vaccine_name}
                {v.is_primary && <span className="primary-badge">Primary</span>}
                {v.batch_number && <div className="visit-meta">Batch {v.batch_number}</div>}
                {v.notes && <div className="visit-meta">{v.notes}</div>}
              </td>
              <td className="pl-sub">{v.date_given ? formatDate(v.date_given) : <em>{v.superseded_by ? 'Given later' : 'Scheduled'}</em>}</td>
              <td className={`pl-right pl-light ${status?.className || ''}`}>{status?.label || '—'}</td>
              <td className={v.staff?.full_name ? 'pl-sub' : 'pl-hide'}>{v.staff?.full_name || '—'}</td>
              <td className="pl-act">
                {/* Rare, so a small grey ✕ rather than a big Delete button. */}
                <button type="button" className="invoice-line-remove" onClick={() => onDelete(v)} title="Delete this vaccination" aria-label={`Delete ${v.vaccine_name}`}>
                  ✕
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
