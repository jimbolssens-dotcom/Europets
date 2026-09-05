import { BOOKING_URL, SERVICES } from '@/lib/content';

export const metadata = { title: 'Services — Europets Clinic' };

const DETAILS = {
  'Wellness & Vaccinations': [
    'Puppy & kitten wellness plans',
    'Core and lifestyle vaccinations',
    'Annual health check-ups',
    'Parasite prevention',
  ],
  Dentistry: ['Scale & polish', 'Extractions', 'Oral health assessments', 'Monitored anaesthesia'],
  Diagnostics: [
    'Digital X-ray',
    'State-of-the-art ultrasound',
    'Endoscopy (gastroscopy, colonoscopy, cystoscopy)',
    'In-house lab: microscopy, blood work, PCR testing',
  ],
  Surgery: ['Spay & neuter', 'Abdominal & intestinal surgery', 'Orthopedic surgery', 'Occasional hematologic surgery'],
  Hospitalization: ['IV pumps', 'Heat lamps', 'Oxygen cages', 'Daily updates for owners'],
  Rehabilitation: ['Laser therapy', 'Hydrotherapy', 'Post-op & orthopedic recovery plans'],
};

export default function ServicesPage() {
  return (
    <div className="section">
      <div className="container">
        <span className="eyebrow">What we treat</span>
        <h1 className="page-title">Complete care, under one roof</h1>
        <p className="page-lede">
          From routine wellness visits to complex surgery, our team offers all major veterinary services in-house —
          so your pet gets seen, diagnosed, and treated without being sent elsewhere.
        </p>

        <div className="services-list">
          {SERVICES.map((s) => (
            <div key={s.name} className="card services-list-item">
              <div>
                <h2>{s.name}</h2>
                <p>{s.description}</p>
              </div>
              <ul>
                {(DETAILS[s.name] || []).map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="services-cta card">
          <h2>Not sure what your pet needs?</h2>
          <p>Book a consultation and our vets will guide you from there.</p>
          <a href={BOOKING_URL} className="btn btn-primary">
            Book an Appointment
          </a>
        </div>
      </div>
    </div>
  );
}
