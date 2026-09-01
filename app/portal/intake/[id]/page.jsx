// app/portal/intake/[id]/page.jsx
// Public, no-login new-client intake form: shared as a link over WhatsApp
// (from the staff Intake page) when someone calls as a first-time client.
// They fill in their own and their pet(s)' details here; it's held for
// staff review, not written straight into clients/patients.

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

function emptyPet() {
  return { name: '', species: '', breed: '', date_of_birth: '', sex: '', microchip_number: '' };
}

export default function IntakePortalPage() {
  const { id } = useParams();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('+971 ');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [emiratesId, setEmiratesId] = useState('');
  const [notes, setNotes] = useState('');
  const [pets, setPets] = useState([emptyPet()]);

  useEffect(() => {
    fetch(`/api/intake-requests/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setRequest(data);
        setLoading(false);
      });
  }, [id]);

  function updatePet(index, field, value) {
    setPets(pets.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  }

  function addPet() {
    setPets([...pets, emptyPet()]);
  }

  function removePet(index) {
    setPets(pets.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!fullName || phone.replace(/\D/g, '').length <= 3) {
      setError('Please enter your name and phone number.');
      return;
    }
    if (pets.length === 0 || pets.some((p) => !p.name || !p.species)) {
      setError("Please give each pet a name and species (dog, cat, ...).");
      return;
    }

    setSubmitting(true);
    const res = await fetch(`/api/intake-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'submit',
        full_name: fullName,
        phone,
        email,
        address,
        emirates_id: emiratesId,
        notes,
        patients: pets,
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error || 'Something went wrong — please try again.');
      return;
    }
    setSubmitted(true);
  }

  if (loading) return <p className="portal-loading">Loading...</p>;
  if (!request || request.error) return <p className="portal-loading">We couldn&apos;t find that page.</p>;

  const alreadyHandled = request.status !== 'pending';

  return (
    <div className="portal-page">
      <header className="portal-header">
        <img src="/logo.png" alt="Europets Clinic" />
        <p className="tagline">Kind, caring, and compassionate veterinary care</p>
      </header>

      {submitted || alreadyHandled ? (
        <div className="portal-card">
          <h1>Thank you!</h1>
          <p>
            We&apos;ve received your details. Our team will review them and reach out to book your visit.
          </p>
        </div>
      ) : (
        <div className="portal-card">
          <h1>Welcome to Europets Clinic</h1>
          <p className="visit-meta">
            Please fill in your details and your pet&apos;s details below — it&apos;ll be ready and
            waiting when you come in.
          </p>

          <form className="card intake-form" onSubmit={handleSubmit}>
            {error && <p className="error">{error}</p>}

            <h2>Your details</h2>
            <label>
              Full name
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </label>
            <label>
              Phone number
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </label>
            <label>
              Email (optional)
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>
              Address (optional)
              <input value={address} onChange={(e) => setAddress(e.target.value)} />
            </label>
            <label>
              Emirates ID number (optional)
              <input value={emiratesId} onChange={(e) => setEmiratesId(e.target.value)} />
            </label>

            <h2>Your pet(s)</h2>
            {pets.map((pet, i) => (
              <div key={i} className="intake-pet">
                {pets.length > 1 && (
                  <button type="button" className="intake-pet-remove" onClick={() => removePet(i)}>
                    Remove
                  </button>
                )}
                <label>
                  Name
                  <input value={pet.name} onChange={(e) => updatePet(i, 'name', e.target.value)} required />
                </label>
                <label>
                  Species
                  <select value={pet.species} onChange={(e) => updatePet(i, 'species', e.target.value)} required>
                    <option value="">Select...</option>
                    <option value="cat">Cat</option>
                    <option value="dog">Dog</option>
                  </select>
                </label>
                <label>
                  Breed (optional)
                  <input value={pet.breed} onChange={(e) => updatePet(i, 'breed', e.target.value)} />
                </label>
                <label>
                  Date of birth (optional)
                  <input
                    type="date"
                    value={pet.date_of_birth}
                    onChange={(e) => updatePet(i, 'date_of_birth', e.target.value)}
                  />
                </label>
                <label>
                  Sex (optional)
                  <select value={pet.sex} onChange={(e) => updatePet(i, 'sex', e.target.value)}>
                    <option value="">Unknown</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="male_castrated">Male (Castrated)</option>
                    <option value="female_spayed">Female (Spayed)</option>
                  </select>
                </label>
                <label>
                  Microchip number (optional)
                  <input
                    value={pet.microchip_number}
                    onChange={(e) => updatePet(i, 'microchip_number', e.target.value)}
                  />
                </label>
              </div>
            ))}
            <button type="button" className="secondary" onClick={addPet}>
              + Add another pet
            </button>

            <label>
              Anything else we should know? (optional)
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </label>

            <button type="submit" disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </form>
        </div>
      )}

      <p className="portal-footer">Europets Clinic</p>
    </div>
  );
}
