import { BOOKING_URL, SERVICES, VETS, HOURS, CONTACT, STORY } from '@/lib/content';
import HexField from './_components/HexField';
import HexLattice from './_components/HexLattice';

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
      {/* Hero — an animated field of extruded hex tiles behind the copy,
          with the vets themselves as a honeycomb of hex-clipped portraits.
          Anyone without a photo yet still shows up as an initial. */}
      <section className="hero">
        <HexField />
        <div className="container hero-grid">
          <div>
            <span className="eyebrow">Sharjah &middot; Independent since 2005</span>
            <h1 className="hero-title">
              Kind, careful veterinary care, <em>the way it should be.</em>
            </h1>
            <p className="hero-lede">
              Europets Clinic offers wellness care, dentistry, diagnostics, and surgery for your pets, led by Dr.
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
          <div className="docs">
            {VETS.slice(0, 5).map((v) => (
              <figure className="doc" key={v.name}>
                <span className="doc-face">
                  {v.photo ? (
                    <img src={v.photo} alt={v.name} />
                  ) : (
                    <span className="doc-ph" aria-hidden="true">
                      {initials(v.name).charAt(0)}
                    </span>
                  )}
                  <span className="doc-tag">
                    <b>{v.name}</b>
                    <i>{v.role}</i>
                  </span>
                </span>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Stat strip */}
      <section className="trust-strip">
        <div className="container trust-strip-row">
          <span>20 years in Sharjah</span>
          <span>Independent &amp; family-run</span>
          <span>In-house diagnostics</span>
          <span>Appointment-only care</span>
        </div>
      </section>

      {/* Story teaser */}
      <section className="section">
        <div className="container story-teaser">
          <div>
            <span className="eyebrow">Our story</span>
            <h2 className="section-title">Family-run, not corporate</h2>
            <p>{STORY.paragraphs[0]}</p>
          </div>
          <a href="/about" className="btn btn-ghost">
            Read our story
          </a>
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
        <HexLattice />
        <div className="container" style={{ position: 'relative' }}>
          <span className="eyebrow">Who you&apos;ll meet</span>
          <h2 className="section-title">A team that knows your pet by name</h2>
          <div className="team-teaser-row">
            {VETS.map((v) => (
              <div key={v.name} className="team-avatar">
                {v.photo ? (
                  <img src={v.photo} alt={v.name} className="avatar-circle avatar-photo" />
                ) : (
                  <span className="avatar-circle">{initials(v.name)}</span>
                )}
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
        <HexLattice />
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
