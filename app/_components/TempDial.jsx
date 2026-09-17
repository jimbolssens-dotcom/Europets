// app/_components/TempDial.jsx
// A drag-to-scroll temperature picker — press and hold, then drag up
// (warmer) or down (cooler) to dial in a reading in 0.1°C steps, instead of
// typing. Tested first as a standalone prototype before being wired in;
// see the two call sites for how each one triggers it:
//   - DayTreatmentPlan.jsx: a long-press on the Temperature tile's +Log
//     button opens this in a popover (a plain tap keeps the old typed
//     input, unchanged).
//   - The mobile Quick Check-In page: shown inline, replacing the old
//     Hot/Cold/Normal tiles, since an exact reading is strictly more
//     useful than those three buckets (see buildEmpathicCheckinText in
//     lib/hospitalizationCheckin.js, which already prefers temperature_c
//     over temperature_feel whenever both are present).
//
// Reports out via onChange(value) once per completed drag (on release) —
// it doesn't call onChange continuously while dragging, and it doesn't
// submit anything itself; the caller decides what "committed" means.

'use client';

import { useEffect, useRef, useState } from 'react';
import { temperatureZoneColor } from '@/lib/temperatureZones';

const PX_PER_TENTH = 13;

function clamp(t, lo, hi) {
  return Math.max(lo, Math.min(hi, t));
}

export default function TempDial({ value, onChange, min = 34.0, max = 42.0, height = 132 }) {
  const minTenths = Math.round(min * 10);
  const maxTenths = Math.round(max * 10);
  const initialTenths = clamp(value != null ? Math.round(value * 10) : 385, minTenths, maxTenths);

  const [tenths, setTenths] = useState(initialTenths);
  const tenthsRef = useRef(initialTenths);
  const onChangeRef = useRef(onChange);
  const wheelRef = useRef(null);
  const tapeRef = useRef(null);
  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  const startTenthsRef = useRef(initialTenths);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const center = height / 2;
  const tickTop = (t) => (t - minTenths) * PX_PER_TENTH;
  const applyTransform = (rawT) => {
    if (tapeRef.current) tapeRef.current.style.transform = `translateY(${center - tickTop(rawT) - 13}px)`;
  };

  useEffect(() => {
    applyTransform(tenthsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleMove(e) {
      if (!draggingRef.current) return;
      const y = e.touches ? e.touches[0].clientY : e.clientY;
      const upward = startYRef.current - y;
      const raw = clamp(startTenthsRef.current + upward / PX_PER_TENTH, minTenths, maxTenths);
      applyTransform(raw);
      const snapped = Math.round(raw);
      if (snapped !== tenthsRef.current) {
        tenthsRef.current = snapped;
        setTenths(snapped);
        if (navigator.vibrate) navigator.vibrate(2);
      }
      e.preventDefault();
    }
    function handleUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      wheelRef.current?.classList.remove('temp-dial-dragging');
      if (tapeRef.current) {
        tapeRef.current.style.transition = 'transform 160ms cubic-bezier(.2,.8,.2,1)';
        applyTransform(tenthsRef.current);
      }
      onChangeRef.current?.(tenthsRef.current / 10);
    }
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minTenths, maxTenths]);

  function handleDown(e) {
    draggingRef.current = true;
    wheelRef.current?.classList.add('temp-dial-dragging');
    startYRef.current = e.touches ? e.touches[0].clientY : e.clientY;
    startTenthsRef.current = tenthsRef.current;
    if (tapeRef.current) tapeRef.current.style.transition = 'none';
    e.preventDefault();
  }

  const ticks = [];
  for (let t = minTenths; t <= maxTenths; t++) ticks.push(t);
  const color = temperatureZoneColor(tenths / 10);

  return (
    <div
      className="temp-dial"
      ref={wheelRef}
      style={{ height, '--temp-dial-color': color }}
      onPointerDown={handleDown}
      onTouchStart={handleDown}
    >
      <div className="temp-dial-fade temp-dial-fade-top" />
      <div className="temp-dial-fade temp-dial-fade-bottom" />
      <div className="temp-dial-marker" />
      <div className="temp-dial-tape" ref={tapeRef}>
        {ticks.map((t) => {
          const isMajor = t % 10 === 0;
          return (
            <div key={t} className={`temp-dial-tick${isMajor ? ' major' : ''}`} style={{ top: tickTop(t) }}>
              <span className="temp-dial-mark" />
              {isMajor && <span className="temp-dial-tick-label">{(t / 10).toFixed(1)}</span>}
            </div>
          );
        })}
      </div>
      <div className="temp-dial-readout">
        {(tenths / 10).toFixed(1)}
        <span className="temp-dial-degree">°</span>
      </div>
    </div>
  );
}
