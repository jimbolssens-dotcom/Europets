// app/vaccinations/page.jsx
// Vaccination Reminders: every patient's due/overdue vaccinations in one
// list, across the whole clinic. "WhatsApp"/"Email" draft a pre-filled
// reminder for staff to send themselves (there's no email service or
// WhatsApp Business API connected to send these automatically yet) and
// mark it reminded so the list doesn't nag about the same due date again.

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dateStr}T00:00:00`);
  return Math.round((due - today) / 86400000);
}

function dueLabel(dateStr) {
  const d = daysUntil(dateStr);
  if (d < 0) return `Overdue by ${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'}`;
  if (d === 0) return 'Due today';
  return `Due in ${d} day${d === 1 ? '' : 's'}`;
}

function formatDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function listNames(names) {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

// One patient can have several vaccines due on the same next_due_date (e.g.
// a Primary Booster's core vaccine + its rabies reminder) — group those into
// a single reminder row/message instead of sending one per vaccine.
function groupRows(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.patient_id}__${r.next_due_date}`;
    if (!groups.has(key)) {
      groups.set(key, { key, patient_id: r.patient_id, next_due_date: r.next_due_date, patients: r.patients, rows: [] });
    }
    groups.get(key).rows.push(r);
  }
  return [...groups.values()];
}

const WINDOWS = [
  { label: 'Overdue + 7 days', days: 7 },
  { label: 'Overdue + 30 days', days: 30 },
  { label: 'Overdue + 60 days', days: 60 },
];

export default function VaccinationsDuePage() {
  const [windowDays, setWindowDays] = useState(30);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () =>
    fetch(`/api/vaccinations?due=true&within_days=${windowDays}`)
      .then((res) => res.json())
      .then((data) => {
        setRows(Array.isArray(data) ? data.filter((r) => !r.patients?.deceased) : []);
        setLoading(false);
      });

  useEffect(() => {
    setLoading(true);
    load();

    const channel = supabase
      .channel('vaccinations-due')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vaccinations' }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowDays]);

  async function markReminded(ids) {
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/vaccinations/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mark_reminded: true }),
        })
      )
    );
    load();
  }

  function reminderMessage(group) {
    const client = group.patients?.clients;
    const status = daysUntil(group.next_due_date) < 0 ? 'overdue' : 'due';
    const vaccineNames = group.rows.map((r) => r.vaccine_name);
    const noun = vaccineNames.length === 1 ? 'vaccination is' : 'vaccinations are';
    return `Hi ${client?.full_name || 'there'}, a friendly reminder that ${
      group.patients?.name || 'your pet'
    }'s ${listNames(vaccineNames)} ${noun} ${status} (${formatDate(
      group.next_due_date
    )}). Please call us to book a time. — Europets Clinic`;
  }

  function draftWhatsApp(group) {
    const phone = (group.patients?.clients?.phone || '').replace(/\D/g, '');
    if (!phone) return;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(reminderMessage(group))}`, '_blank');
    markReminded(group.rows.map((r) => r.id));
  }

  function draftEmail(group) {
    const email = group.patients?.clients?.email;
    if (!email) return;
    const vaccineNames = group.rows.map((r) => r.vaccine_name);
    const subject = `${group.patients?.name || 'Your pet'}'s ${listNames(vaccineNames)} vaccination`;
    window.open(
      `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
        reminderMessage(group)
      )}`,
      '_blank'
    );
    markReminded(group.rows.map((r) => r.id));
  }

  if (loading) return <p>Loading vaccination reminders...</p>;

  return (
    <div>
      <h1>Vaccination Reminders</h1>
      <p className="visit-meta">
        Due and overdue vaccinations across every patient. WhatsApp/Email drafts a pre-filled
        reminder for you to send — there&apos;s no connected service to send these on their own yet.
      </p>

      <div className="window-filter">
        {WINDOWS.map((w) => (
          <button
            key={w.days}
            type="button"
            className={windowDays === w.days ? 'window-filter-active' : ''}
            onClick={() => setWindowDays(w.days)}
          >
            {w.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p>Nothing due in this window.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Patient</th>
              <th>Species</th>
              <th>Vaccine</th>
              <th>Due</th>
              <th>Owner</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {groupRows(rows).map((g) => {
              const allReminded = g.rows.every((r) => r.reminder_sent_at);
              const lastReminded = g.rows
                .map((r) => r.reminder_sent_at)
                .filter(Boolean)
                .sort()
                .pop();
              return (
                <tr key={g.key}>
                  <td className={daysUntil(g.next_due_date) < 0 ? 'error' : ''}>
                    {dueLabel(g.next_due_date)}
                  </td>
                  <td>
                    <a href={`/patients/${g.patients?.id}`}>{g.patients?.name}</a>
                  </td>
                  <td>{g.patients?.species}</td>
                  <td>{listNames(g.rows.map((r) => r.vaccine_name))}</td>
                  <td>{formatDate(g.next_due_date)}</td>
                  <td>{g.patients?.clients?.full_name || '—'}</td>
                  <td>
                    {g.patients?.clients?.phone && (
                      <button type="button" onClick={() => draftWhatsApp(g)}>
                        💬 WhatsApp
                      </button>
                    )}
                    {g.patients?.clients?.email && (
                      <button type="button" onClick={() => draftEmail(g)}>
                        ✉️ Email
                      </button>
                    )}
                    {allReminded ? (
                      <span className="visit-meta"> Reminded {formatDate(lastReminded.slice(0, 10))}</span>
                    ) : (
                      <button type="button" onClick={() => markReminded(g.rows.map((r) => r.id))}>
                        Mark Reminded
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
