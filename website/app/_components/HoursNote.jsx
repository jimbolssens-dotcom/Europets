import { HOURS } from '@/lib/content';

// The "by appointment only" note under the opening hours, with "pet
// registration" linking to the New Patients page that explains the steps.
export default function HoursNote({ className = 'hours-note' }) {
  const [before, after] = HOURS.note.split('pet registration');
  if (after === undefined) return <p className={className}>{HOURS.note}</p>;
  return (
    <p className={className}>
      {before}
      <a href="/new-patients">pet registration</a>
      {after}
    </p>
  );
}
