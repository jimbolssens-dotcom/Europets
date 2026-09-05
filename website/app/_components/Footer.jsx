import { CONTACT, HOURS, NAV_LINKS } from '@/lib/content';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div>
          <span className="footer-logo-chip">
            <img src="/logo.png" alt="Europets Clinic" />
          </span>
          <p className="footer-tagline">Kind, caring, and compassionate veterinary care in Sharjah since 2005.</p>
        </div>

        <div>
          <h3 className="footer-heading">Visit</h3>
          {CONTACT.address.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>

        <div>
          <h3 className="footer-heading">Contact</h3>
          <p>
            <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
          </p>
          <p>
            <a href={`https://wa.me/${CONTACT.mobileHref}`}>{CONTACT.mobile}</a>
          </p>
          <p>{CONTACT.landline}</p>
        </div>

        <div>
          <h3 className="footer-heading">Hours</h3>
          <p>{HOURS.days}</p>
          <p>{HOURS.reception}</p>
        </div>

        <div>
          <h3 className="footer-heading">Explore</h3>
          {NAV_LINKS.map((link) => (
            <p key={link.href}>
              <a href={link.href}>{link.label}</a>
            </p>
          ))}
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} Europets Clinic</span>
      </div>
    </footer>
  );
}
