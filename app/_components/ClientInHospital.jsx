// app/_components/ClientInHospital.jsx
// "🏥 In hospital (n)" on the client page (Jim, 23 Nov): a small drop-down
// of this client's pets that are admitted right now (hospital stays and
// day procedures), each a link straight to its case, so a rescuer's cat in
// hospital is one tap away. Shows nothing when none are in.

'use client';

import { useEffect, useState } from 'react';
import { formatShortDate } from '@/lib/formatTimestamp';
import { attachCageNames } from '@/lib/clientInHospital';

export default function ClientInHospital({ clientId }) {
  const [stays, setStays] = useState([]);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    Promise.all([
      fetch(`/api/hospitalizations?client_id=${clientId}&status=admitted`).then((r) => (r.ok ? r.json() : [])),
      fetch('/api/cages').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([list, cages]) => {
        if (!cancelled) setStays(attachCageNames(Array.isArray(list) ? list : [], Array.isArray(cages) ? cages : []));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (!stays.length) return null;
  return (
    <details className="case-tab-menu client-in-hospital">
      <summary className="case-tab" title="This client's pets in hospital or a day procedure now">
        🏥<span className="client-long-label"> In hospital</span> <b>{stays.length}</b>
      </summary>
      <div className="case-tab-dropdown">
        <ul className="client-in-hospital-list">
          {stays.map((s) => (
            <li key={s.id}>
              <a href={`/hospitalization/${s.id}`}>
                <strong>{s.patients?.name || 'Patient'}</strong>
                {s.patients?.patient_number ? <span className="visit-meta"> #{s.patients.patient_number}</span> : null}
                <span className="visit-meta">
                  {' · '}
                  {s.kind === 'day_procedure' ? 'Day procedure' : 'Hospital'}
                  {s.cageName ? ` · ${s.cageName}` : ''}
                  {' · since '}
                  {formatShortDate(s.admitted_at)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
