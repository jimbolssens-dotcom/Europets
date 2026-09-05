import { BOOKING_URL, SERVICES, VETS, HOURS, CONTACT } from '@/lib/content';

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

export default function HomePage() {
  return (
    <>
      {/* Hero — no stock photography: an honest, on-brand graphic mark
          instead of pretending to show the real clinic until we have
          actual photos to drop in here. */}
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <span className="eyebrow">Sharjah &middot; Independent since 2005</span>
            <h1 className="hero-title">
              Kind, careful veterinary care, <em>the way it should be.</em>
            </h1>
            <p className="hero-lede">
              Europets Clinic offers wellness care, dentistry, diagnostics, and surgery for your pets — led by Dr.
              Jim Bolssens and a team who treat every patient like their own.
            </p>
            <div className="hero-actions">
              <a href={BOOKING_URL} className="btn btn-primary">
                Book an Appointment
              </a>
              <a href="/new-patients" className="btn btn-ghost">
                New Patient? Start here
              </a>
            </div>
          </div>
          <div className="hero-mark" aria-hidden="true">
            <svg viewBox="0 0 320 320" fill="none">
              <circle cx="160" cy="160" r="150" fill="var(--pink-tint)" />
              <path
                d="M160 90c-30 0-46 24-46 50 0 40 30 66 46 84 16-18 46-44 46-84 0-26-16-50-46-50z"
                fill="var(--pink)"
                opacity="0.15"
              />
              <path
                d="M160 130a26 26 0 1 1 0 52 26 26 0 0 1 0-52zM108 96a20 20 0 1 1 0 40 20 20 0 0 1 0-40zM212 96a20 20 0 1 1 0 40 20 20 0 0 1 0-40zM86 150a18 18 0 1 1 0 36 18 18 0 0 1 0-36zM234 150a18 18 0 1 1 0 36 18 18 0 0 1 0-36z"
                fill="var(--pink)"
              />
            </svg>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="trust-strip">
        <div className="container trust-strip-row">
          <span>20 years in Sharjah</span>
          <span>Independent &amp; family-run</span>
          <span>In-house diagnostics</span>
          <span>Appointment-only care</span>
        </div>
      </section>

      {/* Services */}
      <section className="section">
        <div className="container">
          <span className="eyebrow">What we treat</span>
          <h2 className="section-title">Complete care, under one roof</h2>
          <div className="service-grid">
            {SERVICES.map((s) => (
              <div key={s.name} className="card service-card">
                <h3>{s.name}</h3>
                <p>{s.description}</p>
              </div>
            ))}
          </div>
          <a href="/services" className="text-link">
            See all services &rarr;
          </a>
        </div>
      </section>

      {/* Team teaser */}
      <section className="section section-tint">
        <div className="container">
          <span className="eyebrow">Who you&apos;ll meet</span>
          <h2 className="section-title">A team that knows your pet by name</h2>
          <div className="team-teaser-row">
            {VETS.map((v) => (
              <div key={v.name} className="team-avatar">
                <span className="avatar-circle">{initials(v.name)}</span>
                <strong>{v.name}</strong>
                <span>{v.role}</span>
              </div>
            ))}
          </div>
          <a href="/team" className="text-link">
            Meet the whole team &rarr;
          </a>
        </div>
      </section>

      {/* Hours + location */}
      <section className="section">
        <div className="container hours-grid">
          <div className="card hours-card">
            <span className="eyebrow">Hours</span>
            <h3>{HOURS.days}</h3>
            <dl>
              <dt>Reception</dt>
              <dd>{HOURS.reception}</dd>
              <dt>Consultations</dt>
              <dd>{HOURS.consultations}</dd>
            </dl>
            <p className="hours-note">{HOURS.note}</p>
          </div>
          <div className="card hours-card">
            <span className="eyebrow">Find us</span>
            <h3>Europets Clinic</h3>
            <p>
              {CONTACT.address.join(', ')}
            </p>
            <a href={`https://wa.me/${CONTACT.mobileHref}`} className="btn btn-primary" style={{ marginTop: '1rem' }}>
              Message us on WhatsApp
            </a>
          </div>
        </div>
      </section>

      {/* Reviews teaser */}
      <section className="section section-tint reviews-teaser">
        <div className="container reviews-teaser-inner">
          <div>
            <span className="eyebrow">From our clients</span>
            <h2 className="section-title">Real stories from real pet parents</h2>
          </div>
          <a href="/reviews" className="btn btn-ghost">
            Read reviews
          </a>
        </div>
      </section>
    </>
  );
}
