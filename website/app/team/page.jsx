import { VETS, TEAM } from '@/lib/content';

export const metadata = { title: 'Our Team — Europets Clinic' };

function initials(name) {
  return name
    .replace('Dr.', '')
    .trim()
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function TeamRow({ people }) {
  return (
    <div className="team-grid">
      {people.map((p) => (
        <div key={p.name} className="card team-card">
          <span className="avatar-circle avatar-circle-lg">{initials(p.name)}</span>
          <strong>{p.name}</strong>
          <span>{p.role}</span>
        </div>
      ))}
    </div>
  );
}

export default function TeamPage() {
  return (
    <div className="section">
      <div className="container">
        <span className="eyebrow">Who you&apos;ll meet</span>
        <h1 className="page-title">A team that knows your pet by name</h1>
        <p className="page-lede">
          Every member of our team is committed to giving each patient the compassionate, attentive care they
          deserve — whether they&apos;re behind the front desk or in the operating room.
        </p>

        <h2 className="team-section-heading">Veterinarians</h2>
        <TeamRow people={VETS} />

        <h2 className="team-section-heading">Support Team</h2>
        <TeamRow people={TEAM} />
      </div>
    </div>
  );
}
