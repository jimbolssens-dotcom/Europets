// lib/content.js
// Real clinic content, gathered from the current epc.vet site — kept in
// one place so Home/Contact/Footer never drift out of sync with each
// other. Hours are the one thing worth moving to a live Supabase read
// later (see clinic_settings in the app) since they're the most likely to
// go stale here; everything else changes rarely enough that static is fine.

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://europets-r4mx3sbiv-jimbolssens-dotcom.vercel.app';
export const BOOKING_URL = `${APP_URL}/portal/intake/new`;

export const CONTACT = {
  email: 'info@epc.vet',
  mobile: '050 860 6857',
  mobileHref: '971508606857',
  landline: '06 522 8193',
  address: ['Villa 341, Al Mirgab St.', 'Al Qadisiya', 'Sharjah, UAE'],
};

export const HOURS = {
  days: 'Monday – Sunday',
  reception: '8am – 2pm  |  4pm – 7pm',
  consultations: '9:30am – 10:45am  |  4:30pm – 6:45pm',
  note: 'By appointment only — please complete pet registration before your visit.',
};

export const SERVICES = [
  {
    name: 'Wellness & Vaccinations',
    description: 'Routine check-ups, core and lifestyle vaccinations, and preventive care plans for every life stage.',
  },
  {
    name: 'Dentistry',
    description: 'Cleaning, extractions, and full oral health assessments under safe, monitored anaesthesia.',
  },
  {
    name: 'Diagnostics',
    description:
      'Digital X-ray, ultrasound, endoscopy (gastroscopy, colonoscopy, cystoscopy), and an in-house lab for microscopy, blood work, and PCR testing — most results the same day.',
  },
  {
    name: 'Surgery',
    description:
      'From routine spay/neuter to complex abdominal, intestinal, and orthopedic procedures, led by our resident surgeons.',
  },
  {
    name: 'Hospitalization',
    description:
      'ICU-level care for patients who need to stay with us — IV pumps, heat lamps, and oxygen cages — with daily updates for owners.',
  },
  {
    name: 'Rehabilitation',
    description: 'Laser therapy and hydrotherapy to support recovery after surgery, especially orthopedic procedures.',
  },
];

export const VETS = [
  { name: 'Dr. Jim Bolssens', role: 'DVM, Owner', photo: '/team/jim-bolssens.jpg' },
  { name: 'Dr. Nada', role: 'DVM' },
  { name: 'Dr. Greta', role: 'DVM' },
  { name: 'Dr. Dalma', role: 'DVM' },
  { name: 'Dr. Eva', role: 'DVM' },
];

export const TEAM = [
  { name: 'Arlyn', role: 'Accounts & Admin Manager' },
  { name: 'Tyke', role: 'Vet Assistant' },
  { name: 'Emman', role: 'Vet Assistant' },
  { name: 'Genie', role: 'Receptionist' },
  { name: 'Pam', role: 'Receptionist' },
  { name: 'Niluka', role: 'Staff' },
  { name: 'Kamala', role: 'Staff' },
];

export const NAV_LINKS = [
  { href: '/about', label: 'About' },
  { href: '/services', label: 'Services' },
  { href: '/team', label: 'Our Team' },
  { href: '/new-patients', label: 'New Patients' },
  { href: '/reviews', label: 'Reviews' },
  { href: '/contact', label: 'Contact' },
];

// Founding story + positioning, for the About page (and the Home page
// story teaser). Dr. Jim Bolssens — following his own father into vet
// medicine — moved to the UAE in 2004, saw the need for quality
// veterinary care in Sharjah, and opened Europets as a one-man practice
// in 2005. It has grown into a full team since, but has deliberately
// stayed independently vet-owned rather than joining a corporate group —
// that's a point of pride, not an oversight, and worth saying plainly
// rather than burying in a "since 2005" footnote.
export const STORY = {
  founded: 2005,
  paragraphs: [
    "Dr. Jim Bolssens grew up around veterinary medicine — his father was a vet too — and after moving to the UAE in 2004, he saw a real need for quality veterinary care in Sharjah. He opened Europets Clinic in 2005 as a one-man practice.",
    "Two decades on, that one-man practice has grown into a full team of vets and support staff — but we've stayed a fully independent, veterinarian-owned clinic by choice. No corporate group, no chain playbook. Just the same personal, homely approach we started with, focused on genuinely good care at a reasonable price.",
    "That independence is also what lets us invest in equipment most clinics our size don't have in-house: digital X-ray, ultrasound, endoscopy, and a full in-house lab, alongside the surgical and hospitalization capability to handle far more than routine cases.",
  ],
};

export const EQUIPMENT = [
  { name: 'Digital X-ray', description: 'Fast, detailed imaging read the same day.' },
  { name: 'Ultrasound', description: 'State-of-the-art ultrasound for soft tissue and abdominal imaging.' },
  { name: 'Endoscopy', description: 'Gastroscopy, colonoscopy, and cystoscopy without open surgery.' },
  { name: 'In-house laboratory', description: 'Microscopy, blood work, and PCR testing on site.' },
  { name: 'Full pharmacy', description: 'A full range of medications dispensed directly from the clinic.' },
  { name: 'ICU-level hospitalization', description: 'IV pumps, heat lamps, and oxygen cages for patients who need to stay.' },
];

export const COMMUNITY = {
  heading: "Supporting the UAE's stray community",
  body: "We work closely with the stray cat and dog support community across the UAE, and we're proud to play our part in that effort. It's built into how we operate, not a side promotion — the animals who need it most getting the same standard of care as any other patient.",
};
