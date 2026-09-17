// app/_components/TempDial.jsx
// A drag-to-scroll temperature picker — press and hold, then drag up
// (warmer) or down (cooler) to dial in a reading in 0.1°C steps, instead of
// typing. A thin config layer over the shared DragDial mechanic (see
// WeightDial.jsx for the other one). Tested first as a standalone
// prototype before being wired in; see the two call sites for how each one
// triggers it:
//   - DayTreatmentPlan.jsx: a long-press on the Temperature tile's +Log
//     button opens this in a popover (a plain tap keeps the old typed
//     input, unchanged).
//   - The mobile Quick Check-In page: shown inline, replacing the old
//     Hot/Cold/Normal tiles, since an exact reading is strictly more
//     useful than those three buckets (see buildEmpathicCheckinText in
//     lib/hospitalizationCheckin.js, which already prefers temperature_c
//     over temperature_feel whenever both are present).

'use client';

import DragDial from '@/app/_components/DragDial';
import { temperatureZoneColor } from '@/lib/temperatureZones';

export default function TempDial({ value, onChange, min = 34.0, max = 42.0, height = 132 }) {
  return (
    <DragDial
      value={value}
      onChange={onChange}
      min={min}
      max={max}
      height={height}
      step={0.1}
      decimals={1}
      unit="°"
      unitSuperscript
      color={temperatureZoneColor}
      defaultValue={38.5}
    />
  );
}
