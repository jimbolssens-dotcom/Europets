// app/mobile/hospitalization/page.js
// Currently-admitted patients, one tap into recording a worksheet entry
// for that cage.

'use client';

import { useEffect, useState } from 'react';

export default function MobileHospitalizationListPage() {
  const [admissions, setAdmissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/hospitalizations?status=admitted')
      .then((res) => res.json())
      .then((data) => {
        setAdmissions(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="mobile-page">
      <a href="/mobile" className="mobile-back">
        &larr; Record
      </a>
      <h1>Hospitalization</h1>

      {loading ? (
        <p>Loading...</p>
      ) : admissions.length === 0 ? (
        <p>No patients currently admitted.</p>
      ) : (
        <ul className="mobile-list">
          {admissions.map((a) => (
            <li key={a.id}>
              <a href={`/mobile/hospitalization/${a.id}`} className="mobile-list-item">
                <span className="mobile-list-title">
                  {a.cages?.name || 'No cage'} — {a.patients?.name}
                </span>
                <span className="mobile-list-meta">{a.clients?.full_name}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
