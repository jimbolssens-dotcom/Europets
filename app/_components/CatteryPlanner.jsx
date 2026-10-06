'use client';

// app/_components/CatteryPlanner.jsx
// The staff cattery availability planner: the 7 spaces down the side, a
// run of days across the top (weekends shaded, today marked), and every
// booking drawn as a bar in its space. Green = checked in, pink = booked,
// dashed orange = a client's request waiting for approval. Tapping a bar
// calls onOpen(booking); dragging (or tapping start then end) across empty
// days in one space calls onPickRange({ space_number, date_in, date_out })
// to start a new booking for those dates.

import { useEffect, useRef, useState } from 'react';
import { CATTERY_SPACES, isWeekend } from '@/lib/cattery';

const COL = 38;
const HEAD = 96;

function addDaysISO(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function CatteryPlanner({ start, days, today, bookings, onOpen, onPickRange }) {
  const dates = Array.from({ length: days }, (_, i) => addDaysISO(start, i));
  const end = dates[dates.length - 1];
  const [drag, setDrag] = useState(null); // { space, from, to }
  const dragRef = useRef(null);
  dragRef.current = drag;

  useEffect(() => {
    function finish() {
      const d = dragRef.current;
      if (!d) return;
      setDrag(null);
      const [a, b] = d.from <= d.to ? [d.from, d.to] : [d.to, d.from];
      onPickRange({ space_number: d.space, date_in: a, date_out: b });
    }
    window.addEventListener('pointerup', finish);
    return () => window.removeEventListener('pointerup', finish);
  }, [onPickRange]);

  function occupied(space, date) {
    return bookings.some((b) => b.space_number === space && b.status !== 'checked_out' && b.date_in <= date && b.date_out >= date);
  }
  function inDrag(space, date) {
    if (!drag || drag.space !== space) return false;
    const [a, b] = drag.from <= drag.to ? [drag.from, drag.to] : [drag.to, drag.from];
    return date >= a && date <= b;
  }

  return (
    <div className="cattery-planner-wrap">
      <div className="cattery-planner" style={{ gridTemplateColumns: `${HEAD}px repeat(${days}, ${COL}px)` }}>
        <div className="cp-cell cp-rowhead cp-corner" />
        {dates.map((d) => {
          const dt = new Date(`${d}T00:00:00Z`);
          return (
            <div key={d} className={`cp-cell cp-dayhead ${d === today ? 'today' : ''} ${isWeekend(d) ? 'weekend' : ''}`}>
              <span>{dt.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })}</span>
              <b>{dt.getUTCDate()}</b>
            </div>
          );
        })}
        {CATTERY_SPACES.map((space) => (
          <div key={space} className="cp-row" style={{ display: 'contents' }}>
            <div className="cp-cell cp-rowhead">Space {space}</div>
            {dates.map((d, i) => (
              <div
                key={d}
                className={`cp-cell ${isWeekend(d) ? 'weekend' : ''} ${inDrag(space, d) ? 'cp-drag' : ''}`}
                onPointerDown={(e) => {
                  if (occupied(space, d) || d < today) return;
                  e.preventDefault();
                  setDrag({ space, from: d, to: d });
                }}
                onPointerEnter={() => drag && drag.space === space && !occupied(space, d) && setDrag({ ...drag, to: d })}
                style={{ position: 'relative' }}
              >
                {i === 0 &&
                  bookings
                    .filter((b) => b.space_number === space && b.date_out >= start && b.date_in <= end)
                    .map((b) => {
                      const from = b.date_in < start ? 0 : dates.indexOf(b.date_in);
                      const to = b.date_out > end ? days - 1 : dates.indexOf(b.date_out);
                      const kind = b.status === 'requested' ? 'pending' : b.status === 'checked_in' ? 'checked' : b.status === 'checked_out' ? 'out' : 'booked';
                      return (
                        <button
                          type="button"
                          key={b.id}
                          className={`cp-bar ${kind}`}
                          style={{ left: from * COL + 3, width: (to - from + 1) * COL - 6 }}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => onOpen(b)}
                          title={`${b.patients?.name || ''} · ${b.clients?.full_name || ''} · ${b.date_in} to ${b.date_out}`}
                        >
                          {kind === 'pending' ? '⏳ ' : ''}
                          {b.patients?.name}
                          <small>{b.clients?.full_name}</small>
                        </button>
                      );
                    })}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
