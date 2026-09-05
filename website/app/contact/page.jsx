import { CONTACT, HOURS } from '@/lib/content';

export const metadata = { title: 'Contact — Europets Clinic' };

export default function ContactPage() {
  const mapsQuery = encodeURIComponent(CONTACT.address.join(', ') + ', Europets Clinic');

  return (
    <div className="section">
      <div className="container contact-grid">
        <div>
          <span className="eyebrow">Get in touch</span>
          <h1 className="page-title">Visit or reach out</h1>

          <div className="contact-block">
            <h3>Address</h3>
            {CONTACT.address.map((line) => (
              <p key={line}>{line}</p>
            ))}
            <a href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`} className="text-link">
              Get directions &rarr;
            </a>
          </div>

          <div className="contact-block">
            <h3>Phone &amp; Email</h3>
            <p>
              <a href={`https://wa.me/${CONTACT.mobileHref}`}>WhatsApp / Mobile: {CONTACT.mobile}</a>
            </p>
            <p>Landline: {CONTACT.landline}</p>
            <p>
              <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
            </p>
          </div>

          <div className="contact-block">
            <h3>Hours</h3>
            <p>{HOURS.days}</p>
            <p>Reception: {HOURS.reception}</p>
            <p>Consultations: {HOURS.consultations}</p>
            <p className="hours-note">{HOURS.note}</p>
          </div>
        </div>

        <a
          href={`https://wa.me/${CONTACT.mobileHref}`}
          className="card whatsapp-card"
        >
          <span className="whatsapp-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.04 2c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.46 3.4 1.26 4.83L2 22l5.35-1.4a9.9 9.9 0 0 0 4.69 1.2h.01c5.5 0 9.96-4.46 9.96-9.96S17.54 2 12.04 2zm5.8 14.14c-.24.68-1.4 1.3-1.93 1.34-.5.05-1.05.07-1.7-.1-.39-.11-.9-.28-1.54-.55-2.72-1.17-4.5-3.9-4.63-4.08-.14-.18-1.1-1.47-1.1-2.8 0-1.33.7-1.98.95-2.25.24-.27.53-.34.71-.34h.5c.16 0 .38-.02.58.45.24.56.8 1.95.87 2.09.07.14.12.31.02.5-.1.18-.15.3-.3.46-.15.16-.3.36-.44.48-.15.13-.3.28-.13.55.17.27.75 1.24 1.62 2.01 1.11.99 2.05 1.3 2.32 1.44.27.14.43.12.6-.07.16-.19.68-.79.86-1.06.18-.27.36-.22.6-.13.24.09 1.52.72 1.78.85.26.13.43.19.5.3.07.11.07.63-.17 1.3z" />
            </svg>
          </span>
          <span>
            <strong>Message us on WhatsApp</strong>
            <span>Usually the fastest way to reach us</span>
          </span>
        </a>
      </div>
    </div>
  );
}
