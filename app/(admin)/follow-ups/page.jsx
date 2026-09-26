// app/(admin)/follow-ups/page.jsx
// Discharge Follow-ups: post-surgery/dental "how's recovery going?"
// WhatsApp check-ins, review-first (see migration 146 and
// lib/dischargeFollowups.js for the full design). Opening this page is
// what actually promotes anything now due — GET /api/discharge-followups
// re-checks eligibility (not deceased, not rehomed, not readmitted) and
// either drafts a message here for review, or skips it with a visible
// reason. Nothing on this page sends automatically; every send is a
// staff click on a specific drafted message.

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import InfoHint from '@/app/_components/InfoHint';

function formatDateTime(iso) {
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: 'numeric', minute: '2-digit', hour12: true });
}

export default function DischargeFollowupsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState({}); // { [id]: edited message text }
  const [actingId, setActingId] = useState(null);
  const [actionError, setActionError] = useState(null);

  const load = () =>
    fetch('/api/discharge-followups')
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setRows(list);
        // Only seeds a draft the first time a row shows up — never
        // overwrites text staff is actively editing on a later refresh.
        setDrafts((prev) => {
          const next = { ...prev };
          for (const r of list) {
            if (r.status === 'ready_for_review' && next[r.id] === undefined) next[r.id] = r.message_draft || '';
          }
          return next;
        });
        setLoading(false);
      });

  useEffect(() => {
    load();
    const channel = supabase
      .channel('discharge-followups')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'discharge_followups' }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function act(id, action, extra) {
    setActingId(id);
    setActionError(null);
    const res = await fetch(`/api/discharge-followups/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    });
    const data = await res.json().catch(() => ({}));
    setActingId(null);
    if (!res.ok) {
      setActionError(data.error || `Failed to ${action}`);
      return;
    }
    load();
  }

  const readyForReview = rows.filter((r) => r.status === 'ready_for_review');
  const scheduled = rows.filter((r) => r.status === 'scheduled');
  const sent = rows.filter((r) => r.status === 'sent');
  const skipped = rows.filter((r) => r.status === 'skipped');

  if (loading) return <p>Loading follow-ups...</p>;

  return (
    <div>
      <h1>
        Follow-ups{' '}
        <InfoHint>
          Post-surgery/dental "how's recovery going?" check-ins. Every message here is drafted for
          you to read and edit — nothing sends until you click Send. A patient marked deceased or
          rehomed, or readmitted to hospitalization since discharge, is skipped automatically
          instead of showing up here.
        </InfoHint>
      </h1>
      {actionError && <p className="error">{actionError}</p>}

      {readyForReview.length === 0 ? (
        <p>Nothing waiting for review right now.</p>
      ) : (
        <ul className="mobile-list">
          {readyForReview.map((r) => (
            <li key={r.id}>
              <div className="mobile-list-item">
                <span className="mobile-list-title">
                  {r.patients?.name}
                  {r.patients?.patient_number ? ` (Patient #${r.patients.patient_number})` : ''}
                </span>
                <span className="mobile-list-meta">
                  {r.clients?.full_name}
                  {r.clients?.client_number ? ` (Client #${r.clients.client_number})` : ''}
                  {r.procedure_name ? ` · ${r.procedure_name}` : ''} · due {formatDateTime(r.due_at)}
                </span>
                <textarea
                  rows={3}
                  value={drafts[r.id] ?? ''}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))}
                  onBlur={() => act(r.id, 'edit', { message: drafts[r.id] })}
                />
                <div className="day-plan-consult-actions">
                  <button
                    type="button"
                    onClick={() => act(r.id, 'send', { message: drafts[r.id] })}
                    disabled={actingId === r.id || !drafts[r.id]?.trim()}
                  >
                    {actingId === r.id ? 'Sending…' : '💬 Send'}
                  </button>
                  <button
                    type="button"
                    className="day-plan-cancel-action"
                    onClick={() => act(r.id, 'skip')}
                    disabled={actingId === r.id}
                  >
                    Skip
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <details className="messages-setup-toggle">
        <summary>Scheduled ({scheduled.length})</summary>
        {scheduled.length === 0 ? (
          <p className="visit-meta">Nothing scheduled.</p>
        ) : (
          <ul className="mobile-list">
            {scheduled.map((r) => (
              <li key={r.id}>
                <div className="mobile-list-item">
                  <span className="mobile-list-title">{r.patients?.name}</span>
                  <span className="mobile-list-meta">
                    {r.procedure_name ? `${r.procedure_name} · ` : ''}due {formatDateTime(r.due_at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </details>

      <details className="messages-setup-toggle">
        <summary>Skipped ({skipped.length})</summary>
        {skipped.length === 0 ? (
          <p className="visit-meta">Nothing skipped.</p>
        ) : (
          <ul className="mobile-list">
            {skipped.map((r) => (
              <li key={r.id}>
                <div className="mobile-list-item">
                  <span className="mobile-list-title">{r.patients?.name}</span>
                  <span className="mobile-list-meta">{r.skip_reason}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </details>

      <details className="messages-setup-toggle">
        <summary>Sent ({sent.length})</summary>
        {sent.length === 0 ? (
          <p className="visit-meta">Nothing sent yet.</p>
        ) : (
          <ul className="mobile-list">
            {sent.map((r) => (
              <li key={r.id}>
                <div className="mobile-list-item">
                  <span className="mobile-list-title">{r.patients?.name}</span>
                  <span className="mobile-list-meta">
                    Sent {formatDateTime(r.sent_at)} · {r.message_draft}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
