// app/_components/CheckinSummary.jsx
// Renders whichever Quick Check-In fields (see lib/hospitalizationCheckin.js)
// a worksheet entry has set, as small icon+label chips — used on both the
// staff worksheet (app/(admin)/hospitalization/[id]) and the client portal
// (app/portal/hospitalization/[id]) so a cleaner's tile-based check-in
// shows up the same way a vet's full entry does. Appetite already renders
// via each page's own existing text line, so it's left out here to avoid
// showing it twice.

import { checkinOption } from '@/lib/hospitalizationCheckin';

const SUMMARY_KEYS = ['drinking', 'stool', 'urine', 'vomit', 'mood', 'temperature_feel'];

export default function CheckinSummary({ note }) {
  const chips = SUMMARY_KEYS.map((key) => ({ key, option: checkinOption(key, note[key]) })).filter(
    (c) => c.option
  );

  if (chips.length === 0) return null;

  return (
    <p className="checkin-summary">
      {chips.map(({ key, option }) => (
        <span key={key} className="checkin-chip">
          {option.icon} {option.label}
        </span>
      ))}
    </p>
  );
}
