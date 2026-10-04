'use client';

// The colourful "📋 Bookings" tab on the Appointments page, and the
// compact one-line-per-booking list it pops open over the schedule —
// tap the tab again (or Escape) to close it. Replaced the old Morning/
// Afternoon scroll buttons: staff kept scrolling past the whole schedule
// to the day list underneath just to see client/reason details the
// schedule blocks don't have room for.
//
// Loads its own appointments (today through the next 7 days) rather than
// reusing the schedule's, so "Today" / "Tomorrow" / "Next 7 days" always
// mean the real today regardless of which week or month the schedule is
// currently showing. Every action goes through the page's own handlers
// (check in, remind, cancel, delete), so it behaves exactly like the day
// list does.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { colorForAppointment, UNASSIGNED_STAFF_COLOR } from '@/lib/staffColors';

function pad(n) { return String(n).padStart(2, '0'); }
function toISODate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function toMonthKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
function addDays(date, amount) { const d = new Date(date); d.setDate(d.getDate() + amount); return d; }
function formatTime(iso) { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }); }

const RANGES = [
  { key: 'today', label: 'Today', days: [0] },
  { key: 'tomorrow', label: 'Tomorrow', days: [1] },
  { key: 'week', label: 'Next 7 days', days: [0, 1, 2, 3, 4, 5, 6] },
];
const TYPE_LABELS = { consult: 'Consult', surgery: 'Surgery', video: 'Video' };
const INACTIVE = new Set(['cancelled', 'no_show']);

export default function BookingsPopover({
  refreshTick,
  vets,
  vetColor,
  rowStatus,
  openVisitFor,
  onOpenRecord,
  onRemind,
  onCancel,
  onDelete,
  openingConsultId,
  sendingReminderId,
  reminderError,
}) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState('today');
  const [vetId, setVetId] = useState('');
  const [query, setQuery] = useState('');
  const [appointments, setAppointments] = useState([]);
  const [popStyle, setPopStyle] = useState(null);
  const anchorRef = useRef(null);

  useEffect(() => {
    const today = new Date();
    const months = [...new Set([toMonthKey(today), toMonthKey(addDays(today, 6))])];
    Promise.all(months.map((m) => fetch(`/api/appointments?month=${m}`).then((res) => res.json()).catch(() => [])))
      .then((chunks) => {
        const byId = new Map();
        for (const chunk of chunks) if (Array.isArray(chunk)) for (const a of chunk) byId.set(a.id, a);
        setAppointments([...byId.values()]);
      });
  }, [refreshTick]);

  // Sizes the panel to the viewport and lines it up under the tab: right-
  // aligned with it where there's room, but never running off either edge
  // (16px gutter) — so on a phone it spans the screen just below the tab
  // instead of covering it, and the tab stays tappable to close it again.
  useLayoutEffect(() => {
    if (!open) return undefined;
    function place() {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const vw = document.documentElement.clientWidth;
      const width = Math.min(1100, vw - 32);
      const left = Math.min(Math.max(16, rect.right - width), vw - 16 - width);
      setPopStyle({ width, left: left - rect.left, right: 'auto' });
    }
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const days = useMemo(() => {
    const today = new Date();
    return RANGES.find((r) => r.key === range).days.map((offset) => toISODate(addDays(today, offset)));
  }, [range]);

  const todayActiveCount = useMemo(() => {
    const iso = toISODate(new Date());
    return appointments.filter((a) => a.type !== 'meeting' && !INACTIVE.has(a.status) && toISODate(new Date(a.start_time)) === iso).length;
  }, [appointments]);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = appointments
      .filter((a) => a.type !== 'meeting')
      .filter((a) => days.includes(toISODate(new Date(a.start_time))))
      .filter((a) => !vetId || a.vet_id === vetId)
      .filter((a) => !q || [a.patients?.name, a.clients?.full_name, a.clients?.client_number && `#${a.clients.client_number}`, a.clients?.client_number, a.reason]
        .some((v) => v && String(v).toLowerCase().includes(q)))
      .sort((x, y) => new Date(x.start_time) - new Date(y.start_time));
    return days.map((iso) => ({ iso, rows: rows.filter((a) => toISODate(new Date(a.start_time)) === iso) })).filter((g) => g.rows.length);
  }, [appointments, days, vetId, query]);

  function statusLabel(a) {
    const status = rowStatus(a);
    if (status === 'cancelled') return <span className="bookings-status muted">Cancelled</span>;
    if (status === 'no_show') return <span className="bookings-status muted">No-show</span>;
    if (status === 'complete') return <span className="bookings-status muted">Complete</span>;
    if (status === 'checked_in' || status === 'in_progress') return <span className="bookings-status in">● In consult</span>;
    if (a.reminder_sent_at) return <span className="bookings-status muted">✓ Reminded</span>;
    return <span className="bookings-status booked">● Booked</span>;
  }

  function actions(a) {
    const status = rowStatus(a);
    const busy = openingConsultId === a.id;
    const items = [];
    if (status === 'booked' && a.patient_id && !openVisitFor(a)) {
      items.push(<button key="go" type="button" className="bookings-act go" disabled={busy} onClick={() => onOpenRecord(a)} title="Check in and open the consult / day procedure">{busy ? '…' : 'Check in'}</button>);
    } else if (status === 'checked_in' || status === 'complete' || openVisitFor(a)) {
      items.push(<button key="go" type="button" className="bookings-act go" disabled={busy} onClick={() => onOpenRecord(a)} title="Open the consult / day procedure">{busy ? '…' : a.type === 'surgery' ? 'View procedure' : 'View consult'}</button>);
    }
    if (status === 'booked' && !openVisitFor(a) && a.clients?.phone) {
      items.push(<button key="rem" type="button" className="bookings-act rem" disabled={sendingReminderId === a.id} onClick={() => onRemind(a)} title="Send a WhatsApp reminder">{sendingReminderId === a.id ? '…' : '💬'}</button>);
    }
    if (!INACTIVE.has(a.status) && a.status !== 'complete') {
      items.push(<button key="x" type="button" className="bookings-act x" onClick={() => onCancel(a.id)} title="Cancel this appointment">Cancel</button>);
    }
    if (INACTIVE.has(a.status)) {
      items.push(<button key="del" type="button" className="bookings-act" onClick={() => onDelete(a.id)} title="Permanently delete">Delete</button>);
    }
    return items;
  }

  return (
    <div className="bookings-anchor" ref={anchorRef}>
      <button type="button" className={`bookings-tab ${open ? 'open' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}
        data-discover="Opens a compact list of booked appointments over the schedule — client, patient, reason and status on one line each, with check-in, reminder and cancel. Tap again to close.">
        📋 Bookings <span className="bookings-count">{todayActiveCount}</span> <span className="bookings-chev">▾</span>
      </button>
      {open && (
        <div className="bookings-pop" role="dialog" aria-label="Booked appointments" style={popStyle || undefined}>
          <div className="bookings-head">
            <strong>Booked appointments</strong>
            {RANGES.map((r) => (
              <button key={r.key} type="button" className={`bookings-chip ${range === r.key ? 'on' : ''}`} onClick={() => setRange(r.key)}>{r.label}</button>
            ))}
            <select className="bookings-vet" value={vetId} onChange={(e) => setVetId(e.target.value)}>
              <option value="">All vets</option>
              {(vets || []).map((v) => <option key={v.id} value={v.id}>{v.full_name}</option>)}
            </select>
            <input className="bookings-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search pet, client or #…" />
          </div>
          <div className="bookings-rows">
            {grouped.length === 0 && <p className="bookings-empty">No bookings {range === 'today' ? 'today' : range === 'tomorrow' ? 'tomorrow' : 'in the next 7 days'}{vetId || query ? ' matching that filter' : ''}.</p>}
            {grouped.map((g) => (
              <div key={g.iso}>
                <div className="bookings-day">{new Date(`${g.iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
                {g.rows.map((a) => {
                  const color = a.vet_id ? colorForAppointment(vetColor, a.vet_id, 'consult').fg : UNASSIGNED_STAFF_COLOR.fg;
                  return (
                    <div key={a.id} className={`bookings-row ${INACTIVE.has(a.status) ? 'inactive' : ''}`}>
                      <span className="bookings-time">{formatTime(a.start_time)}</span>
                      <span className="bookings-dot" style={{ background: color }} title={a.staff?.full_name || 'Unassigned'} />
                      <span className="bookings-pet">{a.patients?.name || (a.patient_id ? '' : '(unlinked)')}</span>
                      <span className="bookings-client">
                        {a.client_id ? <a href={`/clients/${a.client_id}`}>{a.clients?.full_name}</a> : '—'}
                        {a.clients?.client_number && <span className="bookings-num"> #{a.clients.client_number}</span>}
                      </span>
                      <span className="bookings-typecol"><span className={`bookings-type ${a.type}`}>{TYPE_LABELS[a.type] || a.type}</span></span>
                      <span className="bookings-reason" title={a.reason || ''}>{a.reason}</span>
                      <span className="bookings-statuscol">{statusLabel(a)}</span>
                      <span className="bookings-acts">{actions(a)}</span>
                      {reminderError?.id === a.id && <span className="bookings-error error">{reminderError.message}</span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="bookings-foot"><span>Tap a client to open their file</span><span>Tap “📋 Bookings” again to close</span></div>
        </div>
      )}
    </div>
  );
}
