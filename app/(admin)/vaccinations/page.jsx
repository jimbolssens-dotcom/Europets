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

  async function markReminded(id) {
    await fetch(`/api/vaccinations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mark_reminded: true }),
    });
    load();
  }

  function reminderMessage(row) {
    const client = row.patients?.clients;
    const status = daysUntil(row.next_due_date) < 0 ? 'overdue' : 'due';
    return `Hi ${client?.full_name || 'there'}, a friendly reminder that ${
      row.patients?.name || 'your pet'
    }'s ${row.vaccine_name} vaccination is ${status} (${formatDate(
      row.next_due_date
    )}). Please call us to book a time. — Europets Clinic`;
  }

  function draftWhatsApp(row) {
    const phone = (row.patients?.clients?.phone || '').replace(/\D/g, '');
    if (!phone) return;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(reminderMessage(row))}`, '_blank');
    markReminded(row.id);
  }

  function draftEmail(row) {
    const email = row.patients?.clients?.email;
    if (!email) return;
    const subject = `${row.patients?.name || 'Your pet'}'s ${row.vaccine_name} vaccination`;
    window.open(
      `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
        reminderMessage(row)
      )}`,
      '_blank'
    );
    markReminded(row.id);
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
            {rows.map((r) => (
              <tr key={r.id}>
                <td className={daysUntil(r.next_due_date) < 0 ? 'error' : ''}>
                  {dueLabel(r.next_due_date)}
                </td>
                <td>
                  <a href={`/patients/${r.patients?.id}`}>{r.patients?.name}</a>
                </td>
                <td>{r.patients?.species}</td>
                <td>{r.vaccine_name}</td>
                <td>{formatDate(r.next_due_date)}</td>
                <td>{r.patients?.clients?.full_name || '—'}</td>
                <td>
                  {r.patients?.clients?.phone && (
                    <button type="button" onClick={() => draftWhatsApp(r)}>
                      💬 WhatsApp
                    </button>
                  )}
                  {r.patients?.clients?.email && (
                    <button type="button" onClick={() => draftEmail(r)}>
                      ✉️ Email
                    </button>
                  )}
                  {r.reminder_sent_at ? (
                    <span className="visit-meta"> Reminded {formatDate(r.reminder_sent_at.slice(0, 10))}</span>
                  ) : (
                    <button type="button" onClick={() => markReminded(r.id)}>
                      Mark Reminded
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
