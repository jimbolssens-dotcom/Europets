// app/staff/roster/page.jsx
// The real, date-based staff roster: a week grid (every staff member x
// every day x morning/afternoon, click a cell to toggle them on/off that
// shift) plus a mini month calendar for jumping to any week and seeing
// coverage at a glance (a small count badge per day). This is the single
// source of truth appointment booking checks against (see
// app/api/appointments/route.js) — editable here and from the mobile
// "My Schedule" self-service page.

'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { buildStaffColorMap, ROLE_SECTION_TINTS } from '@/lib/staffColors';

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const SHIFTS = ['morning', 'afternoon'];
const SHIFT_LABELS = { morning: 'AM', afternoon: 'PM' };
// Row order for the roster grid — vets first (who's actually seeing
// patients matters most for at-a-glance coverage), then the rest of the
// clinical/admin chain. Anyone with an unrecognized role sorts last.
const ROLE_ORDER = ['vet', 'tech', 'admin', 'reception', 'cleaner'];

function pad(n) {
  return String(n).padStart(2, '0');
}

function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayISODate() {
  return toISODate(new Date());
}

// The Monday on or before the given date, at midnight.
function mondayOf(d) {
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function addDays(d, n) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

// A 6-row Sun-start grid of Date objects covering the given month, padded
// with the trailing days of the previous/next month — same approach as
// the Appointments page's mini calendar.
function buildMonthGrid(year, monthIndex) {
  const firstOfMonth = new Date(year, monthIndex, 1);
  const startOffset = firstOfMonth.getDay();
  const gridStart = new Date(year, monthIndex, 1 - startOffset);

  const days = [];
  for (let i = 0; i < 42; i++) {
    days.push(addDays(gridStart, i));
  }
  return days;
}

export default function StaffRosterPage() {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonthIndex, setViewMonthIndex] = useState(today.getMonth());
  const [weekStart, setWeekStart] = useState(mondayOf(today));
  const [staff, setStaff] = useState([]);
  const [entries, setEntries] = useState([]); // every entry across the visible 42-day mini-cal grid
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copying, setCopying] = useState(false);
  const [copyMessage, setCopyMessage] = useState(null);

  const monthGrid = useMemo(() => buildMonthGrid(viewYear, viewMonthIndex), [viewYear, viewMonthIndex]);
  const gridStartISO = toISODate(monthGrid[0]);
  const gridEndISO = toISODate(monthGrid[monthGrid.length - 1]);

  const loadEntries = () =>
    fetch(`/api/staff-roster?start=${gridStartISO}&end=${gridEndISO}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.error || 'Failed to load the roster');
        }
        setError(null);
        setEntries(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        setError(
          `${err.message} — if you just added this feature, make sure migration 034_staff_roster.sql has been run and RLS is disabled on staff_roster_entries.`
        );
        setLoading(false);
      });

  useEffect(() => {
    setLoading(true);
    loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridStartISO, gridEndISO]);

  useEffect(() => {
    fetch('/api/staff')
      .then((res) => res.json())
      .then((data) => setStaff(Array.isArray(data) ? data : []));

    const channel = supabase
      .channel('staff-roster-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_roster_entries' }, () => loadEntries())
      .subscribe();

    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rows read vets, techs, admin, reception, then cleaners — see
  // ROLE_ORDER — alphabetical by name within the same role. An
  // unrecognized role (indexOf -1) sorts after all of those, not before.
  const sortedStaff = useMemo(() => {
    const roleRank = (role) => {
      const i = ROLE_ORDER.indexOf(role);
      return i === -1 ? ROLE_ORDER.length : i;
    };
    return [...staff].sort((a, b) => {
      const roleDiff = roleRank(a.role) - roleRank(b.role);
      return roleDiff !== 0 ? roleDiff : a.full_name.localeCompare(b.full_name);
    });
  }, [staff]);

  // Same color a staff member reads as on the Appointments schedule — see
  // lib/staffColors.js: their own chosen color (Staff page) if they have
  // one, otherwise a stable auto-assigned one, so every row here is
  // color-coded either way.
  const staffColor = useMemo(() => buildStaffColorMap(sortedStaff), [sortedStaff]);

  const staffCountByDate = useMemo(() => {
    const seen = {};
    for (const e of entries) {
      if (!seen[e.date]) seen[e.date] = new Set();
      seen[e.date].add(e.staff_id);
    }
    const counts = {};
    for (const [date, set] of Object.entries(seen)) counts[date] = set.size;
    return counts;
  }, [entries]);

  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekStartISO = toISODate(weekDates[0]);
  const weekEndISO = toISODate(weekDates[6]);
  const weekEntries = useMemo(
    () => entries.filter((e) => e.date >= weekStartISO && e.date <= weekEndISO),
    [entries, weekStartISO, weekEndISO]
  );

  function jumpToWeekOf(d) {
    setWeekStart(mondayOf(d));
    setCopyMessage(null);
    if (d.getMonth() !== viewMonthIndex || d.getFullYear() !== viewYear) {
      setViewYear(d.getFullYear());
      setViewMonthIndex(d.getMonth());
    }
  }

  function goToWeek(delta) {
    jumpToWeekOf(addDays(weekStart, delta * 7));
  }

  function goToMonth(delta) {
    const d = new Date(viewYear, viewMonthIndex + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonthIndex(d.getMonth());
  }

  async function toggleCell(staffMember, dateISO, shift) {
    setError(null);
    const existing = entries.find((e) => e.staff_id === staffMember.id && e.date === dateISO && e.shift === shift);
    try {
      const res = existing
        ? await fetch(`/api/staff-roster/${existing.id}`, { method: 'DELETE' })
        : await fetch('/api/staff-roster', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ staff_id: staffMember.id, date: dateISO, shift }),
          });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'Failed to update the roster');
        return;
      }
    } catch (err) {
      setError(err.message || 'Failed to update the roster');
      return;
    }
    loadEntries();
  }

  // Copies every staff member's shifts from the week immediately before
  // the one currently shown onto this week, in one go — see
  // app/api/staff-roster/repeat-week/route.js. Additive: shifts already
  // on this week are left alone, so this only fills in the gaps.
  async function copyPreviousWeek() {
    setError(null);
    setCopyMessage(null);
    setCopying(true);
    try {
      const res = await fetch('/api/staff-roster/repeat-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_start: weekStartISO }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "Failed to copy last week's roster");
        return;
      }
      setCopyMessage(
        data.copied > 0
          ? `Copied ${data.copied} shift${data.copied === 1 ? '' : 's'} from the previous week.`
          : 'No shifts in the previous week to copy.'
      );
      loadEntries();
    } catch (err) {
      setError(err.message || "Failed to copy last week's roster");
    } finally {
      setCopying(false);
    }
  }

  const monthLabel = new Date(viewYear, viewMonthIndex, 1).toLocaleDateString([], { month: 'long', year: 'numeric' });
  const weekLabel = `${weekDates[0].toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${weekDates[6].toLocaleDateString([], { month: 'short', day: 'numeric' })}`;

  return (
    <div>
      <p>
        <a href="/staff">&larr; Staff</a>
      </p>
      <h1>Staff Roster</h1>
      <p className="visit-meta">
        Click a cell to add or remove a staff member from that morning/afternoon. Staff can also do
        this themselves from the mobile app&apos;s My Schedule page.
      </p>
      {error && <p className="error">{error}</p>}

      <div className="roster-layout">
        <div className="date-nav">
          <div className="mini-cal-header">
            <button type="button" onClick={() => goToMonth(-1)} aria-label="Previous month">
              &lsaquo;
            </button>
            <span>{monthLabel}</span>
            <button type="button" onClick={() => goToMonth(1)} aria-label="Next month">
              &rsaquo;
            </button>
          </div>
          <div className="mini-cal-grid">
            {WEEKDAY_LETTERS.map((w, i) => (
              <div key={i} className="mini-cal-weekday">
                {w}
              </div>
            ))}
            {monthGrid.map((d) => {
              const iso = toISODate(d);
              const inMonth = d.getMonth() === viewMonthIndex;
              const inWeek = iso >= weekStartISO && iso <= weekEndISO;
              const isToday = iso === todayISODate();
              const count = staffCountByDate[iso] || 0;
              return (
                <button
                  type="button"
                  key={iso}
                  className={[
                    'mini-cal-day',
                    inMonth ? '' : 'mini-cal-day-outside',
                    inWeek ? 'mini-cal-day-selected' : '',
                    isToday && !inWeek ? 'mini-cal-day-today' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => jumpToWeekOf(d)}
                >
                  {d.getDate()}
                  {count > 0 && <span className="mini-cal-day-count">{count}</span>}
                </button>
              );
            })}
          </div>
          <button type="button" className="date-nav-today" onClick={() => jumpToWeekOf(new Date())}>
            This Week
          </button>
        </div>

        <div className="roster-main">
          <div className="roster-week-nav">
            <button type="button" onClick={() => goToWeek(-1)}>
              &lsaquo; Previous week
            </button>
            <strong>{weekLabel}</strong>
            <button type="button" onClick={() => goToWeek(1)}>
              Next week &rsaquo;
            </button>
          </div>

          <div className="roster-copy-week">
            <button type="button" className="button-link" onClick={copyPreviousWeek} disabled={copying}>
              🔁 {copying ? 'Copying...' : 'Copy Previous Week (All Staff)'}
            </button>
            <span className="visit-meta">
              Fills in this week from last week&apos;s roster, for every staff member at once — won&apos;t
              touch shifts already on this week.
            </span>
          </div>
          {copyMessage && <p className="visit-meta roster-copy-message">{copyMessage}</p>}

          {loading ? (
            <p>Loading roster...</p>
          ) : staff.length === 0 ? (
            <p>
              No staff yet — add some on the <a href="/staff">Staff</a> page first.
            </p>
          ) : (
            <div className="roster-table-wrap">
              <table className="roster-table">
                <thead>
                  <tr>
                    <th rowSpan={2} className="roster-staff-col">
                      Staff
                    </th>
                    {weekDates.map((d) => (
                      <th key={toISODate(d)} colSpan={2}>
                        {d.toLocaleDateString([], { weekday: 'short' })} {d.getDate()}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {weekDates.map((d) => (
                      <Fragment key={toISODate(d)}>
                        <th className="roster-subhead">AM</th>
                        <th className="roster-subhead">PM</th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedStaff.map((s) => {
                    const color = staffColor[s.id];
                    const roleTint = ROLE_SECTION_TINTS[s.role] || 'transparent';
                    return (
                      <tr key={s.id} style={{ background: roleTint }}>
                        <td
                          className="roster-staff-col"
                          style={{ borderLeft: `4px solid ${color.fg}`, background: roleTint }}
                        >
                          <span className="staff-color-swatch" style={{ background: color.fg }} />{' '}
                          {s.full_name} <span className="visit-meta">({s.role})</span>
                        </td>
                        {weekDates.map((d) => {
                          const iso = toISODate(d);
                          return (
                            <Fragment key={iso}>
                              {SHIFTS.map((shift) => {
                                const on = weekEntries.some(
                                  (e) => e.staff_id === s.id && e.date === iso && e.shift === shift
                                );
                                return (
                                  <td key={shift} className="roster-cell">
                                    <button
                                      type="button"
                                      className={`roster-toggle${on ? ' roster-toggle-on' : ''}`}
                                      style={on ? { background: color.fg, borderColor: color.fg } : undefined}
                                      onClick={() => toggleCell(s, iso, shift)}
                                      title={`${s.full_name} — ${d.toLocaleDateString()} ${SHIFT_LABELS[shift]} — click to ${on ? 'remove' : 'add'}`}
                                    >
                                      {on ? '✓' : '+'}
                                    </button>
                                  </td>
                                );
                              })}
                            </Fragment>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
