// app/(admin)/page.js
// Home dashboard. The Clients/Patients quick links were replaced by a
// Find/Add panel — two independent client-only/patient-only search
// fields (SingleTypeSearch, same live-dropdown behavior as the top nav's
// combined SearchBox) plus quick Add Client/Add Patient forms side by
// side. The full Clients/Patients pages (tables, inline edit, phone
// editor, ...) are unchanged and still reachable from the top nav.

'use client';

import { useRouter } from 'next/navigation';
import SingleTypeSearch from '@/app/_components/SingleTypeSearch';
import QuickAddClient from '@/app/_components/QuickAddClient';
import QuickAddPatient from '@/app/_components/QuickAddPatient';

export default function HomePage() {
  const router = useRouter();

  return (
    <div>
      <p className="tagline">Kind, caring, and compassionate veterinary care</p>
      <h1>Europets Clinic</h1>
      <p>Manage clients, patients, appointments, consults, hospitalization, and invoicing.</p>

      <div className="quick-panel">
        <h2>Find</h2>
        <div className="quick-search-row">
          <SingleTypeSearch
            type="client"
            placeholder="Search clients..."
            onPick={(c) => router.push(`/clients/${c.id}`)}
          />
          <SingleTypeSearch
            type="patient"
            placeholder="Search patients..."
            onPick={(p) => router.push(`/patients/${p.id}`)}
          />
        </div>

        <h2>Add</h2>
        <div className="quick-add-row">
          <QuickAddClient />
          <QuickAddPatient />
        </div>
      </div>

      <div className="home-links">
        <a href="/appointments">Appointments</a>
        <a href="/consults">Consults</a>
        <a href="/hospitalization">Hospitalization</a>
        <a href="/vaccinations">Vaccinations</a>
        <a href="/invoices">Invoices</a>
        <a href="/catalog">Catalog</a>
        <a href="/settings">⚙️ Settings</a>
      </div>
    </div>
  );
}
