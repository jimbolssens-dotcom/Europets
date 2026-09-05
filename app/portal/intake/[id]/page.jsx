// app/portal/intake/[id]/page.jsx
// Public, no-login form: shared as a link over WhatsApp.
//
// Two modes, detected from whether the link came pre-tied to a client
// (see POST /api/intake-requests and app/(admin)/clients/[id]'s "Send
// Booking Link"):
//   - Brand-new client (no client_id yet): fill in owner + pet(s) details,
//     same as always.
//   - Existing client (client_id already set): owner details are skipped
//     entirely — the server only ever sends back *this* client's own pets
//     (see the GET route), never anyone else's, so picking one here can't
//     leak another client's data. Add a new pet instead if the one they
//     want isn't listed.
//
// Either way, once exactly one pet is in play, they can optionally
// request a 15-min consult or a standard spay/castration slot — anything
// else isn't self-bookable, they're told to contact the clinic directly.
// Submitting holds everything for staff review, same as a plain intake.

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import SpeciesField from '@/app/_components/SpeciesField';
import { CLIENT_APPOINTMENT_TYPE_LABELS, clientBookingDurationMinutes } from '@/lib/appointmentBooking';

function emptyPet() {
  return { name: '', species: '', breed: '', date_of_birth: '', sex: '', microchip_number: '', weight_kg: '' };
}

function todayISODate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

  // Existing-client mode only: which of their own pets was picked, or
  // 'new' to show the add-a-pet fields (exactly one, not a repeatable list
  // like the brand-new-client form — an appointment request only ever
  // concerns one pet anyway).
  const [petChoice, setPetChoice] = useState(null);

  const [wantsAppointment, setWantsAppointment] = useState(false);
  const [appointmentType, setAppointmentType] = useState('consult');
  const [appointmentDate, setAppointmentDate] = useState(todayISODate());
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);

  useEffect(() => {
    fetch(`/api/intake-requests/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setRequest(data);
        setLoading(false);
      });
  }, [id]);

  const isExistingClient = Boolean(request?.client_id);
  const ownPatients = request?.clients?.patients || [];

  function updatePet(index, field, value) {
    setPets(pets.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  }

  function addPet() {
    setPets([...pets, emptyPet()]);
  }

  function removePet(index) {
    setPets(pets.filter((_, i) => i !== index));
  }

  // The one pet this submission concerns, for appointment purposes —
  // null unless exactly one is in play (existing-client mode: their
  // selection; new-client mode: only when they're registering exactly
  // one pet, since a request needs a single patient to book for).
  const bookingPet = useMemo(() => {
    if (isExistingClient) {
      if (petChoice === 'new') return pets[0]?.name && pets[0]?.species ? pets[0] : null;
      const existing = ownPatients.find((p) => p.id === petChoice);
      return existing ? { ...existing, weight_kg: existing.current_weight_kg } : null;
    }
    return pets.length === 1 && pets[0].name && pets[0].species ? pets[0] : null;
  }, [isExistingClient, petChoice, pets, ownPatients]);

  const computedDuration = bookingPet
    ? clientBookingDurationMinutes(appointmentType, bookingPet.species, bookingPet.weight_kg)
    : null;

  useEffect(() => {
    setSelectedSlot(null);
    if (!wantsAppointment || !bookingPet || !computedDuration) {
      setSlots([]);
      return;
    }
    setLoadingSlots(true);
    setSlotsError(null);
    const params = new URLSearchParams({
      date: appointmentDate,
      type: appointmentType,
      species: bookingPet.species || '',
      weight_kg: bookingPet.weight_kg || '',
    });
    fetch(`/api/booking-availability?${params}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setSlotsError(data.error);
          setSlots([]);
        } else {
          setSlots(data.slots || []);
        }
      })
      .catch(() => setSlotsError('Could not load availability — please try again.'))
      .finally(() => setLoadingSlots(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsAppointment, appointmentDate, appointmentType, bookingPet?.species, bookingPet?.weight_kg]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!isExistingClient) {
      if (!fullName || phone.replace(/\D/g, '').length <= 3) {
        setError('Please enter your name and phone number.');
        return;
      }
      if (pets.length === 0 || pets.some((p) => !p.name || !p.species)) {
        setError("Please give each pet a name and species (dog, cat, ...).");
        return;
      }
    } else {
      if (!petChoice) {
        setError('Please select one of your pets, or add a new one.');
        return;
      }
      if (petChoice === 'new' && (!pets[0]?.name || !pets[0]?.species)) {
        setError("Please give your pet a name and species (dog, cat, ...).");
        return;
      }
    }
    if (wantsAppointment && (!bookingPet || !selectedSlot)) {
      setError('Please pick an appointment slot, or turn off "Request an appointment" to just submit your details.');
      return;
    }

    const newPetsToSubmit = isExistingClient ? (petChoice === 'new' ? [pets[0]] : []) : pets;
    const selectedPatientId = isExistingClient && petChoice !== 'new' ? petChoice : null;

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
        patients: newPetsToSubmit,
        selected_patient_id: selectedPatientId,
        ...(wantsAppointment && selectedSlot
          ? {
              appointment_type: appointmentType,
              requested_vet_id: selectedSlot.vet_id,
              requested_start_time: selectedSlot.start_time,
              requested_duration_minutes: selectedSlot.duration_minutes,
            }
          : {}),
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
            We&apos;ve received your details{wantsAppointment && selectedSlot ? ' and your appointment request' : ''}.
            Our team will review {wantsAppointment && selectedSlot ? 'and confirm it' : 'them and reach out to book your visit'}.
          </p>
        </div>
      ) : (
        <div className="portal-card">
          <h1>{isExistingClient ? `Welcome back, ${request.clients?.full_name}!` : 'Welcome to Europets Clinic'}</h1>
          <p className="visit-meta">
            {isExistingClient
              ? 'Pick your pet below (or add a new one), then request an appointment if you’d like.'
              : "Please fill in your details and your pet's details below — it'll be ready and waiting when you come in."}
          </p>

          <form className="card intake-form" onSubmit={handleSubmit}>
            {error && <p className="error">{error}</p>}

            {!isExistingClient && (
              <>
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
              </>
            )}

            {isExistingClient ? (
              <>
                <h2>Your pet</h2>
                {ownPatients.map((p) => (
                  <label key={p.id} className="intake-pet-choice">
                    <input
                      type="radio"
                      name="pet-choice"
                      checked={petChoice === p.id}
                      onChange={() => setPetChoice(p.id)}
                    />
                    {p.name} — {p.species}
                    {p.breed ? ` (${p.breed})` : ''}
                  </label>
                ))}
                <label className="intake-pet-choice">
                  <input
                    type="radio"
                    name="pet-choice"
                    checked={petChoice === 'new'}
                    onChange={() => setPetChoice('new')}
                  />
                  + Add a new pet
                </label>

                {petChoice === 'new' && (
                  <div className="intake-pet">
                    <label>
                      Name
                      <input value={pets[0].name} onChange={(e) => updatePet(0, 'name', e.target.value)} required />
                    </label>
                    <label>
                      Species
                      <SpeciesField value={pets[0].species} onChange={(species) => updatePet(0, 'species', species)} />
                    </label>
                    <label>
                      Breed (optional)
                      <input value={pets[0].breed} onChange={(e) => updatePet(0, 'breed', e.target.value)} />
                    </label>
                    <label>
                      Weight in kg (optional — helps us schedule the right amount of time)
                      <input
                        type="number"
                        step="0.1"
                        value={pets[0].weight_kg}
                        onChange={(e) => updatePet(0, 'weight_kg', e.target.value)}
                      />
                    </label>
                    <label>
                      Date of birth (optional)
                      <input
                        type="date"
                        value={pets[0].date_of_birth}
                        onChange={(e) => updatePet(0, 'date_of_birth', e.target.value)}
                      />
                    </label>
                    <label>
                      Sex (optional)
                      <select value={pets[0].sex} onChange={(e) => updatePet(0, 'sex', e.target.value)}>
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
                        value={pets[0].microchip_number}
                        onChange={(e) => updatePet(0, 'microchip_number', e.target.value)}
                      />
                    </label>
                  </div>
                )}
              </>
            ) : (
              <>
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
                      <SpeciesField value={pet.species} onChange={(species) => updatePet(i, 'species', species)} />
                    </label>
                    <label>
                      Breed (optional)
                      <input value={pet.breed} onChange={(e) => updatePet(i, 'breed', e.target.value)} />
                    </label>
                    <label>
                      Weight in kg (optional — helps us schedule the right amount of time)
                      <input
                        type="number"
                        step="0.1"
                        value={pet.weight_kg}
                        onChange={(e) => updatePet(i, 'weight_kg', e.target.value)}
                      />
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
              </>
            )}

            {bookingPet && (
              <div className="intake-appointment">
                <h2>Request an appointment (optional)</h2>
                <label className="intake-pet-choice">
                  <input
                    type="checkbox"
                    checked={wantsAppointment}
                    onChange={(e) => setWantsAppointment(e.target.checked)}
                  />
                  I&apos;d like to request an appointment for {bookingPet.name} now
                </label>

                {wantsAppointment && (
                  <>
                    <label>
                      Appointment type
                      <select value={appointmentType} onChange={(e) => setAppointmentType(e.target.value)}>
                        {Object.entries(CLIENT_APPOINTMENT_TYPE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="visit-meta">
                      {computedDuration ? `This will need about ${computedDuration} minutes.` : ''} Need something
                      more involved than a standard consult, spay, or castration? Please contact the clinic
                      directly instead of booking here.
                    </p>
                    <label>
                      Date
                      <input
                        type="date"
                        min={todayISODate()}
                        value={appointmentDate}
                        onChange={(e) => setAppointmentDate(e.target.value)}
                      />
                    </label>

                    {loadingSlots && <p className="visit-meta">Checking availability...</p>}
                    {slotsError && <p className="error">{slotsError}</p>}
                    {!loadingSlots && !slotsError && slots.length === 0 && (
                      <p className="visit-meta">No open slots that day — try another date.</p>
                    )}
                    {slots.length > 0 && (
                      <div className="intake-slot-grid">
                        {slots.map((slot) => {
                          const isSelected =
                            selectedSlot &&
                            selectedSlot.vet_id === slot.vet_id &&
                            selectedSlot.start_time === slot.start_time;
                          return (
                            <button
                              type="button"
                              key={`${slot.vet_id}-${slot.start_time}`}
                              className={`intake-slot-button${isSelected ? ' intake-slot-selected' : ''}`}
                              onClick={() => setSelectedSlot(slot)}
                            >
                              {new Date(slot.start_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                              <br />
                              {slot.vet_name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

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
