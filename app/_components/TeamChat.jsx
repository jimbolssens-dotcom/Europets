// app/_components/TeamChat.jsx
// The clinic's team chat (migration 219, lib/teamChat.js): Messages → 👥
// Team on the desktop (app/(admin)/messages/team) and the phone app
// (app/mobile/team). The groups as chips with their unread counts, the
// chosen group's messages (polled every few seconds), and a composer with a
// photo, a file, a voice note and @mentions. A client's message shared in
// from their chat shows as a card with "Reply to client", which sends from
// the clinic WhatsApp number into that client's own chat.

'use client';

import { useEffect, useRef, useState } from 'react';
import { uploadTeamMedia } from '@/lib/attachments';

const STAFF_KEYS = ['team_staff_id', 'europets_mobile_staff_id', 'pay_link_staff_id', 'social_staff_id'];
const ROLE_LABEL = { vet: 'vet', tech: 'tech', reception: 'reception', admin: 'finance' };
// What reaches this person's WhatsApp (or phone, with no number on file).
const LEVELS = [
  ['all', '🔔'],
  ['mentions', '🔔@'],
  ['off', '🔕'],
];
const LEVEL_TEXT = { all: 'every message', mentions: 'only when someone @mentions you', off: 'nothing (an @mention still does)' };

function rememberedStaff() {
  try {
    for (const k of STAFF_KEYS) {
      const v = localStorage.getItem(k);
      if (v) return v;
    }
  } catch {}
  return '';
}

function timeOf(iso) {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return d.toLocaleString('en-GB', today ? { hour: 'numeric', minute: '2-digit', hour12: true } : { day: '2-digit', month: '2-digit', hour: 'numeric', minute: '2-digit', hour12: true });
}

// The message text with each @Name of a member in pink.
function withMentions(text, members) {
  if (!text) return null;
  const names = members.map((m) => `@${m.full_name}`).sort((a, b) => b.length - a.length);
  if (!names.length) return text;
  const esc = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return text.split(new RegExp(`(${esc.join('|')})`, 'gi')).map((part, k) =>
    names.some((n) => n.toLowerCase() === part.toLowerCase()) ? (
      <span key={k} className="team-at">
        {part}
      </span>
    ) : (
      part
    )
  );
}

function ReplyToClient({ message, staffId, onDone }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/clients/${message.ref.client_id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: text.trim(), staff_id: staffId, channel: 'whatsapp' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      return setError(data.error || 'Could not send it. Try again.');
    }
    await fetch(`/api/team/messages/${message.id}/replied`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_id: staffId }),
    }).catch(() => {});
    setBusy(false);
    onDone();
  }
  return (
    <div className="team-reply">
      <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={`Reply to ${message.ref.client_name || 'the client'}`} autoFocus />
      <div className="team-row">
        <button type="button" onClick={send} disabled={busy || !text.trim()}>
          {busy ? 'Sending...' : '📲 Send on WhatsApp'}
        </button>
        <button type="button" className="secondary" onClick={() => onDone(false)} disabled={busy}>
          Cancel
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function Message({ m, me, members, staffId, onReplied }) {
  const [replying, setReplying] = useState(false);
  const mine = m.staff_id === me;
  return (
    <div className={`team-msg${mine ? ' team-msg-mine' : ''}`}>
      {!mine && <span className="team-av">{(m.staff_name || '?')[0]}</span>}
      <div className="team-bubble">
        <div className="team-who">
          {mine ? 'You' : m.staff_name}
          {ROLE_LABEL[m.staff_role] && <span> · {ROLE_LABEL[m.staff_role]}</span>}
        </div>
        {m.body && <div className="team-text">{withMentions(m.body, members)}</div>}
        {m.media_type === 'image' && (
          <a href={m.media_url} target="_blank" rel="noreferrer">
            <img className="team-photo" src={m.media_url} alt="" loading="lazy" />
          </a>
        )}
        {m.media_type === 'audio' && <audio className="team-audio" src={m.media_url} controls preload="none" />}
        {m.media_type === 'file' && (
          <a className="team-file" href={m.media_url} target="_blank" rel="noreferrer">
            📎 {m.media_name || 'File'}
          </a>
        )}
        {m.ref?.kind === 'client_message' && (
          <div className="team-card">
            <div>
              💬 <b>{m.ref.client_name || 'Client'}</b>
              {m.ref.quote ? `: "${m.ref.quote}"` : ''}
            </div>
            {m.ref.patient_name && <span className="team-chip">🐾 {m.ref.patient_name}</span>}
            {m.replied_at ? (
              <div className="team-replied">✓ Replied by {m.replied_by_name || 'the team'}</div>
            ) : replying ? (
              <ReplyToClient
                message={m}
                staffId={staffId}
                onDone={(sent) => {
                  setReplying(false);
                  if (sent !== false) onReplied();
                }}
              />
            ) : null}
            {!replying && (
              <div className="team-row">
                {!m.replied_at && (
                  <button type="button" onClick={() => setReplying(true)} disabled={!staffId}>
                    Reply to client
                  </button>
                )}
                <a className="button-link social-ghost" href={`/messages/${m.ref.client_id}`}>
                  Open chat
                </a>
              </div>
            )}
          </div>
        )}
        <div className="team-time">
          {timeOf(m.created_at)}
          {mine && m.seen_by > 0 && ` · ✓✓ seen by ${m.seen_by}`}
        </div>
      </div>
    </div>
  );
}

export default function TeamChat({ staff: staffProp = null, initialGroup = null }) {
  const [staff, setStaff] = useState(staffProp || []);
  const [me, setMe] = useState('');
  const [groups, setGroups] = useState(null);
  const [level, setLevel] = useState('all');
  const [groupKey, setGroupKey] = useState(initialGroup || 'everyone');
  const [thread, setThread] = useState(null);
  const [error, setError] = useState(null);
  const [text, setText] = useState('');
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(null); // 'send' | 'upload' | 'rec'
  const recRef = useRef(null);
  const endRef = useRef(null);
  const lastCount = useRef(0);

  useEffect(() => {
    setMe(rememberedStaff());
    if (!staffProp)
      fetch('/api/staff')
        .then((r) => r.json())
        .then((d) => setStaff(Array.isArray(d) ? d.filter((s) => s.active !== false) : []))
        .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function chooseMe(id) {
    setMe(id);
    try {
      localStorage.setItem('team_staff_id', id);
    } catch {}
  }

  const loadSummary = () =>
    fetch(`/api/team${me ? `?staff_id=${me}` : ''}`)
      .then((r) => r.json())
      .then((d) => {
        setGroups(d.groups || []);
        if (d.level) setLevel(d.level);
      })
      .catch(() => {});

  const loadThread = () =>
    fetch(`/api/team/${groupKey}${me ? `?staff_id=${me}` : ''}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'Could not load the chat.');
        return d;
      })
      .then((d) => {
        setThread(d);
        setError(null);
      })
      .catch((err) => setError(err.message));

  useEffect(() => {
    loadSummary();
    const t = setInterval(loadSummary, 15000);
    return () => clearInterval(t);
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setThread(null);
    lastCount.current = 0;
    loadThread().then(loadSummary);
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') loadThread();
    }, 4000);
    return () => clearInterval(t);
  }, [groupKey, me]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const n = thread?.messages?.length || 0;
    if (n !== lastCount.current) endRef.current?.scrollIntoView({ block: 'end' });
    lastCount.current = n;
  }, [thread]);

  const members = thread?.group?.members || [];
  // The @ being typed at the end of the text, if any.
  const atMatch = text.match(/@([^@\n]{0,30})$/);
  const suggestions = atMatch ? members.filter((m) => m.id !== me && m.full_name.toLowerCase().startsWith(atMatch[1].toLowerCase())).slice(0, 6) : [];

  function pickMention(m) {
    setText(text.replace(/@([^@\n]{0,30})$/, `@${m.full_name} `));
    setPicked((p) => [...new Set([...p, m.id])]);
  }

  async function post(payload) {
    if (!me) return setError('Pick who you are first.');
    const res = await fetch(`/api/team/${groupKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_id: me, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Could not send it.');
    await loadThread();
  }

  async function send(e) {
    e?.preventDefault();
    if (!text.trim()) return;
    setBusy('send');
    try {
      await post({ body: text, mentions: picked });
      setText('');
      setPicked([]);
    } catch (err) {
      setError(err.message);
    }
    setBusy(null);
  }

  async function sendFile(file, kind) {
    if (!file) return;
    setBusy('upload');
    try {
      const up = await uploadTeamMedia(groupKey, file);
      await post({ body: text, mentions: picked, media_url: up.url, media_type: kind, media_name: up.name });
      setText('');
      setPicked([]);
    } catch (err) {
      setError(err.message);
    }
    setBusy(null);
  }

  async function toggleVoice() {
    if (recRef.current) {
      recRef.current.stop();
      return;
    }
    if (!me) return setError('Pick who you are first.');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ['audio/mp4', 'audio/webm'].find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks = [];
      rec.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        recRef.current = null;
        const mime = rec.mimeType || type || 'audio/webm';
        const blob = new Blob(chunks, { type: mime });
        const file = new File([blob], `voice-note.${mime.includes('mp4') ? 'm4a' : 'webm'}`, { type: mime });
        if (blob.size > 0) sendFile(file, 'audio');
        else setBusy(null);
      };
      recRef.current = rec;
      rec.start();
      setBusy('rec');
    } catch {
      setError("The microphone isn't available here. Allow it in the browser and try again.");
    }
  }

  async function changeLevel() {
    const next = LEVELS[(LEVELS.findIndex(([k]) => k === level) + 1) % LEVELS.length][0];
    setLevel(next);
    await fetch('/api/team/notify', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_id: me, level: next }),
    }).catch(() => {});
  }

  return (
    <div className="team-chat">
      <div className="team-groups">
        {(groups || []).map((g) => (
          <button key={g.key} type="button" className={`team-group${g.key === groupKey ? ' team-group-on' : ''}`} onClick={() => setGroupKey(g.key)}>
            {g.name}
            {g.unread > 0 && g.key !== groupKey ? <b className="team-unread">{g.unread}</b> : g.key === groupKey ? <span className="team-count"> · {g.member_count}</span> : null}
          </button>
        ))}
      </div>

      {thread?.group && (
        <p className="team-on-wa visit-meta">
          📱 {members.filter((m) => m.on_whatsapp).length} of {members.length} get {thread.group.name} on WhatsApp
          {members.some((m) => !m.on_whatsapp) && (
            <>
              {' · '}
              <a href="/staff">add numbers</a>
            </>
          )}
        </p>
      )}
      {!me && (
        <div className="team-who-pick">
          <span>Who are you?</span>
          <select value="" onChange={(e) => chooseMe(e.target.value)} aria-label="Who are you">
            <option value="">Pick your name...</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="team-thread">
        {!thread && !error && <p className="visit-meta">Loading...</p>}
        {thread?.messages?.length === 0 && <p className="visit-meta">No messages in {thread.group.name} yet. Say hello 👋</p>}
        {thread?.messages?.map((m) => (
          <Message key={m.id} m={m} me={me} members={members} staffId={me} onReplied={loadThread} />
        ))}
        <div ref={endRef} />
      </div>
      {error && <p className="error">{error}</p>}

      {suggestions.length > 0 && (
        <div className="team-suggest">
          {suggestions.map((m) => (
            <button key={m.id} type="button" onClick={() => pickMention(m)}>
              @{m.full_name}
            </button>
          ))}
        </div>
      )}
      <form className="team-compose" onSubmit={send}>
        {me && (
          <button type="button" className="team-icon team-bell" onClick={changeLevel} title={`Your WhatsApp gets ${LEVEL_TEXT[level]}. Tap to change.`} aria-label="Phone alerts">
            {LEVELS.find(([k]) => k === level)?.[1]}
          </button>
        )}
        <label className="team-icon" title="Photo" aria-label="Photo">
          📷
          <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; sendFile(f, 'image'); }} disabled={!!busy || !me} />
        </label>
        <label className="team-icon" title="File" aria-label="File">
          ＋
          <input type="file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; sendFile(f, f?.type.startsWith('image/') ? 'image' : 'file'); }} disabled={!!busy || !me} />
        </label>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={busy === 'rec' ? 'Recording... tap ⏹ to send' : `Message ${thread?.group?.name || 'the team'}, @ to mention`}
          aria-label="Message"
          disabled={busy === 'rec'}
        />
        {text.trim() ? (
          <button type="submit" className="team-send" disabled={!!busy || !me} aria-label="Send">
            {busy === 'send' ? '…' : '➤'}
          </button>
        ) : (
          <button type="button" className={`team-send${busy === 'rec' ? ' team-recording' : ''}`} onClick={toggleVoice} disabled={(!!busy && busy !== 'rec') || !me} aria-label={busy === 'rec' ? 'Stop and send' : 'Voice note'}>
            {busy === 'rec' ? '⏹' : busy === 'upload' ? '…' : '🎤'}
          </button>
        )}
      </form>
    </div>
  );
}
