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
    description: 'In-house radiology, ultrasound, and laboratory testing for fast, accurate answers.',
  },
  {
    name: 'Surgery',
    description: 'From routine spay/neuter to complex orthopedic procedures, led by our resident surgeons.',
  },
  {
    name: 'Hospitalization',
    description: 'Round-the-clock monitoring and care for patients who need to stay with us, with daily updates for owners.',
  },
  {
    name: 'Grooming & Boarding',
    description: 'A comfortable stay for your pet, whether it is a quick groom or a longer visit while you travel.',
  },
];

export const VETS = [
  { name: 'Dr. Jim Bolssens', role: 'DVM, Owner' },
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
  { href: '/services', label: 'Services' },
  { href: '/team', label: 'Our Team' },
  { href: '/new-patients', label: 'New Patients' },
  { href: '/reviews', label: 'Reviews' },
  { href: '/contact', label: 'Contact' },
];
