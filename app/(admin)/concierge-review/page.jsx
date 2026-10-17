// app/(admin)/concierge-review/page.jsx
// Before and after for the WhatsApp concierge: real moments from the reviews
// (lib/conciergeReplayCases.js), each showing what was actually sent and what
// the concierge would do now, worked out live as a dry run (nothing is sent,
// booked or moved). See app/api/whatsapp/concierge-replay.

'use client';

import { useEffect, useState } from 'react';

const SENDER = { client: 'Client', staff: 'Staff', ai: 'AI', system: 'Automatic' };

function uaeTime(iso) {
  return new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' });
}

function text(row) {
  if (row.media_type === 'audio') return row.transcript ? `🎤 ${row.transcript}` : '🎤 voice note';
  if (row.media_type) return row.body ? `📎 ${row.body}` : `📎 ${row.media_type}`;
  return row.body || '';
}

function Bubble({ row }) {
  const side = row.sender === 'client' ? 'cr-in' : 'cr-out';
  return (
    <div className={`cr-bubble ${side}${row.is_notice ? ' cr-notice' : ''}`}>
      <span className="cr-who">
        {row.is_notice ? 'Automatic notice' : SENDER[row.sender] || row.sender} · {uaeTime(row.created_at)}
      </span>
      {text(row)}
    </div>
  );
}

// What the replay decided, in plain words.
function Outcome({ after }) {
  if (!after) return <p className="cr-muted">Working it out…</p>;
  const look = (after.trace || []).find((t) => t.second_look)?.second_look;
  const tools = (after.trace || [])
    .flatMap((t) => (t.tool_calls || []).map((c) => c.name))
    .filter((n) => n !== 'hand_to_staff' && n !== 'stay_silent');
  const bubble = (who, body, notice) => (
    <div className={`cr-bubble cr-out cr-new${notice ? ' cr-notice' : ''}`}>
      <span className="cr-who">{who}</span>
      {body}
    </div>
  );
  let main;
  if (after.action === 'reply') main = bubble('AI', after.reply);
  else if (after.action === 'handover')
    main = (
      <>
        <p className="cr-verdict">Hands it to staff: {after.reason}</p>
        {after.message ? bubble('AI, to the client while staff take it', after.message, true) : <p className="cr-muted">Sends the client nothing{after.messageHeldBack ? ` (${after.messageHeldBack})` : ''}.</p>}
      </>
    );
  else if (after.action === 'silent') main = <p className="cr-verdict">Stays silent: {after.reason}</p>;
  else if (after.action === 'error') main = <p className="cr-verdict">The AI failed ({after.reason}); fallback: {after.message || 'nothing'}</p>;
  else main = <p className="cr-verdict">Skipped: {after.reason}</p>;
  return (
    <>
      {main}
      <p className="cr-muted">
        {tools.length ? `Looked up: ${[...new Set(tools)].join(', ')}. ` : ''}
        {look?.fix ? `Second look sent its first draft back: “${look.fix}”` : look ? 'Second look: OK.' : ''}
      </p>
    </>
  );
}

function Case({ index, label }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    fetch(`/api/whatsapp/concierge-replay?case=${index}`)
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setData(d)))
      .catch((e) => setError(e.message));
  }, [index]);
  return (
    <section className="card cr-case">
      <h2>{label}</h2>
      {error && <p className="cr-muted">Couldn't replay this one: {error}</p>}
      {data && (
        <div className="cr-thread">
          {data.context.map((r, i) => (
            <Bubble key={i} row={r} />
          ))}
        </div>
      )}
      <div className="cr-compare">
        <div>
          <h3>What was sent</h3>
          {data ? data.before.length ? data.before.map((r, i) => <Bubble key={i} row={r} />) : <p className="cr-verdict">Nothing, until the client wrote again</p> : <p className="cr-muted">Loading…</p>}
        </div>
        <div>
          <h3>New concierge</h3>
          {error ? null : <Outcome after={data?.after} />}
        </div>
      </div>
    </section>
  );
}

export default function ConciergeReviewPage() {
  const [cases, setCases] = useState([]);
  useEffect(() => {
    fetch('/api/whatsapp/concierge-replay')
      .then((r) => r.json())
      .then((d) => setCases(Array.isArray(d) ? d : []));
  }, []);
  return (
    <div>
      <div className="page-header">
        <h1>AI concierge: before and after</h1>
      </div>
      <p className="cr-muted">
        Real conversations replayed as they stood at the time, through the new concierge: it reads the conversation and the situation and decides for itself whether to reply, hand to staff with its own message, or say nothing, with a second look before it acts. A dry run: nothing is sent, booked or moved. Appointments are as they are on file today, so a booking that has since moved shows its new time.
      </p>
      {cases.map((c) => (
        <Case key={c.index} index={c.index} label={c.label} />
      ))}
    </div>
  );
}
