// app/vaccinations/page.jsx
// Vaccination Reminders: every patient's due/overdue vaccinations in one
// list, across the whole clinic. "WhatsApp" sends the reminder
// automatically (see POST /api/vaccinations/send-reminder — a
// pre-approved Meta template, so it reaches a client whether or not
// they've already messaged the clinic's WhatsApp number; its Quick Reply
// button lets them book straight through that same conversation) and
// marks it reminded so the list doesn't nag about the same due date
// again. "Email" still drafts a pre-filled message for staff to send
// themselves — there's no connected email service.

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import InfoHint from '@/app/_components/InfoHint';
import { reminderEligibility } from '@/lib/vaccinationReminderPolicy';

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
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-GB');
}

function listNames(names) {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

// One patient can have several vaccines due on the same next_due_date (e.g.
// a Primary Booster's core vaccine + its rabies reminder) — group those into
// a single reminder row/message instead of sending one per vaccine. Every
// row in a group is reminded together (see send-reminder), so their
// reminder_sent_at/reminder_count stay in lockstep — take the first row's.
function groupRows(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.patient_id}__${r.next_due_date}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        patient_id: r.patient_id,
        next_due_date: r.next_due_date,
        patients: r.patients,
        reminder_sent_at: r.reminder_sent_at,
        reminder_count: r.reminder_count,
        rows: [],
      });
    }
    groups.get(key).rows.push(r);
  }
  return [...groups.values()].map((g) => ({ ...g, eligibility: reminderEligibility(g) }));
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
  const [sendingKey, setSendingKey] = useState(null);
  const [sendResult, setSendResult] = useState(null); // { key, ok: boolean, message: string } | null

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

  // Sends the reminder automatically over WhatsApp (see POST
  // /api/vaccinations/send-reminder — a pre-approved template, since this
  // needs to reach the client whether or not they've already messaged the
  // clinic's WhatsApp number) instead of drafting one for staff to send
  // from their own phone. Its Quick Reply "Book Appointment" button lands
  // the client straight in a booking conversation with the AI concierge.
  async function sendWhatsApp(group) {
    setSendingKey(group.key);
    setSendResult(null);
    const res = await fetch('/api/vaccinations/send-reminder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: group.rows.map((r) => r.id) }),
    });
    const data = await res.json().catch(() => null);
    setSendingKey(null);
    if (!res.ok) {
      setSendResult({ key: group.key, ok: false, message: data?.error || 'Failed to send' });
      return;
    }
    setSendResult({ key: group.key, ok: true, message: 'Sent' });
    load();
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
      <h1>
        Vaccination Reminders{' '}
        <InfoHint>
          Due and overdue vaccinations across every patient. WhatsApp sends the reminder
          automatically, with a button the client can tap to book right in that conversation.
          Email still drafts a pre-filled message for you to send yourself.
        </InfoHint>
      </h1>

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
        (() => {
          const groups = groupRows(rows);
          const activeGroups = groups.filter((g) => !g.eligibility.lapsed);
          const lapsedGroups = groups.filter((g) => g.eligibility.lapsed);
          return (
            <>
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
                  {activeGroups.map((g) => {
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
                            <button
                              type="button"
                              onClick={() => sendWhatsApp(g)}
                              disabled={sendingKey === g.key || !g.eligibility.canSendNow}
                              title={g.eligibility.reason || ''}
                            >
                              {sendingKey === g.key ? 'Sending…' : '💬 WhatsApp'}
                            </button>
                          )}
                          {g.patients?.clients?.email && (
                            <button type="button" onClick={() => draftEmail(g)}>
                              ✉️ Email
                            </button>
                          )}
                          {!g.eligibility.canSendNow && !sendResult && (
                            <span className="visit-meta"> {g.eligibility.reason}</span>
                          )}
                          {sendResult?.key === g.key && (
                            <span className={sendResult.ok ? 'visit-meta' : 'error'}> {sendResult.message}</span>
                          )}
                          {allReminded ? (
                            <span className="visit-meta"> Reminded {formatDate(lastReminded.slice(0, 10))}</span>
                          ) : (
                            <button type="button" onClick={() => markReminded(g.rows.map((r) => r.id))}>
                              Done
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {lapsedGroups.length > 0 && (
                <details className="case-files">
                  <summary>
                    📵 Lapsed — needs a phone call, not another WhatsApp ({lapsedGroups.length})
                  </summary>
                  <p className="visit-meta">
                    Past the automatic-reminder cutoff (badly overdue, or already reminded the maximum
                    number of times with no response) — WhatsApp is disabled here on purpose. Follow up
                    directly, or edit the vaccination&apos;s due date once you know where things stand.
                  </p>
                  <table>
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th>Patient</th>
                        <th>Vaccine</th>
                        <th>Due</th>
                        <th>Owner</th>
                        <th>Phone</th>
                        <th>Reminded</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lapsedGroups.map((g) => (
                        <tr key={g.key}>
                          <td className="error">{dueLabel(g.next_due_date)}</td>
                          <td>
                            <a href={`/patients/${g.patients?.id}`}>{g.patients?.name}</a>
                          </td>
                          <td>{listNames(g.rows.map((r) => r.vaccine_name))}</td>
                          <td>{formatDate(g.next_due_date)}</td>
                          <td>{g.patients?.clients?.full_name || '—'}</td>
                          <td>{g.patients?.clients?.phone || '—'}</td>
                          <td>{g.reminder_count || 0}×</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
            </>
          );
        })()
      )}
    </div>
  );
}
