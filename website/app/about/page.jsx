import { BOOKING_URL, STORY, EQUIPMENT, COMMUNITY } from '@/lib/content';

export const metadata = { title: 'About Us — Europets Clinic' };

export default function AboutPage() {
  return (
    <div className="section">
      <div className="container">
        <span className="eyebrow">Our story</span>
        <h1 className="page-title">Independently owned. Personally run. Since {STORY.founded}.</h1>

        <div className="about-story">
          {STORY.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>

        <h2 className="team-section-heading">What we&apos;re equipped for</h2>
        <p className="page-lede">
          Staying independent means we invest in the clinic, not a corporate parent — equipment most practices our
          size would refer out for.
        </p>
        <div className="equipment-grid">
          {EQUIPMENT.map((item) => (
            <div key={item.name} className="card equipment-card">
              <h3>{item.name}</h3>
              <p>{item.description}</p>
            </div>
          ))}
        </div>

        <div className="card community-card">
          <h2>{COMMUNITY.heading}</h2>
          <p>{COMMUNITY.body}</p>
        </div>

        <div className="services-cta card">
          <h2>Come see the difference for yourself</h2>
          <p>Book a consultation and meet the team behind Europets Clinic.</p>
          <a href={BOOKING_URL} className="btn btn-primary">
            Book an Appointment
          </a>
        </div>
      </div>
    </div>
  );
}
