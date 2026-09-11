// app/mobile/day-procedures/page.js
// Today's day procedures, in progress — tap one to open its checklist
// (see app/mobile/day-procedures/[id]/page.js). Unlike Dental/Surgery's
// mobile pickers, there's nothing to "start" here: a day procedure already
// exists as a hospitalization row by the time staff work through its
// checklist (created from the patient file, a consult, or automatically
// when a surgery-type appointment is checked in).

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import MobileHomeButton from '@/app/_components/MobileHomeButton';

export default function MobileDayProceduresPage() {
  const [dayProcedures, setDayProcedures] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () =>
    fetch('/api/hospitalizations?kind=day_procedure&status=admitted')
      .then((res) => res.json())
      .then((data) => {
        setDayProcedures(Array.isArray(data) ? data : []);
        setLoading(false);
      });

  useEffect(() => {
    load();
    const channel = supabase
      .channel('mobile-day-procedures')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hospitalizations' }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mobile-page">
      <MobileHomeButton />
      <h1>📋 Day Procedures</h1>
      <p className="mobile-hint">Pick a patient to work through their checklist.</p>

      {loading ? (
        <p>Loading...</p>
      ) : dayProcedures.length === 0 ? (
        <p>No day procedures in progress right now.</p>
      ) : (
        <ul className="mobile-list">
          {dayProcedures.map((d) => (
            <li key={d.id}>
              <a href={`/mobile/day-procedures/${d.id}`} className="mobile-list-item">
                <span className="mobile-list-title">
                  {d.patients?.name}
                  {d.patients?.patient_number ? ` (Patient #${d.patients.patient_number})` : ''}
                </span>
                <span className="mobile-list-meta">
                  {d.clients?.full_name}
                  {d.clients?.client_number ? ` (Client #${d.clients.client_number})` : ''}
                  {d.reason ? ` · ${d.reason}` : ''}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
