// app/client-app/pets/new/page.js
// "Add a pet" in the client app (Jim, 24 Nov): the client puts a new pet
// of their own on file straight away (POST /api/client-app/pets, checked by
// lib/clientNewPet.js), then lands on its page to add a photo. Staff see it
// marked "Added by the client" and check the details at the first visit.

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useClientAppSession } from '@/app/_components/useClientAppSession';
import SpeciesField from '@/app/_components/SpeciesField';
import { CLIENT_PET_SEXES } from '@/lib/clientNewPet';

export default function ClientAppNewPetPage() {
  const { clientId, ready } = useClientAppSession();
  const router = useRouter();
  const [form, setForm] = useState({ name: '', species: '', sex: '', breed: '', color: '', date_of_birth: '', microchip_number: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  useEffect(() => {
    if (ready && !clientId) router.replace('/client-app');
  }, [ready, clientId, router]);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/client-app/pets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not add your pet');
      router.replace(`/client-app/pets/${data.id}?added=1`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  if (!ready) return null;
  return (
    <div className="mobile-page client-app-new-pet">
      <a href="/client-app/pets" className="mobile-link-btn">← My Pets</a>
      <h1>Add a pet</h1>
      <p className="mobile-subtitle">Your pet is added to your account straight away. We&apos;ll check the details with you at the first visit.</p>
      <form className="client-app-new-pet-form" onSubmit={save}>
        <label>
          Name
          <input value={form.name} onChange={set('name')} maxLength={60} required autoComplete="off" />
        </label>
        <label>
          Species
          <SpeciesField value={form.species} onChange={(species) => setForm((f) => ({ ...f, species }))} />
        </label>
        <div className="client-app-new-pet-row">
          <label>
            Sex
            <select value={form.sex} onChange={set('sex')} required>
              <option value="" disabled>Choose…</option>
              {CLIENT_PET_SEXES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>
          <label>
            Date of birth <span className="client-app-optional">(if known)</span>
            <input type="date" value={form.date_of_birth} onChange={set('date_of_birth')} max={new Date().toISOString().slice(0, 10)} />
          </label>
        </div>
        <div className="client-app-new-pet-row">
          <label>
            Breed <span className="client-app-optional">(optional)</span>
            <input value={form.breed} onChange={set('breed')} maxLength={60} />
          </label>
          <label>
            Colour <span className="client-app-optional">(optional)</span>
            <input value={form.color} onChange={set('color')} maxLength={40} />
          </label>
        </div>
        <label>
          Microchip number <span className="client-app-optional">(optional)</span>
          <input value={form.microchip_number} onChange={set('microchip_number')} inputMode="numeric" maxLength={24} placeholder="Usually 15 numbers" />
        </label>
        {error && <p className="client-app-login-error">{error}</p>}
        <button type="submit" className="client-app-cta-btn" disabled={saving}>{saving ? 'Adding…' : 'Add my pet'}</button>
      </form>
    </div>
  );
}
