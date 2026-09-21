import { CONTACT } from '@/lib/content';

export const metadata = { title: 'Privacy Policy - Europets Clinic' };

export default function PrivacyPage() {
  return (
    <div className="section">
      <div className="container">
        <span className="eyebrow">Privacy</span>
        <h1 className="page-title">Privacy Policy</h1>
        <p className="page-lede">Last updated: September 2026</p>

        <div className="about-story">
          <p>
            Europets Clinic (&ldquo;we&rdquo;, &ldquo;us&rdquo;) provides veterinary care in Sharjah, UAE. This
            page explains what information we collect about clients and patients, how we use it, and who we share
            it with.
          </p>

          <h2>Information we collect</h2>
          <p>When you register as a client or book an appointment, we collect information such as:</p>
          <ul>
            <li>Your name, phone number, and email address</li>
            <li>Your pet&apos;s name, species, breed, and medical history</li>
            <li>Appointment, consultation, treatment, and billing records</li>
            <li>Messages you send us through this website, our client app, or WhatsApp</li>
            <li>Photos you or our staff add to your pet&apos;s file (e.g. for a hospitalization update)</li>
          </ul>

          <h2>How we use it</h2>
          <p>We use this information to:</p>
          <ul>
            <li>Provide veterinary care and keep accurate medical records for your pet</li>
            <li>Book, confirm, and remind you of appointments</li>
            <li>Send invoices and process payments</li>
            <li>Reply to questions you send us, including over WhatsApp</li>
            <li>Improve how our clinic communicates with and serves clients</li>
          </ul>

          <h2>WhatsApp and messaging</h2>
          <p>
            If you message us on WhatsApp, that conversation is handled through Meta&apos;s WhatsApp Business
            Platform and kept as part of your client record, the same way a phone call or an in-app message would
            be. We use it to answer your questions, confirm bookings, and keep a record of what was discussed
            about your pet&apos;s care. We do not use your WhatsApp number for marketing you haven&apos;t agreed
            to, and we don&apos;t share it with anyone outside the clinic except the service providers below.
          </p>

          <h2>Who we share information with</h2>
          <p>We don&apos;t sell your information. We share it only with the service providers that help us run the clinic:</p>
          <ul>
            <li>Our practice management and hosting providers, who store your records securely on our behalf</li>
            <li>Meta&apos;s WhatsApp Business Platform, if you message us there</li>
            <li>Payment processors, when you pay an invoice online</li>
            <li>An AI transcription service we use to help our vets keep accurate consultation notes</li>
          </ul>
          <p>Each of these only receives what it needs to do its part, and none of them may use your data for their own purposes.</p>

          <h2>How long we keep it</h2>
          <p>
            We keep client and patient records for as long as you remain a client and for a reasonable period
            afterward, in line with standard veterinary record-keeping practice and UAE law.
          </p>

          <h2>Your rights</h2>
          <p>
            You can ask us what information we hold about you or your pet, ask us to correct it, or ask us to
            delete it where we&apos;re not required to keep it (for example, for medical record-keeping or
            billing purposes). Contact us using the details below.
          </p>

          <h2>Contact us</h2>
          <p>
            If you have questions about this policy or how we handle your information, reach out:
          </p>
          <p>
            <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
            <br />
            {CONTACT.address.join(', ')}
          </p>
        </div>
      </div>
    </div>
  );
}
