// app/_components/VaccinationHistory.jsx
// Read-only vaccination history table for one patient, with a Delete
// action per record.

'use client';

import { formatDate, dueStatus } from './useVaccinations';

export default function VaccinationHistory({ vaccinations, onDelete }) {
  if (vaccinations.length === 0) return <p>No vaccinations recorded yet.</p>;

  return (
    <table>
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
          const status = dueStatus(v.next_due_date);
          return (
            <tr key={v.id}>
              <td>
                {v.vaccine_name}
                {v.is_primary && <span className="primary-badge">Primary</span>}
                {v.batch_number && <div className="visit-meta">Batch {v.batch_number}</div>}
                {v.notes && <div className="visit-meta">{v.notes}</div>}
              </td>
              <td>{v.date_given ? formatDate(v.date_given) : <em>Scheduled</em>}</td>
              <td className={status?.className}>{status?.label || '—'}</td>
              <td>{v.staff?.full_name || '—'}</td>
              <td>
                <button type="button" onClick={() => onDelete(v)}>
                  Delete
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
