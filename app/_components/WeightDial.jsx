// app/_components/WeightDial.jsx
// A drag-to-scroll weight picker — press and hold, then drag up (heavier)
// or down (lighter) to dial in a reading in 0.1kg steps, instead of typing.
// A thin config layer over the shared DragDial mechanic (see TempDial.jsx
// for the other one). Used on the hospitalization Day Treatment Plan's
// Weight tile — a long-press on its +Log button opens this instead of the
// plain typed input (a plain tap keeps that unchanged). Unlike TempDial,
// there's no fixed "normal" starting point — the caller always passes the
// last recorded weight as `value` so the dial opens already on it, since
// dragging from an arbitrary default would be needless work for a reading
// that barely changes day to day.

'use client';

import DragDial from '@/app/_components/DragDial';

export default function WeightDial({ value, onChange, min = 0.5, max = 90.0, height = 132 }) {
  return (
    <DragDial
      value={value}
      onChange={onChange}
      min={min}
      max={max}
      height={height}
      step={0.1}
      decimals={1}
      unit="kg"
      color="var(--pink-dark)"
      defaultValue={10.0}
    />
  );
}
