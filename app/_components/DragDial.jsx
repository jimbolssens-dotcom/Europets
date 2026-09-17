// app/_components/DragDial.jsx
// Generic press-and-hold, drag-up-to-increase / drag-down-to-decrease
// numeric picker — the shared mechanic behind TempDial (0.1°C steps) and
// WeightDial (0.1kg steps). See those two for how each configures it and
// where it's actually used.
//
// Reports out via onChange(value) once per completed drag (on release) —
// it doesn't call onChange continuously while dragging, and it doesn't
// submit anything itself; the caller decides what "committed" means.

'use client';

import { useEffect, useRef, useState } from 'react';

const PX_PER_STEP = 13;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export default function DragDial({
  value,
  onChange,
  min,
  max,
  height = 132,
  step = 0.1,
  decimals = 1,
  unit = '',
  unitSuperscript = false,
  color = 'var(--pink-dark)', // a fixed CSS color, or a function(value) => color
  majorEvery = 10, // ticks between labeled major ticks — 10 * 0.1 = every 1.0 unit
  defaultValue,
}) {
  const minSteps = Math.round(min / step);
  const maxSteps = Math.round(max / step);
  const fallbackSteps = Math.round((defaultValue ?? (min + max) / 2) / step);
  const initialSteps = clamp(value != null ? Math.round(value / step) : fallbackSteps, minSteps, maxSteps);

  const [steps, setSteps] = useState(initialSteps);
  const stepsRef = useRef(initialSteps);
  const onChangeRef = useRef(onChange);
  const wheelRef = useRef(null);
  const tapeRef = useRef(null);
  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  const startStepsRef = useRef(initialSteps);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const center = height / 2;
  const tickTop = (s) => (s - minSteps) * PX_PER_STEP;
  const applyTransform = (rawS) => {
    if (tapeRef.current) tapeRef.current.style.transform = `translateY(${center - tickTop(rawS) - 13}px)`;
  };

  useEffect(() => {
    applyTransform(stepsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleMove(e) {
      if (!draggingRef.current) return;
      const y = e.touches ? e.touches[0].clientY : e.clientY;
      const upward = startYRef.current - y;
      const raw = clamp(startStepsRef.current + upward / PX_PER_STEP, minSteps, maxSteps);
      applyTransform(raw);
      const snapped = Math.round(raw);
      if (snapped !== stepsRef.current) {
        stepsRef.current = snapped;
        setSteps(snapped);
        if (navigator.vibrate) navigator.vibrate(2);
      }
      e.preventDefault();
    }
    function handleUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      wheelRef.current?.classList.remove('drag-dial-dragging');
      if (tapeRef.current) {
        tapeRef.current.style.transition = 'transform 160ms cubic-bezier(.2,.8,.2,1)';
        applyTransform(stepsRef.current);
      }
      onChangeRef.current?.(Math.round(stepsRef.current * step * 100) / 100);
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
  }, [minSteps, maxSteps, step]);

  function handleDown(e) {
    draggingRef.current = true;
    wheelRef.current?.classList.add('drag-dial-dragging');
    startYRef.current = e.touches ? e.touches[0].clientY : e.clientY;
    startStepsRef.current = stepsRef.current;
    if (tapeRef.current) tapeRef.current.style.transition = 'none';
    e.preventDefault();
  }

  const ticks = [];
  for (let s = minSteps; s <= maxSteps; s++) ticks.push(s);
  const currentValue = Math.round(steps * step * 100) / 100;
  const resolvedColor = typeof color === 'function' ? color(currentValue) : color;

  return (
    <div
      className="drag-dial"
      ref={wheelRef}
      style={{ height, '--drag-dial-color': resolvedColor }}
      onPointerDown={handleDown}
      onTouchStart={handleDown}
    >
      <div className="drag-dial-fade drag-dial-fade-top" />
      <div className="drag-dial-fade drag-dial-fade-bottom" />
      <div className="drag-dial-marker" />
      <div className="drag-dial-tape" ref={tapeRef}>
        {ticks.map((s) => {
          const isMajor = s % majorEvery === 0;
          return (
            <div key={s} className={`drag-dial-tick${isMajor ? ' major' : ''}`} style={{ top: tickTop(s) }}>
              <span className="drag-dial-mark" />
              {isMajor && <span className="drag-dial-tick-label">{(s * step).toFixed(decimals)}</span>}
            </div>
          );
        })}
      </div>
      <div className="drag-dial-readout">
        {currentValue.toFixed(decimals)}
        {unit && (
          <span className={`drag-dial-unit${unitSuperscript ? ' drag-dial-unit-superscript' : ''}`}>{unit}</span>
        )}
      </div>
    </div>
  );
}
