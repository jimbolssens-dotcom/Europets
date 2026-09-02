// app/staff/[id]/schedule/page.jsx
// A staff member's weekly working schedule: which mornings/afternoons
// they're expected in, one checkbox per weekday x shift. This is what the
// appointment booking form checks against to warn (not block) when a vet
// gets booked outside their expected hours — see app/api/appointments/
// route.js and the schedule-warning handling on the appointments page.
//
// Weekday numbering matches JS Date#getDay() (0=Sunday..6=Saturday) since
// that's what the booking form computes client-side to avoid server/client
// timezone mismatches; only the on-screen order here is Monday-first.

'use client';

import { useEffect, useState } from 'react';

const DAYS = [
  { weekday: 1, label: 'Monday' },
  { weekday: 2, label: 'Tuesday' },
  { weekday: 3, label: 'Wednesday' },
  { weekday: 4, label: 'Thursday' },
  { weekday: 5, label: 'Friday' },
  { weekday: 6, label: 'Saturday' },
  { weekday: 0, label: 'Sunday' },
];
const SHIFTS = ['morning', 'afternoon'];

// A sensible starting point for a staff member with no schedule set yet —
// working Mon-Fri, mornings and afternoons, off on the weekend. Purely a
// default for a blank grid; nothing is saved until Save is clicked.
function defaultExpected(weekday) {
  return weekday >= 1 && weekday <= 5;
}

function key(weekday, shift) {
  return `${weekday}-${shift}`;
}

export default function StaffSchedulePage({ params }) {
  const staffId = params.id;
  const [staffMember, setStaffMember] = useState(null);
  const [schedule, setSchedule] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/staff/${staffId}`).then((res) => res.json()),
      fetch(`/api/staff/${staffId}/schedule`).then((res) => res.json()),
    ]).then(([staffData, scheduleData]) => {
      setStaffMember(staffData?.id ? staffData : null);

      const map = {};
      for (const { weekday } of DAYS) {
        for (const shift of SHIFTS) {
          map[key(weekday, shift)] = defaultExpected(weekday);
        }
      }
      if (Array.isArray(scheduleData)) {
        for (const entry of scheduleData) {
          map[key(entry.weekday, entry.shift)] = entry.expected;
        }
      }
      setSchedule(map);
      setLoading(false);
    });
  }, [staffId]);

  function toggle(weekday, shift) {
    setSaved(false);
    setSchedule((prev) => ({ ...prev, [key(weekday, shift)]: !prev[key(weekday, shift)] }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);

    const entries = [];
    for (const { weekday } of DAYS) {
      for (const shift of SHIFTS) {
        entries.push({ weekday, shift, expected: !!schedule[key(weekday, shift)] });
      }
    }

    const res = await fetch(`/api/staff/${staffId}/schedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedule: entries }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || 'Failed to save schedule');
    } else {
      setSaved(true);
    }
    setSaving(false);
  }

  if (loading) return <p>Loading schedule...</p>;
  if (!staffMember) return <p>Staff member not found.</p>;

  return (
    <div>
      <p>
        <a href="/staff">&larr; Staff</a>
      </p>
      <h1>{staffMember.full_name}&apos;s Schedule</h1>
      <p className="visit-meta">
        Tick the mornings and afternoons {staffMember.full_name} is expected to work. Booking them
        for an appointment outside these hours won&apos;t be blocked — it&apos;ll show a warning
        that can be overridden, for the times they show up unexpectedly.
      </p>

      {error && <p className="error">{error}</p>}

      <table className="staff-schedule-table">
        <thead>
          <tr>
            <th>Day</th>
            <th>Morning</th>
            <th>Afternoon</th>
          </tr>
        </thead>
        <tbody>
          {DAYS.map(({ weekday, label }) => (
            <tr key={weekday}>
              <td>{label}</td>
              {SHIFTS.map((shift) => (
                <td key={shift}>
                  <input
                    type="checkbox"
                    checked={!!schedule[key(weekday, shift)]}
                    onChange={() => toggle(weekday, shift)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <button type="button" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving...' : 'Save Schedule'}
      </button>
      {saved && <p style={{ color: '#1a7a3d' }}>Saved.</p>}
    </div>
  );
}
